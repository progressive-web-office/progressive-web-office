// Publish the JSON Schemas (schemas/*.json) with the documentation site,
// e.g. https://<site>/docs/schemas/mdz-manifest-1.schema.json
import { cp } from 'node:fs/promises';

const from = new URL('../schemas/', import.meta.url);
const to = new URL('../docs/.vitepress/dist/schemas/', import.meta.url);
await cp(from, to, { recursive: true });
console.log('schemas copied to docs/.vitepress/dist/schemas/');
