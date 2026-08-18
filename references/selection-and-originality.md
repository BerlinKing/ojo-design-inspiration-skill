# Selection and Originality

Use three gates in order: determine whether the evidence is trustworthy, whether the exact image visibly matches the brief, and whether the shortlist has the right reference roles. Do not let a weighted score override a failed gate.

## Contents

- Evidence and exact-image gates
- Role thresholds and scoring
- Image, source, and deduplication rules
- Working-pool schema and shortlist diversity
- Feedback calibration and originality boundaries

## Evidence Gate

Reject or quarantine a candidate when:

- no canonical source can be identified;
- no displayable source image or permitted screenshot can be obtained for the final card;
- the visible evidence is only a search thumbnail or unattributed repost;
- the claim depends on a page or state that was not actually observed;
- the item is unrelated to the target user job despite superficial visual similarity;
- a repository has no usable license but reuse is being considered;
- the content appears generated or fabricated and that status cannot be determined.

Keep a blocked candidate only when the limitation itself is useful. Label it `low confidence` and do not make it a primary reference.

## Exact-Image Relevance Gate

Judge the exact image or captured state, not the reputation, category, title, or surrounding page. Record:

- `visibleEvidence`: at least two concrete observations visible in this image;
- `mustMatchHits`: brief requirements visibly demonstrated by this image;
- `hardViolations`: explicit avoids or negative-anchor traits present in the image;
- `mismatchRisks`: partial mismatches worth disclosing but not severe enough to reject;
- `referenceRole`: `core`, `pattern`, or `mood`.

Reject a finalist when `hardViolations` is non-empty or the image does not visibly support its claimed role. Do not write a post-hoc rationale to rescue a frame that misses the target.

Apply role-specific minimums:

| Role | Required minimums | Purpose |
|---|---|---|
| `core` | `surfaceFit >= 3`, `subjectFit >= 3`, `visualCueFit >= 3`, at least two `mustMatchHits` | Anchor the actual product, surface, and requested visual language. |
| `pattern` | `surfaceFit >= 3`, `transferability >= 4`, at least one `mustMatchHit` | Contribute a usable layout, flow, interaction, or motion pattern. |
| `mood` | `toneFit >= 4`, `visualCueFit >= 2`, at least one `mustMatchHit` | Contribute atmosphere only; never determine the main structure. |

These are non-compensating thresholds. A strong emotional match cannot repair a subject or surface miss in a `core` reference.

## Scoring Rubric

Score each dimension from 0 to 5.

| Dimension | Weight | Question |
|---|---:|---|
| `surfaceFit` | 25% | Is this the right artifact type, page, screen, flow, or interaction surface? |
| `subjectFit` | 25% | Does the exact image visibly represent the required domain, scenario, or subject? |
| `visualCueFit` | 20% | Does the image visibly contain the requested composition, material, motion, or imagery cues? |
| `toneFit` | 15% | Does it support the intended feeling without relying on generic category cliches? |
| `transferability` | 10% | Can a concrete principle be adapted to the current project? |
| `evidenceQuality` | 5% | Is the source primary, inspectable, attributable, and current enough? |

Convert the weighted result to a 0-100 score only after the gates pass. Use the score to rank candidates within their roles, not to compensate for a failed required dimension.

Use confidence separately from score:

- `high`: primary source and the relevant state was directly observed;
- `medium`: reliable secondary source or partial direct evidence;
- `low`: snippet, inaccessible state, uncertain authorship, or inference.

## Mandatory Image and Source Gate

A candidate may be scored provisionally without an image, but it cannot become a final reference until all of these are true:

1. `sourceUrl` resolves to the canonical creator, product, repository, or publication page.
2. The image is either a viewable MIME-typed attachment preserved from the current tool result or an absolute local artifact produced or checked by `scripts/verify-image-references.mjs`.
3. The image visibly supports the observation, role, and must-match claims made in the card.
4. Typed media remains viewable in the current result, or `imageVerification.status` is `verified` and its hash still matches the local artifact; the image and source URL can be displayed together in the final response.
5. The image is not an AI-generated substitute for unavailable source evidence.

Fail closed: replace candidates that do not pass. A detached media label, resource handle printed as text, or remote URL that was merely observed does not pass. A complete default result contains 5-8 passing references. If fewer are obtainable after the permitted search and capture attempts, label the result incomplete and report the exact shortfall.

## Deduplication

Treat items as duplicates when they resolve to the same canonical URL, show the same project reposted by different galleries, or repeat the same visual and creator with no additional state.

When choosing a representative duplicate:

1. Keep the primary source over an aggregator.
2. Keep the item with the strongest visible evidence.
3. Keep the source with clearer authorship, date, and context.
4. Preserve alternate URLs only as discovery provenance.

For larger pools, use `scripts/select-candidates.mjs` to normalize URLs, compute scores, and apply a source-family cap. Review its result manually.

Use this working-pool shape:

```json
{
  "candidates": [
    {
      "id": "candidate-01",
      "title": "Original project title",
      "creator": "Original creator or publisher",
      "sourceUrl": "https://canonical.example/work",
      "previewImageUrl": "https://canonical.example/preview.jpg",
      "imageKind": "source-preview|captured-screenshot",
      "imageAlt": "Concise description of the visible reference",
      "sourceFamily": "live-product|flow-library|web-gallery|portfolio|editorial|open-code|social",
      "searchLane": "domain|interaction|adjacent",
      "referenceRole": "core|pattern|mood",
      "visibleEvidence": ["Two or more concrete observations"],
      "mustMatchHits": ["Brief requirement visible in this image"],
      "hardViolations": [],
      "mismatchRisks": ["Non-fatal limitation to disclose"],
      "scores": {
        "surfaceFit": 0,
        "subjectFit": 0,
        "visualCueFit": 0,
        "toneFit": 0,
        "transferability": 0,
        "evidenceQuality": 0
      }
    }
  ]
}
```

The working pool may contain a remote preview URL. In typed-media mode, replace it with the actual viewable tool attachment during capture and retain the remote location only as provenance. Do not run typed attachments through the local selector.

In verified-local-artifact mode, run `scripts/verify-image-references.mjs` before selection. It validates the response or controlled local screenshot, detects the image type and dimensions, materializes remote images, and replaces `previewImageUrl` with a verified absolute artifact path. Its output also adds `imageDelivery` and `imageVerification`; never author those objects manually.

Every score is 0-5. For local mode, the selector rejects candidates whose verified artifact is missing, changed, lacks verifier metadata, fails its role gate, or contains hard violations. It intentionally returns fewer than the requested limit when filling the limit would break a quality or diversity gate. Review the verifier rejections plus the selector's rejected, duplicate, and shortfall lists before choosing finalists. Apply the same relevance, ranking, and diversity judgment manually to typed-media candidates.

## Diversity Gate

A normal 5-8 item shortlist should:

- contain a displayable image and canonical source URL for every item;
- contain at least half `core` references and never fewer than three when the requested limit permits;
- contain at most one `mood` reference;
- use `pattern` references for transferable structure or interaction rather than general aesthetic similarity;
- cover only search lanes that produced evidence passing the exact-image gate;
- include at least two source families;
- include both product-behavior evidence and visual or emotional evidence;
- avoid more than three items from one source family;
- contain no two items that teach the same lesson unless they reveal meaningful variation.

Do not enforce diversity mechanically when it would replace a relevant source with noise. Never use diversity as a reason to admit a weak adjacent-emotion candidate. Explain the exception.

## Feedback Calibration Gate

When the user rejects or substantially redirects a result set:

1. Save the rejected images and the user's wording as negative anchors for the current exploration.
2. Separate the correction into must-match cues, hard exclusions, and still-open exploration axes.
3. Find exactly three candidates that pass the `core` gate.
4. Vary one meaningful axis across the three cards, such as literal versus abstract imagery, restrained versus expressive motion, or photographic versus interface-led treatment.
5. Show the visible evidence and mismatch risk for each, ask which is closest, and stop.
6. Use the chosen card as a positive anchor and the rejected cards as negative anchors when building the full shortlist.

## Originality Boundary

Extract principles, not a visual fingerprint.

Safe to carry forward with adaptation:

- information hierarchy;
- interaction model and state logic;
- broad color relationships;
- pacing, density, and rhythm;
- material or emotional metaphor;
- accessibility and trust patterns.

Do not carry forward:

- logos, trademarks, names, proprietary copy, or branded illustrations;
- exact palettes, type pairings, icon sets, or motion signatures from one brand;
- a distinctive composition copied screen-for-screen;
- paid templates, code, or assets without verified rights;
- a direction that can be described only as "make it like Brand X."

## Synthesis Test

Before presenting a direction, verify:

1. It draws from at least two references with different roles.
2. It responds to a fact or constraint in the research brief.
3. Its layout and interaction logic fit the product rather than the source category.
4. It has a named differentiation from the closest reference.
5. It has an explicit avoid list.
6. Removing any one source would not collapse the whole direction into imitation.

If a direction fails, broaden the pool or recombine the evidence before presenting it.
