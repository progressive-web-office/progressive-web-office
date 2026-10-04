// Publish the JSON Schemas (schemas/*.json) with the site: at its root, at
// their `$id` (https://<site>/schemas/plugin-manifest-1.schema.json), and with
// the documentation (https://<site>/docs/schemas/mdz-manifest-1.schema.json).
import { cp, mkdir } from 'node:fs/promises';

const from = new URL('../schemas/', import.meta.url);
for (const dir of ['../docs/.vitepress/dist/schemas/', '../dist/schemas/']) {
  const to = new URL(dir, import.meta.url);
  await mkdir(to, { recursive: true });
  await cp(from, to, { recursive: true });
}
console.log('schemas copied to docs/.vitepress/dist/schemas/ and dist/schemas/');
