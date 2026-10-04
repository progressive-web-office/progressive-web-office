/** isomorphic-git expects Node's Buffer: the browser gets the `buffer` package (GIT-017). */
import { Buffer } from 'buffer';

const g = globalThis as unknown as { Buffer?: typeof Buffer };
g.Buffer ??= Buffer;
