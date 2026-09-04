// Export your models here. Add one export per file
// export * from "./posts";
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

// @ts-expect-error TS5097: source-level Node tests need the extension.
export * from "./campaigns.ts";
// @ts-expect-error TS5097: source-level Node tests need the extension.
export * from "./uploadIntents.ts";
// @ts-expect-error TS5097: source-level Node tests need the extension.
export * from "./reservationDrafts.ts";