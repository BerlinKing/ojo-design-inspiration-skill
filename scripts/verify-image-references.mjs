#!/usr/bin/env node

import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateReferenceMedia } from "./reference-media-contract.mjs";

const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;
const DEFAULT_MIN_WIDTH = 200;
const DEFAULT_MIN_HEIGHT = 120;

function uint24le(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function inspectPng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const trailer = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  if (buffer.length < 32 || !buffer.subarray(0, 8).equals(signature)) return null;
  if (buffer.toString("ascii", 12, 16) !== "IHDR" || !buffer.subarray(-8).equals(trailer)) return null;
  return { mimeType: "image/png", extension: ".png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function inspectGif(buffer) {
  const header = buffer.toString("ascii", 0, 6);
  if (buffer.length < 14 || !["GIF87a", "GIF89a"].includes(header) || buffer.at(-1) !== 0x3b) return null;
  return { mimeType: "image/gif", extension: ".gif", width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function inspectJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer.at(-2) !== 0xff || buffer.at(-1) !== 0xd9) return null;

  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0xff || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) return null;
    if (sofMarkers.has(marker) && segmentLength >= 7) {
      return {
        mimeType: "image/jpeg",
        extension: ".jpg",
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function inspectWebp(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  if (buffer.readUInt32LE(4) + 8 > buffer.length) return null;

  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return { mimeType: "image/webp", extension: ".webp", width: uint24le(buffer, 24) + 1, height: uint24le(buffer, 27) + 1 };
  }
  if (chunk === "VP8L" && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return { mimeType: "image/webp", extension: ".webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8 " && buffer.toString("hex", 23, 26) === "9d012a") {
    return {
      mimeType: "image/webp",
      extension: ".webp",
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  return null;
}

export function inspectImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError("Image input must be a Buffer.");
  return inspectPng(buffer) ?? inspectJpeg(buffer) ?? inspectGif(buffer) ?? inspectWebp(buffer);
}

function normalizeHttpUrl(rawValue, fieldName) {
  try {
    const url = new URL(String(rawValue ?? "").trim());
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    if (url.username || url.password) throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${fieldName} must be an HTTP or HTTPS URL`);
  }
}

function isPrivateOrReservedAddress(address) {
  if (net.isIPv4(address)) {
    const octets = address.split(".").map(Number);
    const [a, b, c] = octets;
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && [0, 2].includes(c)) ||
      (a === 192 && b === 168) ||
      (a === 198 && [18, 19].includes(b)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized)) return true;
    if (normalized.startsWith("2001:db8:")) return true;
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isPrivateOrReservedAddress(mapped) : false;
  }
  return true;
}

async function assertPublicHttpUrl(rawUrl, allowPrivateNetwork) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("image redirect must use HTTP or HTTPS");
  if (allowPrivateNetwork) return url;
  if (["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase()) || url.hostname.endsWith(".local")) {
    throw new Error("image URL resolves to a local or private host");
  }
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateOrReservedAddress(address))) {
    throw new Error("image URL resolves to a local, private, or reserved address");
  }
  return url;
}

async function fetchImageResponse(rawUrl, options) {
  let currentUrl = rawUrl;
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const checkedUrl = await assertPublicHttpUrl(currentUrl, options.allowPrivateNetwork);
    const response = await fetch(checkedUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: { "user-agent": "ojo-design-inspiration-skill/1.0 image-verifier" },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error(`image redirect ${response.status} has no location`);
    await response.body?.cancel();
    currentUrl = new URL(location, checkedUrl).toString();
  }
  throw new Error("image request exceeded 5 redirects");
}

function isWithinDirectory(filePath, directory) {
  const relative = path.relative(directory, filePath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function readLimitedResponse(response, maxBytes) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error(`image exceeds ${maxBytes} bytes`);
  if (!response.body) throw new Error("image response has no body");

  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxBytes) throw new Error(`image exceeds ${maxBytes} bytes`);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function acquireImage(candidate, options) {
  const rawReference = String(candidate.previewImageUrl ?? candidate.imageUrl ?? "").trim();
  if (!rawReference) throw new Error("missing previewImageUrl");

  if (path.isAbsolute(rawReference)) {
    const localPath = await fsPromises.realpath(path.resolve(rawReference)).catch(() => path.resolve(rawReference));
    if (!isWithinDirectory(localPath, options.artifactDir)) {
      throw new Error("local preview image must be inside artifactDir");
    }
    const stats = await fsPromises.stat(localPath).catch(() => null);
    if (!stats?.isFile()) throw new Error("local preview image does not exist or is not a regular file");
    if (stats.size > options.maxBytes) throw new Error(`image exceeds ${options.maxBytes} bytes`);
    return { buffer: await fsPromises.readFile(localPath), originalReference: localPath, localPath };
  }

  const remoteUrl = normalizeHttpUrl(rawReference, "previewImageUrl");
  const response = await fetchImageResponse(remoteUrl, options);
  if (!response.ok) throw new Error(`image request returned HTTP ${response.status}`);
  const rawMimeType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
  const declaredMimeType = rawMimeType === "image/jpg" || rawMimeType === "image/pjpeg" ? "image/jpeg" : rawMimeType;
  if (!declaredMimeType.startsWith("image/")) throw new Error(`image response has non-image content type: ${declaredMimeType || "missing"}`);
  return {
    buffer: await readLimitedResponse(response, options.maxBytes),
    declaredMimeType,
    originalReference: remoteUrl,
  };
}

function safeArtifactStem(candidate, index) {
  const stem = String(candidate.id ?? candidate.title ?? `reference-${index + 1}`)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return stem || `reference-${index + 1}`;
}

export async function verifyImageCandidate(candidate, options, index = 0) {
  const sourceUrl = normalizeHttpUrl(candidate.sourceUrl ?? candidate.url, "sourceUrl");
  const imageAlt = String(candidate.imageAlt ?? "").trim();
  if (!imageAlt) throw new Error("imageAlt is required");
  const mediaContract = validateReferenceMedia(candidate);
  if (!mediaContract.eligible) throw new Error(`invalid reference media: ${mediaContract.reasons.join(" | ")}`);

  const acquired = await acquireImage(candidate, options);
  const inspected = inspectImageBuffer(acquired.buffer);
  if (!inspected) throw new Error("image bytes are not a supported PNG, JPEG, GIF, or WebP file");
  if (acquired.declaredMimeType && acquired.declaredMimeType !== inspected.mimeType) {
    throw new Error(`image MIME mismatch: declared ${acquired.declaredMimeType}, detected ${inspected.mimeType}`);
  }
  if (inspected.width < options.minWidth || inspected.height < options.minHeight) {
    throw new Error(`image dimensions ${inspected.width}x${inspected.height} are below ${options.minWidth}x${options.minHeight}`);
  }

  const sha256 = crypto.createHash("sha256").update(acquired.buffer).digest("hex");
  const artifactPath = acquired.localPath ?? path.join(options.artifactDir, `${safeArtifactStem(candidate, index)}-${sha256.slice(0, 12)}${inspected.extension}`);
  if (!acquired.localPath) await fsPromises.writeFile(artifactPath, acquired.buffer, { flag: "wx" }).catch(async (error) => {
    if (error?.code !== "EEXIST") throw error;
    const existing = await fsPromises.readFile(artifactPath);
    if (!existing.equals(acquired.buffer)) throw new Error("artifact path collision");
  });

  return {
    ...candidate,
    sourceUrl,
    previewImageUrl: path.resolve(artifactPath),
    ...mediaContract.normalized,
    imageAlt,
    imageDelivery: {
      kind: "verified-local-artifact",
      artifactPath: path.resolve(artifactPath),
      mimeType: inspected.mimeType,
    },
    imageVerification: {
      status: "verified",
      originalReference: acquired.originalReference,
      artifactPath: path.resolve(artifactPath),
      mimeType: inspected.mimeType,
      width: inspected.width,
      height: inspected.height,
      bytes: acquired.buffer.length,
      sha256,
      checkedAt: new Date().toISOString(),
    },
  };
}

export async function verifyImageCandidates(rawCandidates, rawOptions = {}) {
  const options = {
    artifactDir: path.resolve(rawOptions.artifactDir),
    maxBytes: Number(rawOptions.maxBytes ?? DEFAULT_MAX_BYTES),
    minWidth: Number(rawOptions.minWidth ?? DEFAULT_MIN_WIDTH),
    minHeight: Number(rawOptions.minHeight ?? DEFAULT_MIN_HEIGHT),
    timeoutMs: Number(rawOptions.timeoutMs ?? 15_000),
    allowPrivateNetwork: rawOptions.allowPrivateNetwork === true,
  };
  await fsPromises.mkdir(options.artifactDir, { recursive: true });
  options.artifactDir = await fsPromises.realpath(options.artifactDir);

  const candidates = [];
  const rejected = [];
  for (const [index, candidate] of rawCandidates.entries()) {
    try {
      candidates.push(await verifyImageCandidate(candidate, options, index));
    } catch (error) {
      rejected.push({ id: candidate?.id ?? `candidate-${index + 1}`, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { summary: { inputCount: rawCandidates.length, verifiedCount: candidates.length, rejectedCount: rejected.length }, candidates, rejected };
}

function parseArguments(argv) {
  const options = { input: "", output: "", artifactDir: "", maxBytes: DEFAULT_MAX_BYTES, minWidth: DEFAULT_MIN_WIDTH, minHeight: DEFAULT_MIN_HEIGHT, timeoutMs: 15_000 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--input" && value) options.input = value;
    if (argument === "--output" && value) options.output = value;
    if (argument === "--artifact-dir" && value) options.artifactDir = value;
    if (argument === "--max-bytes" && value) options.maxBytes = Number(value);
    if (argument === "--min-width" && value) options.minWidth = Number(value);
    if (argument === "--min-height" && value) options.minHeight = Number(value);
    if (argument === "--timeout-ms" && value) options.timeoutMs = Number(value);
    if (["--input", "--output", "--artifact-dir", "--max-bytes", "--min-width", "--min-height", "--timeout-ms"].includes(argument)) index += 1;
  }
  return options;
}

async function runCli() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.input || !options.artifactDir) {
    throw new Error("Usage: verify-image-references.mjs --input <candidates.json> --artifact-dir <directory> [--output <verified.json>]");
  }
  const parsed = JSON.parse(await fsPromises.readFile(path.resolve(options.input), "utf8"));
  const rawCandidates = Array.isArray(parsed) ? parsed : parsed.candidates;
  if (!Array.isArray(rawCandidates)) throw new Error("Input JSON must be an array or an object with a candidates array.");

  const result = await verifyImageCandidates(rawCandidates, options);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (options.output) await fsPromises.writeFile(path.resolve(options.output), serialized);
  else process.stdout.write(serialized);
  if (result.rejected.length > 0) process.exitCode = 2;
}

const isDirectRun = (() => {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();
if (isDirectRun) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export const defaults = Object.freeze({ maxBytes: DEFAULT_MAX_BYTES, minWidth: DEFAULT_MIN_WIDTH, minHeight: DEFAULT_MIN_HEIGHT });
