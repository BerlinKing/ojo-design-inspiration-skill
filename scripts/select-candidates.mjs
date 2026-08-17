#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCORE_WEIGHTS = Object.freeze({
  projectFit: 0.3,
  patternValue: 0.2,
  emotionalFit: 0.15,
  evidenceQuality: 0.15,
  distinctiveness: 0.1,
  sourceQuality: 0.1,
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

const SEARCH_LANES = ["domain", "interaction", "adjacent"];

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
  const totalScore = scoreCandidate(candidate);

  return {
    ...candidate,
    id: candidate.id ?? `candidate-${String(index + 1).padStart(2, "0")}`,
    sourceUrl,
    canonicalUrl,
    sourceFamily: candidate.sourceFamily ?? "unknown",
    searchLane: candidate.searchLane ?? "unknown",
    totalScore,
  };
}

export function selectCandidates(rawCandidates, options = {}) {
  const limit = Math.max(1, Number(options.limit ?? 8));
  const maxPerFamily = Math.max(1, Number(options.maxPerFamily ?? 3));
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

  const canSelect = (candidate) =>
    !selectedIds.has(candidate.id) &&
    (familyCounts.get(candidate.sourceFamily) ?? 0) < maxPerFamily &&
    selected.length < limit;

  const add = (candidate) => {
    selected.push(candidate);
    selectedIds.add(candidate.id);
    familyCounts.set(candidate.sourceFamily, (familyCounts.get(candidate.sourceFamily) ?? 0) + 1);
  };

  for (const lane of SEARCH_LANES) {
    const bestForLane = ranked.find((candidate) => candidate.searchLane === lane && canSelect(candidate));
    if (bestForLane) add(bestForLane);
  }

  for (const candidate of ranked) {
    if (canSelect(candidate)) add(candidate);
  }

  return {
    summary: {
      inputCount: rawCandidates.length,
      uniqueCount: ranked.length,
      selectedCount: selected.length,
      duplicateCount: duplicates.length,
      rejectedCount: rejected.length,
    },
    selected: selected.map((candidate, index) => ({ rank: index + 1, ...candidate })),
    duplicates,
    rejected,
  };
}

function parseArguments(argv) {
  const options = { input: "", output: "", limit: 8, maxPerFamily: 3 };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === "--input" && value) options.input = value;
    if (argument === "--output" && value) options.output = value;
    if (argument === "--limit" && value) options.limit = Number(value);
    if (argument === "--max-per-family" && value) options.maxPerFamily = Number(value);

    if (["--input", "--output", "--limit", "--max-per-family"].includes(argument)) index += 1;
  }

  return options;
}

function runCli() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.input) {
    throw new Error(
      "Usage: select-candidates.mjs --input <candidates.json> [--output <result.json>] [--limit 8] [--max-per-family 3]",
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

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

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
