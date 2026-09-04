import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(projectRoot, "index.html"), "utf8");
const author = html.match(/id="avatarAuthorName">([^<]+)</)?.[1]?.trim();

if (!author || author === "AVATAR_AUTHOR_NAME" || author === "pack author") {
  throw new Error("Avatar author attribution is missing or still uses a placeholder.");
}

console.log(`Verified avatar attribution: ${author}`);