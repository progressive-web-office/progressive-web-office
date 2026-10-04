// Publish the working requirements (specs/spec.md, not tracked) into the
// documentation (docs/requirements.md, tracked). Run with `just sync-spec`.
import { readFile, writeFile } from 'node:fs/promises';

const src = new URL('../specs/spec.md', import.meta.url);
const dst = new URL('../docs/requirements.md', import.meta.url);
const spec = await readFile(src, 'utf8');
const body = spec
  .replace(/^# .*\n/, '# Requirements specification\n')
  // Escape EARS placeholders such as <response> (Vue would parse them as tags).
  .replace(/<(trigger|state|condition|feature|response)>/g, '&lt;$1&gt;')
  .replace('see `ROADMAP.md`', 'see the [roadmap](https://github.com/progressive-web-office/progressive-web-office/blob/main/ROADMAP.md)');
await writeFile(
  dst,
  '---\ndescription: EARS requirements with MoSCoW priorities and roadmap milestones.\n---\n\n' +
    '<!-- Generated from specs/spec.md by scripts/sync-requirements.mjs — edit the source. -->\n\n' +
    // Shown as written: `{{X}}` in requirements is text, not a Vue interpolation.
    `::: v-pre\n${body.trimEnd()}\n:::\n`,
);
console.log('docs/requirements.md updated');
