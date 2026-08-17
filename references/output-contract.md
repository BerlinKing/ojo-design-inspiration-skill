# Output Contract

Return a curated design result. Do not return a raw browsing diary or an unranked list of links.

## User-Facing Structure

### 1. Research Brief

Summarize:

- product, audience, and target surface;
- user job and intended feeling;
- constraints and avoids;
- assumptions with confidence.

Keep this short enough that the user can correct it before implementation.

### 2. Reference Shortlist

Return 5-8 reference cards. Each card includes:

- title and creator or publisher;
- visible preview, when available and permitted;
- source family and search lane;
- canonical link;
- the exact observed pattern;
- why it matters to this project;
- what not to copy;
- confidence and freshness or access note.

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

Use empty arrays or empty strings when a value is genuinely unavailable. Never invent a creator, image URL, date, or source URL to make the schema look complete.

## Quality Gate

Before returning the result, confirm:

- every reference has a canonical source;
- every visual claim was actually observed;
- preview images are real evidence, not generated stand-ins;
- the shortlist is deduplicated and source-diverse;
- each direction combines multiple references;
- recommendation criteria come from the brief;
- uncertainty and access limits are visible;
- implementation has not started without explicit instruction.
