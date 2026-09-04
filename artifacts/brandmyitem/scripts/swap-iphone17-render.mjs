import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(
  projectRoot,
  process.argv[2] ?? "../../attached_assets/product-iphone-17.png",
);
const target = path.join(projectRoot, "public/campaign/product-iphone.webp");

try {
  await access(source);
} catch {
  console.log("iPhone render not supplied");
  process.exit(0);
}

await execFileAsync("magick", [
  source,
  "-resize",
  "1600x1600>",
  "-quality",
  "90",
  target,
]);
console.log(`Converted ${source} to ${target} at no more than 1600px`);