const campaignPresentationFields = new Set([
  "type", "sourceType", "itemName", "custom", "photo", "faces", "tiles",
  "retail", "title", "owner", "avatar", "habs", "cities", "universities",
  "purpose", "freq", "social", "color", "variantModel", "variantSize",
  "source", "verified", "socialLinks", "slots", "pricesIncludeMarkup",
  "postedAt", "unsoldTimeoutDays", "termMonths", "checkinFrequency",
  "brandingMode", "status", "mtv",
]);

export function isSafeCampaignPresentation(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const root = value as Record<string, unknown>;
  const keys = Object.keys(root);
  if (keys.length > campaignPresentationFields.size) return false;
  if (keys.some((key) => !campaignPresentationFields.has(key))) return false;

  const stringFields = new Set([
    "type", "sourceType", "itemName", "photo", "title", "owner", "avatar",
    "purpose", "freq", "social", "color", "variantModel", "variantSize",
    "source", "checkinFrequency", "brandingMode", "status",
  ]);
  const booleanFields = new Set(["custom", "verified", "pricesIncludeMarkup"]);
  const numberFields = new Set([
    "retail", "slots", "postedAt", "unsoldTimeoutDays", "termMonths", "mtv",
  ]);
  const stringArrayFields = new Set(["habs", "cities", "universities"]);
  const isShortString = (item: unknown) =>
    typeof item === "string" && item.length <= 20_000;
  const isTile = (item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const tile = item as Record<string, unknown>;
    const allowed = new Set(["x", "y", "w", "h", "shape", "color", "pts", "round"]);
    if (Object.keys(tile).some((key) => !allowed.has(key))) return false;
    return ["x", "y", "w", "h", "round"].every(
      (key) => tile[key] === undefined || (typeof tile[key] === "number" && Number.isFinite(tile[key])),
    ) &&
      (tile.shape === undefined || ["rect", "circle", "poly"].includes(String(tile.shape))) &&
      (tile.color === undefined || isShortString(tile.color)) &&
      (tile.pts === undefined ||
        (Array.isArray(tile.pts) &&
          tile.pts.length <= 100 &&
          tile.pts.every(
            (point) =>
              Array.isArray(point) &&
              point.length === 2 &&
              point.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)),
          )));
  };

  for (const [key, item] of Object.entries(root)) {
    if (stringFields.has(key) && !isShortString(item)) return false;
    if (booleanFields.has(key) && typeof item !== "boolean") return false;
    if (numberFields.has(key) && (typeof item !== "number" || !Number.isFinite(item))) return false;
    if (
      stringArrayFields.has(key) &&
      (!Array.isArray(item) || item.length > 100 || !item.every(isShortString))
    ) return false;
    if (key === "tiles" && (!Array.isArray(item) || item.length > 20 || !item.every(isTile))) {
      return false;
    }
    if (key === "socialLinks") {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      if (Object.keys(item).length > 20 || !Object.values(item).every(isShortString)) return false;
    }
    if (key === "faces") {
      if (!Array.isArray(item) || item.length > 4) return false;
      for (const faceValue of item) {
        if (!faceValue || typeof faceValue !== "object" || Array.isArray(faceValue)) return false;
        const face = faceValue as Record<string, unknown>;
        const allowed = new Set(["photo", "tiles", "off", "label", "cells"]);
        if (Object.keys(face).some((faceKey) => !allowed.has(faceKey))) return false;
        if (!isShortString(face.photo)) return false;
        if (face.label !== undefined && !isShortString(face.label)) return false;
        if (
          !Array.isArray(face.tiles) ||
          face.tiles.length > 20 ||
          !face.tiles.every(isTile)
        ) return false;
        if (
          ["off", "cells"].some(
            (faceKey) =>
              face[faceKey] !== undefined &&
              (typeof face[faceKey] !== "number" || !Number.isFinite(face[faceKey])),
          )
        ) return false;
      }
    }
  }

  let nodes = 0;
  const visit = (node: unknown, depth: number): boolean => {
    nodes += 1;
    if (nodes > 2_000 || depth > 6) return false;
    if (node === null || typeof node === "boolean") return true;
    if (typeof node === "number") return Number.isFinite(node);
    if (typeof node === "string") return node.length <= 20_000;
    if (Array.isArray(node)) {
      return node.length <= 100 && node.every((item) => visit(item, depth + 1));
    }
    if (typeof node !== "object") return false;
    const record = node as Record<string, unknown>;
    const childKeys = Object.keys(record);
    if (
      childKeys.length > 100 ||
      childKeys.some((key) => key === "__proto__" || key === "prototype" || key === "constructor")
    ) return false;
    return childKeys.every((key) => visit(record[key], depth + 1));
  };
  return visit(root, 0);
}