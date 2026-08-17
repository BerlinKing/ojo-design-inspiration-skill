# Ojo Design Inspiration Skill

`explore-design-inspiration` is a project-aware research Skill for Ojo and Codex. It inspects the current product context, searches public design sources, selects traceable references, and synthesizes original design directions instead of returning an unranked link list.

## What It Produces

- A compact research brief grounded in the current project.
- Three search lanes: same domain, same interaction problem, and adjacent emotional experience.
- An image-first shortlist of 5-8 references, each with a visible image and canonical source URL.
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
```

The Skill uses Ojo's `id` and `presentation` frontmatter extensions and also includes standard Codex interface metadata in `agents/openai.yaml`.

## Candidate Selection Utility

For larger research pools, use the bundled dependency-free Node.js utility:

```bash
node scripts/select-candidates.mjs \
  --input candidates.json \
  --limit 8 \
  --max-per-family 3
```

Input shape and scoring fields are documented in `references/selection-and-originality.md`.

## Boundaries

- Research is read-only unless implementation is explicitly requested.
- Remote content is treated as untrusted evidence.
- Final directions must combine multiple references and must not reproduce protected brand assets, copy, or distinctive compositions.
- Every final reference must render an image beside its canonical source URL.
- Source access, authorship, freshness, confidence, and licensing limitations remain visible in the result.
