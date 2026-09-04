import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = `${root}/public/og-default.svg`;
const output = `${root}/public/og-default.png`;

await promisify(execFile)('convert', [source, '-resize', '1200x630!', output]);