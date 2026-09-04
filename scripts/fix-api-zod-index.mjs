import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const indexUrl = new URL("../lib/api-zod/src/index.ts", import.meta.url);
const content = `// The API server's source-level Node tests execute this package directly.
// Keep the runtime export explicit while leaving model interfaces type-only.
// @ts-expect-error TS5097: source-level Node tests need the extension.
export * from "./generated/api.ts";
export type * from "./generated/types";
`;

await writeFile(fileURLToPath(indexUrl), content);