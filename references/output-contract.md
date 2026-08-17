# Output Contract

Return a curated, image-first design result. Do not return a raw browsing diary, an unranked list of links, or a text-only reference list.

## Non-Negotiable Delivery Contract

- A complete default result contains 5-8 reference cards and every card renders at least one real source image or captured source screenshot through typed media or a verified local artifact.
- Every image card displays its canonical source URL immediately beside or below the image.
- Both the image and source URL are required. Missing either one disqualifies the card from the final gallery.
- Generated images never count as source references. Label generated direction boards as synthesis.
- If the required image count cannot be reached safely, return a visibly incomplete result with the exact number found and the reason. Do not imply completion.

## User-Facing Structure

### 1. Visual Reference Gallery

Lead with the images. Return 5-8 reference cards by default, unless the user explicitly requests fewer.

In typed-media mode, insert the actual viewable media attachment immediately before its title and source. Do not replace it with a text representation of its result field or resource id.

Use this presentation pattern in verified-local-artifact mode when the client supports Markdown images from absolute local paths:

```markdown
![Descriptive alt text](/absolute/path/to/verified-reference.jpg)

**Project title — Creator**<br>
Source: [Original project page](https://canonical.example/project)
```

Keep the image, title, creator, and source link in the same card. Then include:

- source family and search lane;
- the exact observed pattern;
- why it matters to this project;
- what not to copy;
- confidence and freshness or access note.

If the image is a captured screenshot, link the card to the page that was captured, not merely to the screenshot artifact.

Use the absolute artifact path emitted by `verify-image-references.mjs`; do not substitute the original remote preview URL. When the client requires a native image attachment instead of Markdown, attach the verified artifact through the client and keep the canonical source link in the same card. A tool handle printed as text is not an image.

### 2. Research Brief

Summarize:

- product, audience, and target surface;
- user job and intended feeling;
- constraints and avoids;
- assumptions with confidence.

Keep this short enough that the user can correct it before implementation.

Distinguish observation from inference. For example:

- Observation: "The captured profile uses a persistent identity switcher above the feed."
- Inference: "This may reduce confusion for owners managing multiple pets."

### 3. Pattern Insights

Synthesize 3-5 patterns that recur across multiple references. State which references support each pattern and whether the pattern is behavioral, structural, visual, or emotional.

### 4. Design Directions

Return 2-3 distinct directions. For each direction include:

- name;
- thesis;
- feeling;
- visual language: color, type, texture, imagery, motion;
- layout and interaction choices;
- best-fit screens or moments;
- provenance map;
- original contribution for this product;
- avoid list;
- confidence.

The directions must differ in product expression, not only in color or light/dark treatment.

### 5. Recommendation

Recommend one direction against the research brief. Explain the tradeoff and give one concrete next step, such as:

- validate the direction on two high-value screens;
- create a small moodboard;
- prototype one critical interaction;
- define initial design tokens;
- gather five user reactions.

Do not begin that next step unless the user asks.

### 6. Sources and Limitations

List canonical sources close to the claims they support. State inaccessible pages, missing author or date information, stale captures, paywalls, or reliance on secondary evidence.

## Machine-Readable Contract

When the client supports structured output, append one valid JSON block with the top-level key `design_direction`.

```json
{
  "design_direction": {
    "brief": {
      "product": "",
      "audience": [],
      "target_surface": [],
      "user_jobs": [],
      "emotional_goals": [],
      "constraints": [],
      "avoids": [],
      "assumptions": [
        { "text": "", "confidence": "low|medium|high" }
      ]
    },
    "references": [
      {
        "id": "ref-01",
        "title": "",
        "creator": "",
        "source_family": "live-product|flow-library|web-gallery|portfolio|editorial|open-code|social",
        "search_lane": "domain|interaction|adjacent",
        "source_url": "",
        "preview_image_url": "",
        "image_kind": "source-preview|captured-screenshot",
        "image_alt": "",
        "image_delivery": {
          "kind": "typed-media|verified-local-artifact",
          "media_field": "",
          "resource_id": "",
          "artifact_path": "",
          "mime_type": "image/png|image/jpeg|image/gif|image/webp"
        },
        "image_verification": {
          "status": "verified",
          "mime_type": "image/png|image/jpeg|image/gif|image/webp",
          "width": 0,
          "height": 0,
          "sha256": ""
        },
        "observed_pattern": "",
        "project_relevance": "",
        "avoid_copying": "",
        "confidence": "low|medium|high",
        "checked_at": "YYYY-MM-DD"
      }
    ],
    "patterns": [
      {
        "name": "",
        "kind": "behavioral|structural|visual|emotional",
        "insight": "",
        "reference_ids": []
      }
    ],
    "directions": [
      {
        "id": "direction-a",
        "name": "",
        "thesis": "",
        "feeling": [],
        "color": [],
        "typography": [],
        "texture": [],
        "imagery": [],
        "motion": [],
        "layout_patterns": [],
        "interaction_patterns": [],
        "best_fit_surfaces": [],
        "reference_map": [
          { "reference_id": "ref-01", "borrowed_principle": "" }
        ],
        "original_contribution": "",
        "avoid": [],
        "confidence": "low|medium|high"
      }
    ],
    "recommended_direction_id": "direction-a",
    "recommendation_reason": "",
    "next_step": "",
    "limitations": []
  }
}
```

For final references, `source_url`, `image_kind`, `image_alt`, and `image_delivery` are required. In typed-media mode, preserve the actual attached image separately, populate only identifiers that the tool really returned, allow `preview_image_url` to be empty, and omit `image_verification`. In verified-local-artifact mode, `preview_image_url`, `image_delivery.artifact_path`, and `image_verification` are required and point to the verified absolute artifact. Exclude the reference when the image or source URL is unavailable. Never invent an attachment, resource id, verification metadata, creator, image URL, date, or source URL to make the schema look complete.

## Quality Gate

Before returning the result, confirm:

- every reference has a canonical source;
- every reference has either a currently viewable typed-media attachment or passed `verify-image-references.mjs` and then `select-candidates.mjs`;
- every reference renders a visible image before any text-only analysis;
- every image has its canonical source URL in the same card;
- every visual claim was actually observed;
- preview images are real evidence, not generated stand-ins;
- the shortlist is deduplicated and source-diverse;
- each direction combines multiple references;
- recommendation criteria come from the brief;
- uncertainty and access limits are visible;
- implementation has not started without explicit instruction.

Do not mark the result complete when any required image fails to render or any final card lacks a source URL.
