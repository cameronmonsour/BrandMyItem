import { copyFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(
  projectRoot,
  process.argv[2] ?? "../../attached_assets/iphone17-vertical-capsule.webp",
);
const target = path.join(projectRoot, "public/campaign/product-iphone.webp");

try {
  await access(source);
} catch {
  console.error(`iPhone 17 render swap blocked: file not found at ${source}`);
  process.exitCode = 2;
}

if (!process.exitCode) {
  await copyFile(source, target);
  console.log(`Copied ${source} to ${target}`);
}