// The API server's source-level Node tests execute this package directly.
// Keep the runtime export explicit while leaving model interfaces type-only.
// @ts-expect-error TS5097: source-level Node tests need the extension.
export * from "./generated/api.ts";
export type * from "./generated/types";
