import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { scoreCandidate, selectCandidates, validateCandidateRelevance } from "./select-candidates.mjs";

const fullScores = Object.freeze({
  surfaceFit: 5,
  subjectFit: 5,
  visualCueFit: 5,
  toneFit: 5,
  transferability: 5,
  evidenceQuality: 5,
});

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), "ojo-selector-test-"));

after(() => fs.rmSync(artifactDir, { recursive: true, force: true }));

function candidate(id, referenceRole = "core", overrides = {}) {
  const roleScores = {
    core: fullScores,
    pattern: { ...fullScores, subjectFit: 2 },
    mood: { ...fullScores, surfaceFit: 1, subjectFit: 1, transferability: 3 },
  };

  const artifactPath = path.join(artifactDir, `${id}.png`);
  fs.writeFileSync(artifactPath, PNG_1X1);

  return {
    id,
    title: `Candidate ${id}`,
    creator: `Creator ${id}`,
    sourceUrl: `https://example.com/${id}`,
    previewImageUrl: artifactPath,
    imageDelivery: { kind: "verified-local-artifact", artifactPath },
    imageVerification: {
      status: "verified",
      artifactPath,
      mimeType: "image/png",
      width: 1,
      height: 1,
      bytes: PNG_1X1.length,
      sha256: crypto.createHash("sha256").update(PNG_1X1).digest("hex"),
    },
    sourceFamily: `family-${id}`,
    searchLane: referenceRole === "mood" ? "adjacent" : "domain",
    referenceTarget: "standalone-visual",
    imageKind: "original-source-asset",
    formalAssetAvailable: true,
    captureJustification: "",
    referenceRole,
    visibleEvidence: ["Visible subject", "Visible composition cue"],
    mustMatchHits: referenceRole === "core" ? ["Target surface", "Required visual cue"] : ["Required visual cue"],
    hardViolations: [],
    mismatchRisks: [],
    scores: roleScores[referenceRole],
    ...overrides,
  };
}

test("scores the new exact-image dimensions", () => {
  assert.equal(scoreCandidate({ scores: fullScores }), 100);
});

test("rejects a core reference when a required dimension misses its threshold", () => {
  const result = validateCandidateRelevance(
    candidate("subject-miss", "core", { scores: { ...fullScores, subjectFit: 2 } }),
  );

  assert.equal(result.eligible, false);
  assert.match(result.reasons.join(" "), /subjectFit >= 3/);
});

test("rejects hard visual violations instead of averaging them away", () => {
  const result = selectCandidates([
    candidate("good-core"),
    candidate("portrait-core", "core", { hardViolations: ["portrait-led frame"] }),
  ], { limit: 1, minCore: 1 });

  assert.deepEqual(result.selected.map((item) => item.id), ["good-core"]);
  assert.equal(result.rejected.some((item) => item.id === "portrait-core"), true);
});

test("rejects an Unsplash-style page screenshot when the photo is the reference", () => {
  const result = selectCandidates([
    candidate("unsplash-page", "core", {
      imageKind: "captured-interface",
      captureJustification: "The image was visible inside the hosting page.",
    }),
  ], { limit: 1, minCore: 1 });

  assert.equal(result.summary.selectedCount, 0);
  assert.match(result.rejected[0].reason, /captured-interface is allowed only when the interface itself is the reference target/);
});

test("allows a justified interface capture when layout is the reference", () => {
  const result = selectCandidates([
    candidate("product-layout", "core", {
      referenceTarget: "interface",
      imageKind: "captured-interface",
      captureJustification: "The navigation, hero hierarchy, and interaction layout are the reference.",
    }),
  ], { limit: 1, minCore: 1 });

  assert.equal(result.summary.selectedCount, 1);
});

test("enforces the core minimum and mood maximum without forcing search lanes", () => {
  const result = selectCandidates([
    candidate("core-1"),
    candidate("core-2"),
    candidate("core-3"),
    candidate("pattern-1", "pattern"),
    candidate("pattern-2", "pattern"),
    candidate("mood-1", "mood"),
    candidate("mood-2", "mood"),
  ], { limit: 5, maxMood: 1 });

  assert.equal(result.summary.complete, true);
  assert.equal(result.summary.selectedCoreCount, 3);
  assert.ok(result.summary.selectedMoodCount <= 1);
  assert.equal(result.selected.length, 5);
});

test("marks a full-count result incomplete when it lacks enough core anchors", () => {
  const result = selectCandidates([
    candidate("core-1"),
    candidate("core-2"),
    candidate("pattern-1", "pattern"),
    candidate("pattern-2", "pattern"),
    candidate("pattern-3", "pattern"),
    candidate("mood-1", "mood"),
  ], { limit: 5, maxMood: 1 });

  assert.equal(result.selected.length, 5);
  assert.equal(result.summary.complete, false);
  assert.equal(result.summary.selectedCoreCount, 2);
  assert.match(result.qualityShortfalls.join(" "), /required 3 core references/);
});
