const REFERENCE_TARGETS = new Set(["standalone-visual", "interface", "case-study", "motion"]);
const IMAGE_KINDS = new Set(["original-source-asset", "official-preview", "captured-interface"]);
const FORMAL_ASSET_KINDS = new Set(["original-source-asset", "official-preview"]);

function cleanString(value) {
  return String(value ?? "").trim();
}

export function validateReferenceMedia(candidate) {
  const referenceTarget = cleanString(candidate?.referenceTarget);
  const imageKind = cleanString(candidate?.imageKind);
  const captureJustification = cleanString(candidate?.captureJustification);
  const formalAssetAvailable = candidate?.formalAssetAvailable;
  const reasons = [];

  if (!REFERENCE_TARGETS.has(referenceTarget)) {
    reasons.push("missing or invalid referenceTarget; expected standalone-visual, interface, case-study, or motion");
  }

  if (!IMAGE_KINDS.has(imageKind)) {
    reasons.push("missing or invalid imageKind; expected original-source-asset, official-preview, or captured-interface");
  }

  if (typeof formalAssetAvailable !== "boolean") {
    reasons.push("formalAssetAvailable must be true or false");
  }

  if (FORMAL_ASSET_KINDS.has(imageKind) && formalAssetAvailable !== true) {
    reasons.push(`${imageKind} requires formalAssetAvailable to be true`);
  }

  if (imageKind === "captured-interface") {
    if (referenceTarget !== "interface") {
      reasons.push("captured-interface is allowed only when the interface itself is the reference target");
    }
    if (!captureJustification) {
      reasons.push("captured-interface requires a captureJustification");
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    normalized: { referenceTarget, imageKind, formalAssetAvailable, captureJustification },
  };
}
