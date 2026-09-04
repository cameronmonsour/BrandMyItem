import { auditEventsTable, db } from "@workspace/db";
import { randomUUID } from "node:crypto";

export async function recordAuditEvent(input: {
  actorType: "owner" | "brand" | "operator" | "system";
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  requestIp?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(auditEventsTable).values({
    id: randomUUID(),
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    requestIp: input.requestIp ?? null,
    metadata: input.metadata ?? {},
  });
}