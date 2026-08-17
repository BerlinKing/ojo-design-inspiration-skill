# Selection and Originality

Use a two-stage gate: first determine whether a candidate is trustworthy enough to analyze, then determine whether it is useful for this project.

## Evidence Gate

Reject or quarantine a candidate when:

- no canonical source can be identified;
- the visible evidence is only a search thumbnail or unattributed repost;
- the claim depends on a page or state that was not actually observed;
- the item is unrelated to the target user job despite superficial visual similarity;
- a repository has no usable license but reuse is being considered;
- the content appears generated or fabricated and that status cannot be determined.

Keep a blocked candidate only when the limitation itself is useful. Label it `low confidence` and do not make it a primary reference.

## Scoring Rubric

Score each dimension from 0 to 5.

| Dimension | Weight | Question |
|---|---:|---|
| `projectFit` | 30% | Does it address this audience, surface, constraint, or user job? |
| `patternValue` | 20% | Does it demonstrate a transferable layout, flow, state, or interaction? |
| `emotionalFit` | 15% | Does it support the intended feeling without relying on category cliches? |
| `evidenceQuality` | 15% | Is the source primary, inspectable, attributable, and current enough? |
| `distinctiveness` | 10% | Does it add a genuinely new signal to the pool? |
| `sourceQuality` | 10% | Is the creator, product, publication, or repository credible for this claim? |

Convert the weighted result to a 0-100 score. A beautiful but weakly evidenced candidate must not outrank a highly relevant, inspectable one.

Use confidence separately from score:

- `high`: primary source and the relevant state was directly observed;
- `medium`: reliable secondary source or partial direct evidence;
- `low`: snippet, inaccessible state, uncertain authorship, or inference.

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
      "sourceFamily": "live-product|flow-library|web-gallery|portfolio|editorial|open-code|social",
      "searchLane": "domain|interaction|adjacent",
      "scores": {
        "projectFit": 0,
        "patternValue": 0,
        "emotionalFit": 0,
        "evidenceQuality": 0,
        "distinctiveness": 0,
        "sourceQuality": 0
      }
    }
  ]
}
```

Every score is 0-5. The script intentionally returns fewer than the requested limit when filling the limit would break the source-family cap. Review the rejected and duplicate lists before choosing finalists.

## Diversity Gate

A normal 5-8 item shortlist should:

- cover every search lane that produced relevant evidence;
- include at least two source families;
- include both product-behavior evidence and visual or emotional evidence;
- avoid more than three items from one source family;
- contain no two items that teach the same lesson unless they reveal meaningful variation.

Do not enforce diversity mechanically when it would replace an authoritative source with noise. Explain the exception.

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
