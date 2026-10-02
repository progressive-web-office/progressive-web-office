/**
 * Widget state on the wire (CODE-016): binary values travel apart from the
 * JSON state, as `buffers` with the `buffer_paths` where they belong, as in
 * the Jupyter widget protocol.
 */

export type WidgetState = Record<string, unknown>;
export type Path = (string | number)[];

const isBinary = (v: unknown): v is ArrayBuffer | ArrayBufferView => v instanceof ArrayBuffer || ArrayBuffer.isView(v);

/** Put the buffers back in the state (as DataView), at their paths. */
export function putBuffers(state: WidgetState, paths: Path[] = [], buffers: (ArrayBuffer | ArrayBufferView)[] = []): WidgetState {
  paths.forEach((path, i) => {
    const buffer = buffers[i];
    if (!buffer || !path.length) return;
    const view = buffer instanceof ArrayBuffer ? new DataView(buffer) : new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    let at: Record<string | number, unknown> = state;
    for (const key of path.slice(0, -1)) at = at[key] as Record<string | number, unknown>;
    at[path[path.length - 1]!] = view;
  });
  return state;
}

/** Take the binary values out of the state: what goes as JSON, and the buffers with their paths. */
export function removeBuffers(state: WidgetState): { state: WidgetState; paths: Path[]; buffers: ArrayBuffer[] } {
  const paths: Path[] = [];
  const buffers: ArrayBuffer[] = [];
  const walk = (value: unknown, path: Path): unknown => {
    if (isBinary(value)) {
      paths.push(path);
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      buffers.push(bytes.slice().buffer);
      return null;
    }
    if (Array.isArray(value)) return value.map((v, i) => walk(v, [...path, i]));
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, [...path, k])]));
    }
    return value;
  };
  return { state: walk(state, []) as WidgetState, paths, buffers };
}

/** The model a reference names: `anywidget:<id>` (AFM) or `IPY_MODEL_<id>` (Jupyter widgets). */
export function modelRef(ref: unknown): string | undefined {
  if (typeof ref !== 'string') return undefined;
  const m = /^(?:anywidget:|IPY_MODEL_)(.+)$/.exec(ref);
  return m?.[1];
}

/** Models a state refers to (children of a box, its layout, composed widgets). */
export function refsOf(state: WidgetState): string[] {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    const id = modelRef(v);
    if (id) out.add(id);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object' && !isBinary(v)) Object.values(v).forEach(walk);
  };
  walk(state);
  return [...out];
}
