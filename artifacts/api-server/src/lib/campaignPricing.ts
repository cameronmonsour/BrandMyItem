type Tile = {
  w: number;
  h: number;
};

type Face = {
  tiles: Tile[];
};

function isTile(value: unknown): value is Tile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const tile = value as Record<string, unknown>;
  return typeof tile.w === "number" && Number.isFinite(tile.w) && tile.w > 0 &&
    typeof tile.h === "number" && Number.isFinite(tile.h) && tile.h > 0;
}

function readFaces(presentation: Record<string, unknown>): Face[] {
  if (Array.isArray(presentation.faces) && presentation.faces.length > 0) {
    return presentation.faces.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Each campaign face must be an object");
      }
      const tiles = (value as Record<string, unknown>).tiles;
      if (!Array.isArray(tiles) || tiles.length === 0 || !tiles.every(isTile)) {
        throw new Error("Each campaign face must contain sized placement tiles");
      }
      return { tiles };
    });
  }

  if (Array.isArray(presentation.tiles) && presentation.tiles.length > 0 &&
      presentation.tiles.every(isTile)) {
    return [{ tiles: presentation.tiles }];
  }

  throw new Error("Campaign draft requires sized placement areas");
}

export function computeCampaignPricesCents(
  presentation: Record<string, unknown>,
): number[] {
  const retail = presentation.retail;
  if (typeof retail !== "number" || !Number.isFinite(retail) || retail < 1) {
    throw new Error("Campaign draft requires a valid retail value");
  }

  const faces = readFaces(presentation);
  const weights: number[] = [];
  for (const face of faces) {
    const faceArea = face.tiles.reduce((sum, tile) => sum + tile.w * tile.h, 0);
    if (!Number.isFinite(faceArea) || faceArea <= 0) {
      throw new Error("Campaign draft requires positive sized placement areas");
    }
    for (const tile of face.tiles) {
      weights.push((tile.w * tile.h) / faceArea / faces.length);
    }
  }

  const retailDollars = Math.max(1, Math.round(retail));
  const purchaseGoalDollars = retailDollars + Math.round(retailDollars * 0.4);
  const prices = weights.map((weight) =>
    Math.max(1, Math.round(purchaseGoalDollars * weight)),
  );
  const largest = weights.reduce(
    (best, weight, index) => (weight > weights[best] ? index : best),
    0,
  );
  prices[largest] += purchaseGoalDollars - prices.reduce((sum, price) => sum + price, 0);
  if (prices.some((price) => price < 1)) {
    throw new Error("Campaign placement areas cannot produce valid spot prices");
  }
  return prices.map((price) => price * 100);
}