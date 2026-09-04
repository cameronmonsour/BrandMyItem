export const FIRST_CHECKIN_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

export type DeliveryState = {
  lifecycleStatus: string;
  shipmentStatus: string;
};

/**
 * Returns the fields for the one-way delivery transition. Callers must still
 * apply the same source-state predicates in their database update.
 */
export function deliveryTransition(
  campaign: DeliveryState,
  now: Date,
): {
  shipmentStatus: "delivered";
  lifecycleStatus: "active";
  deliveredAt: Date;
  checkinStatus: "due";
  checkinDueAt: Date;
  checkinReminderSentAt: null;
  updatedAt: Date;
} | null {
  if (
    campaign.shipmentStatus !== "shipped" ||
    campaign.lifecycleStatus !== "shipped"
  ) {
    return null;
  }

  return {
    shipmentStatus: "delivered",
    lifecycleStatus: "active",
    deliveredAt: now,
    checkinStatus: "due",
    checkinDueAt: new Date(now.getTime() + FIRST_CHECKIN_DELAY_MS),
    checkinReminderSentAt: null,
    updatedAt: now,
  };
}