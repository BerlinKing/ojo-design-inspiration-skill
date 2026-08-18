#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateReferenceMedia } from "./reference-media-contract.mjs";

const SCORE_WEIGHTS = Object.freeze({
  surfaceFit: 0.25,
  subjectFit: 0.25,
  visualCueFit: 0.2,
  toneFit: 0.15,
  transferability: 0.1,
  evidenceQuality: 0.05,
});

const REFERENCE_ROLES = new Set(["core", "pattern", "mood"]);

const ROLE_THRESHOLDS = Object.freeze({
  core: Object.freeze({ surfaceFit: 3, subjectFit: 3, visualCueFit: 3, mustMatchHits: 2 }),
  pattern: Object.freeze({ surfaceFit: 3, transferability: 4, mustMatchHits: 1 }),
  mood: Object.freeze({ toneFit: 4, visualCueFit: 2, mustMatchHits: 1 }),
});

const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "source",
]);

export function canonicalizeUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") return "";

  try {
    const url = new URL(rawUrl.trim());
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");

    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    url.searchParams.sort();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");

    return url.toString();
  } catch {
    return "";
  }
}

export function isVerifiedImageReference(candidate) {
  const value = String(candidate?.previewImageUrl ?? candidate?.imageUrl ?? "").trim();
  const verification = candidate?.imageVerification;
  const delivery = candidate?.imageDelivery;
  if (!path.isAbsolute(value) || verification?.status !== "verified") return false;
  if (delivery?.kind !== "verified-local-artifact" || path.resolve(String(delivery.artifactPath ?? "")) !== path.resolve(value)) return false;
  if (path.resolve(value) !== path.resolve(String(verification.artifactPath ?? ""))) return false;
  if (!verification.mimeType?.startsWith("image/") || !verification.width || !verification.height || !verification.sha256) return false;

  try {
    const stats = fs.statSync(value);
    if (!stats.isFile() || stats.size !== verification.bytes) return false;
    const digest = crypto.createHash("sha256").update(fs.readFileSync(value)).digest("hex");
    return digest === verification.sha256;
  } catch {
    return false;
  }
}

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(5, Math.max(0, numeric));
}

export function scoreCandidate(candidate) {
  const scores = candidate?.scores ?? {};
  const weighted = Object.entries(SCORE_WEIGHTS).reduce(
    (sum, [key, weight]) => sum + clampScore(scores[key]) * weight,
    0,
  );

  return Math.round((weighted / 5) * 1000) / 10;
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function validateCandidateRelevance(candidate) {
  const referenceRole = String(candidate?.referenceRole ?? "").trim();
  const visibleEvidence = stringArray(candidate?.visibleEvidence);
  const mustMatchHits = stringArray(candidate?.mustMatchHits);
  const hardViolations = stringArray(candidate?.hardViolations);
  const reasons = [];
  const mediaContract = validateReferenceMedia(candidate);
  reasons.push(...mediaContract.reasons);

  if (!REFERENCE_ROLES.has(referenceRole)) {
    reasons.push("missing or invalid referenceRole; expected core, pattern, or mood");
  }

  if (visibleEvidence.length < 2) {
    reasons.push("fewer than two concrete visibleEvidence observations");
  }

  if (hardViolations.length > 0) {
    reasons.push(`hard visual violations: ${hardViolations.join("; ")}`);
  }

  const thresholds = ROLE_THRESHOLDS[referenceRole];
  if (thresholds) {
    for (const [key, minimum] of Object.entries(thresholds)) {
      if (key === "mustMatchHits") {
        if (mustMatchHits.length < minimum) {
          reasons.push(`${referenceRole} requires at least ${minimum} mustMatchHits`);
        }
        continue;
      }

      const actual = clampScore(candidate?.scores?.[key]);
      if (actual < minimum) {
        reasons.push(`${referenceRole} requires ${key} >= ${minimum}; received ${actual}`);
      }
    }
  }

  return { eligible: reasons.length === 0, reasons };
}

function normalizeIdentityPart(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function projectIdentity(candidate) {
  const title = normalizeIdentityPart(candidate.title);
  const creator = normalizeIdentityPart(candidate.creator ?? candidate.publisher);
  return title && creator ? `project:${creator}|${title}` : "";
}

function normalizeCandidate(candidate, index) {
  const sourceUrl = candidate.sourceUrl ?? candidate.url ?? "";
  const canonicalUrl = canonicalizeUrl(sourceUrl);
  const previewImageUrl = String(candidate.previewImageUrl ?? candidate.imageUrl ?? "").trim();
  const totalScore = scoreCandidate(candidate);

  return {
    ...candidate,
    id: candidate.id ?? `candidate-${String(index + 1).padStart(2, "0")}`,
    sourceUrl,
    canonicalUrl,
    previewImageUrl,
    sourceFamily: candidate.sourceFamily ?? "unknown",
    searchLane: candidate.searchLane ?? "unknown",
    referenceRole: String(candidate.referenceRole ?? "").trim(),
    referenceTarget: String(candidate.referenceTarget ?? "").trim(),
    imageKind: String(candidate.imageKind ?? "").trim(),
    formalAssetAvailable: candidate.formalAssetAvailable,
    captureJustification: String(candidate.captureJustification ?? "").trim(),
    visibleEvidence: stringArray(candidate.visibleEvidence),
    mustMatchHits: stringArray(candidate.mustMatchHits),
    hardViolations: stringArray(candidate.hardViolations),
    mismatchRisks: stringArray(candidate.mismatchRisks),
    totalScore,
  };
}

function integerOption(value, fallback, minimum = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.floor(numeric));
}

export function selectCandidates(rawCandidates, options = {}) {
  const limit = integerOption(options.limit, 8, 1);
  const maxPerFamily = integerOption(options.maxPerFamily, 3, 1);
  const defaultMinCore = Math.min(limit, Math.max(3, Math.ceil(limit / 2)));
  const minCore = Math.min(limit, integerOption(options.minCore, defaultMinCore, 0));
  const maxMood = integerOption(options.maxMood, 1, 0);
  const normalized = rawCandidates
    .map(normalizeCandidate)
    .sort((a, b) => b.totalScore - a.totalScore || String(a.title).localeCompare(String(b.title)));
  const rejected = [];
  const duplicates = [];
  const unique = [];
  const seenUrls = new Map();
  const seenProjects = new Map();

  for (const candidate of normalized) {
    if (!candidate.canonicalUrl) {
      rejected.push({ id: candidate.id, reason: "missing or invalid canonical source URL" });
      continue;
    }

    if (!isVerifiedImageReference(candidate)) {
      rejected.push({ id: candidate.id, reason: "image was not materialized and verified by verify-image-references.mjs" });
      continue;
    }

    const relevance = validateCandidateRelevance(candidate);
    if (!relevance.eligible) {
      rejected.push({ id: candidate.id, reason: relevance.reasons.join(" | ") });
      continue;
    }

    const projectKey = projectIdentity(candidate);
    const urlMatch = seenUrls.get(candidate.canonicalUrl);
    const projectMatch = projectKey ? seenProjects.get(projectKey) : undefined;
    const existing = urlMatch ?? projectMatch;

    if (existing) {
      duplicates.push({
        droppedId: candidate.id,
        keptId: existing.id,
        reason: urlMatch ? `url:${candidate.canonicalUrl}` : projectKey,
      });
      continue;
    }

    unique.push(candidate);
    seenUrls.set(candidate.canonicalUrl, candidate);
    if (projectKey) seenProjects.set(projectKey, candidate);
  }

  const ranked = unique;
  const selected = [];
  const selectedIds = new Set();
  const familyCounts = new Map();
  const roleCounts = new Map();

  const canSelect = (candidate) =>
    !selectedIds.has(candidate.id) &&
    (familyCounts.get(candidate.sourceFamily) ?? 0) < maxPerFamily &&
    (candidate.referenceRole !== "mood" || (roleCounts.get("mood") ?? 0) < maxMood) &&
    selected.length < limit;

  const add = (candidate) => {
    selected.push(candidate);
    selectedIds.add(candidate.id);
    familyCounts.set(candidate.sourceFamily, (familyCounts.get(candidate.sourceFamily) ?? 0) + 1);
    roleCounts.set(candidate.referenceRole, (roleCounts.get(candidate.referenceRole) ?? 0) + 1);
  };

  for (const candidate of ranked) {
    if ((roleCounts.get("core") ?? 0) >= minCore) break;
    if (candidate.referenceRole === "core" && canSelect(candidate)) add(candidate);
  }

  for (const candidate of ranked) {
    if (canSelect(candidate)) add(candidate);
  }

  const selectedCoreCount = roleCounts.get("core") ?? 0;
  const selectedMoodCount = roleCounts.get("mood") ?? 0;
  const qualityShortfalls = [];
  if (selected.length < limit) qualityShortfalls.push(`selected ${selected.length} of requested ${limit} references`);
  if (selectedCoreCount < minCore) qualityShortfalls.push(`selected ${selectedCoreCount} of required ${minCore} core references`);
  if (selectedMoodCount > maxMood) qualityShortfalls.push(`selected ${selectedMoodCount} mood references; maximum is ${maxMood}`);

  return {
    summary: {
      inputCount: rawCandidates.length,
      uniqueCount: ranked.length,
      selectedCount: selected.length,
      duplicateCount: duplicates.length,
      rejectedCount: rejected.length,
      imageRejectedCount: rejected.filter((item) => item.reason.includes("image")).length,
      relevanceRejectedCount: rejected.filter((item) => !item.reason.includes("source URL") && !item.reason.includes("image was not")).length,
      selectedCoreCount,
      requiredCoreCount: minCore,
      selectedMoodCount,
      maximumMoodCount: maxMood,
      complete: qualityShortfalls.length === 0,
    },
    selected: selected.map((candidate, index) => ({ rank: index + 1, ...candidate })),
    duplicates,
    rejected,
    qualityShortfalls,
  };
}

function parseArguments(argv) {
  const options = { input: "", output: "", limit: 8, maxPerFamily: 3, minCore: undefined, maxMood: 1 };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === "--input" && value) options.input = value;
    if (argument === "--output" && value) options.output = value;
    if (argument === "--limit" && value) options.limit = Number(value);
    if (argument === "--max-per-family" && value) options.maxPerFamily = Number(value);
    if (argument === "--min-core" && value) options.minCore = Number(value);
    if (argument === "--max-mood" && value) options.maxMood = Number(value);

    if (["--input", "--output", "--limit", "--max-per-family", "--min-core", "--max-mood"].includes(argument)) index += 1;
  }

  return options;
}

function runCli() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.input) {
    throw new Error(
      "Usage: select-candidates.mjs --input <candidates.json> [--output <result.json>] [--limit 8] [--max-per-family 3] [--min-core 4] [--max-mood 1]",
    );
  }

  const inputPath = path.resolve(options.input);
  const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const rawCandidates = Array.isArray(parsed) ? parsed : parsed.candidates;

  if (!Array.isArray(rawCandidates)) {
    throw new Error("Input JSON must be an array or an object with a candidates array.");
  }

  const result = selectCandidates(rawCandidates, options);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;

  if (options.output) {
    fs.writeFileSync(path.resolve(options.output), serialized);
  } else {
    process.stdout.write(serialized);
  }
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
  try {
    runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

export const scriptPath = fileURLToPath(import.meta.url);
