# Ojo Design Inspiration Skill

`explore-design-inspiration` is a project-aware research Skill for Ojo and Codex. It inspects the current product context, searches public design sources, selects traceable references, and synthesizes original design directions instead of returning an unranked link list.

## What It Produces

- A compact research brief grounded in the current project.
- Three search lanes: same domain, same interaction problem, and adjacent emotional experience.
- An image-first shortlist of 5-8 references, each with a visible image and canonical source URL.
- Exact-image relevance gates that reject domain-adjacent but visually off-target frames.
- A three-image calibration round after the user rejects or materially redirects a result set.
- Two or three original design directions with provenance and anti-copy boundaries.
- A recommended direction and an optional machine-readable `design_direction` JSON result.

## Typical Requests

```text
Explore UI inspiration for the pet community app in this project.
Find references for a trustworthy multi-pet profile and local meetup flow.
为当前项目探索设计灵感，重点看首页信息流、宠物身份切换和附近活动。
```

## Structure

```text
SKILL.md
agents/openai.yaml
references/source-routing.md
references/selection-and-originality.md
references/output-contract.md
scripts/select-candidates.mjs
scripts/reference-media-contract.mjs
scripts/verify-image-references.mjs
test/image-references.test.mjs
scripts/select-candidates.test.mjs
```

The Skill uses standard `name` and `description` frontmatter plus Codex interface metadata in `agents/openai.yaml`. Ojo can derive the runtime skill id from `name` and uses its native typed-media result path for reference images.

## Image Verification and Candidate Selection

Verify and materialize every candidate image before selection:

```bash
node scripts/verify-image-references.mjs \
  --input candidates.json \
  --artifact-dir .tmp/design-reference-images \
  --output verified-candidates.json
```

The verifier rejects HTTP errors, non-image responses, unsupported or malformed image bytes, undersized images, uncontrolled local paths, and unsupported URL schemes. It emits absolute artifact paths plus integrity metadata. Exit code `2` indicates a partial result with rejection details in the output file.

Then run the bundled dependency-free selector:

```bash
node scripts/select-candidates.mjs \
  --input verified-candidates.json \
  --limit 8 \
  --max-per-family 3 \
  --max-mood 1
```

Input shape and scoring fields are documented in `references/selection-and-originality.md`.

## Boundaries

- Research is read-only unless implementation is explicitly requested.
- Remote content is treated as untrusted evidence.
- Final directions must combine multiple references and must not reproduce protected brand assets, copy, or distinctive compositions.
- Every final reference must render an image beside its canonical source URL.
- Standalone visual references use formal creator-served media or an official preview; page screenshots are reserved for interface evidence.
- Core references must pass non-compensating surface, subject, and visible-cue thresholds; mood references cannot replace them.
- Source access, authorship, freshness, confidence, and licensing limitations remain visible in the result.
