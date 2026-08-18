import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { selectCandidates } from "../scripts/select-candidates.mjs";
import { inspectImageBuffer, verifyImageCandidates } from "../scripts/verify-image-references.mjs";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

let server;
let baseUrl;
let artifactDir;

before(async () => {
  artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), "ojo-image-verifier-test-"));
  server = http.createServer((request, response) => {
    if (request.url === "/image.png") {
      response.writeHead(200, { "content-type": "image/png", "content-length": PNG_1X1.length });
      response.end(PNG_1X1);
      return;
    }
    if (request.url === "/wrong-type") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html>not an image</html>");
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("missing");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await fs.rm(artifactDir, { recursive: true, force: true });
});

function candidate(overrides = {}) {
  return {
    id: "reference-one",
    title: "Reference one",
    creator: "Creator",
    sourceUrl: `${baseUrl}/project`,
    previewImageUrl: `${baseUrl}/image.png`,
    referenceTarget: "standalone-visual",
    imageKind: "official-preview",
    formalAssetAvailable: true,
    captureJustification: "",
    imageAlt: "A verified design reference",
    sourceFamily: "live-product",
    searchLane: "domain",
    referenceRole: "core",
    visibleEvidence: ["Visible product surface", "Visible domain-specific imagery"],
    mustMatchHits: ["Target surface", "Required visual cue"],
    hardViolations: [],
    mismatchRisks: [],
    scores: { surfaceFit: 5, subjectFit: 5, visualCueFit: 5, toneFit: 4, transferability: 5, evidenceQuality: 5 },
    ...overrides,
  };
}

test("recognizes supported image bytes and rejects HTML", () => {
  assert.deepEqual(inspectImageBuffer(PNG_1X1), { mimeType: "image/png", extension: ".png", width: 1, height: 1 });
  assert.equal(inspectImageBuffer(Buffer.from("<html>not an image</html>")), null);
});

test("downloads, verifies, and materializes a remote image", async () => {
  const result = await verifyImageCandidates([candidate()], { artifactDir, minWidth: 1, minHeight: 1, allowPrivateNetwork: true });
  assert.equal(result.summary.verifiedCount, 1);
  assert.equal(result.summary.rejectedCount, 0);
  assert.equal(result.candidates[0].imageVerification.status, "verified");
  assert.equal(result.candidates[0].imageDelivery.kind, "verified-local-artifact");
  assert.equal(result.candidates[0].imageVerification.mimeType, "image/png");
  assert.equal(path.isAbsolute(result.candidates[0].previewImageUrl), true);
  assert.deepEqual(await fs.readFile(result.candidates[0].previewImageUrl), PNG_1X1);
});

test("rejects HTTP errors, HTML, unsupported schemes, and undersized images", async () => {
  const result = await verifyImageCandidates(
    [
      candidate({ id: "missing", previewImageUrl: `${baseUrl}/missing` }),
      candidate({ id: "html", previewImageUrl: `${baseUrl}/wrong-type` }),
      candidate({ id: "artifact", previewImageUrl: "artifact:not-an-image" }),
      candidate({ id: "data", previewImageUrl: "data:image/png;base64,invalid" }),
      candidate({ id: "file-source", sourceUrl: "file:///etc/passwd" }),
      candidate({ id: "small" }),
    ],
    { artifactDir, minWidth: 200, minHeight: 120, allowPrivateNetwork: true },
  );
  assert.equal(result.summary.verifiedCount, 0);
  assert.equal(result.summary.rejectedCount, 6);
  assert.match(result.rejected.find((item) => item.id === "missing").reason, /HTTP 404/);
  assert.match(result.rejected.find((item) => item.id === "html").reason, /non-image content type/);
  assert.match(result.rejected.find((item) => item.id === "artifact").reason, /HTTP or HTTPS URL/);
  assert.match(result.rejected.find((item) => item.id === "small").reason, /below 200x120/);
});

test("rejects local files outside the controlled artifact directory", async () => {
  const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "ojo-image-outside-"));
  const outsidePath = path.join(outsideDir, "image.png");
  await fs.writeFile(outsidePath, PNG_1X1);
  try {
    const result = await verifyImageCandidates([candidate({ previewImageUrl: outsidePath })], { artifactDir, minWidth: 1, minHeight: 1 });
    assert.equal(result.summary.verifiedCount, 0);
    assert.match(result.rejected[0].reason, /inside artifactDir/);
  } finally {
    await fs.rm(outsideDir, { recursive: true, force: true });
  }
});

test("rejects private-network image fetches by default", async () => {
  const result = await verifyImageCandidates([candidate({ id: "private-network" })], { artifactDir, minWidth: 1, minHeight: 1 });
  assert.equal(result.summary.verifiedCount, 0);
  assert.match(result.rejected[0].reason, /local, private, or reserved address/);
});

test("rejects a hosting-page screenshot for a standalone visual", async () => {
  const result = await verifyImageCandidates(
    [candidate({ imageKind: "captured-interface", captureJustification: "The page was open in a browser." })],
    { artifactDir, minWidth: 1, minHeight: 1, allowPrivateNetwork: true },
  );

  assert.equal(result.summary.verifiedCount, 0);
  assert.match(result.rejected[0].reason, /captured-interface is allowed only when the interface itself is the reference target/);
});

test("allows an interface capture when the page composition is the evidence", async () => {
  const result = await verifyImageCandidates(
    [candidate({ referenceTarget: "interface", imageKind: "captured-interface", captureJustification: "The navigation and content layout are the reference." })],
    { artifactDir, minWidth: 1, minHeight: 1, allowPrivateNetwork: true },
  );

  assert.equal(result.summary.verifiedCount, 1);
  assert.equal(result.candidates[0].imageKind, "captured-interface");
});

test("CLI entrypoints run when invoked through a symlinked path", async () => {
  const linkDir = await fs.mkdtemp(path.join(os.tmpdir(), "ojo-script-links-"));
  const scriptsDir = path.resolve("scripts");
  const linkedScriptsDir = path.join(linkDir, "scripts");
  await fs.symlink(scriptsDir, linkedScriptsDir, "dir");
  try {
    for (const scriptName of ["verify-image-references.mjs", "select-candidates.mjs"]) {
      const result = spawnSync(process.execPath, [path.join(linkedScriptsDir, scriptName)], { encoding: "utf8" });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Usage:/);
    }
  } finally {
    await fs.rm(linkDir, { recursive: true, force: true });
  }
});

test("selector accepts only intact artifacts emitted by the verifier", async () => {
  const verified = await verifyImageCandidates([candidate({ id: "selector-reference" })], { artifactDir, minWidth: 1, minHeight: 1, allowPrivateNetwork: true });
  const accepted = selectCandidates(verified.candidates);
  assert.equal(accepted.summary.selectedCount, 1);

  const raw = selectCandidates([candidate({ id: "raw-reference" })]);
  assert.equal(raw.summary.selectedCount, 0);
  assert.equal(raw.summary.imageRejectedCount, 1);

  await fs.appendFile(verified.candidates[0].previewImageUrl, "tampered");
  const tampered = selectCandidates(verified.candidates);
  assert.equal(tampered.summary.selectedCount, 0);
});
