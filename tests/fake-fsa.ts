/** An in-memory FileSystemDirectoryHandle, faithful enough to test providers (errors included). */
const err = (name: string): Error => Object.assign(new Error(name), { name });

interface Node {
  kind: 'file' | 'directory';
  name: string;
  children?: Map<string, Node>;
  data?: Blob;
}

function fileHandle(node: Node, parent: Node, withMove: boolean): FileSystemFileHandle {
  const h = {
    kind: 'file',
    name: node.name,
    getFile: async () => new File([node.data ?? ''], node.name),
    createWritable: async () => {
      const parts: Blob[] = [];
      return { write: async (d: Blob) => void parts.push(d), close: async () => void (node.data = new Blob(parts)) };
    },
    ...(withMove
      ? {
          move: async (to: FileSystemDirectoryHandle, name: string) => {
            const dest = (to as unknown as { __node: Node }).__node;
            if (dest.children!.has(name)) throw err('InvalidModificationError');
            parent.children!.delete(node.name);
            node.name = name;
            dest.children!.set(name, node);
          },
        }
      : {}),
  };
  return h as unknown as FileSystemFileHandle;
}

export function fakeDirectory(name: string, files: Record<string, string> = {}, withMove = false): FileSystemDirectoryHandle {
  const root: Node = { kind: 'directory', name, children: new Map() };
  const mkdirs = (path: string[]): Node => {
    let n = root;
    for (const seg of path) {
      if (!n.children!.has(seg)) n.children!.set(seg, { kind: 'directory', name: seg, children: new Map() });
      n = n.children!.get(seg)!;
    }
    return n;
  };
  for (const [path, text] of Object.entries(files)) {
    const parts = path.split('/');
    const file = parts.pop()!;
    mkdirs(parts).children!.set(file, { kind: 'file', name: file, data: new Blob([text]) });
  }
  const dirHandle = (node: Node): FileSystemDirectoryHandle =>
    ({
      kind: 'directory',
      name: node.name,
      __node: node,
      async *values() {
        for (const c of node.children!.values()) yield c.kind === 'file' ? fileHandle(c, node, withMove) : dirHandle(c);
      },
      async getDirectoryHandle(n: string, opts: { create?: boolean } = {}) {
        let c = node.children!.get(n);
        if (c?.kind === 'file') throw err('TypeMismatchError');
        if (!c) {
          if (!opts.create) throw err('NotFoundError');
          c = { kind: 'directory', name: n, children: new Map() };
          node.children!.set(n, c);
        }
        return dirHandle(c);
      },
      async getFileHandle(n: string, opts: { create?: boolean } = {}) {
        let c = node.children!.get(n);
        if (c?.kind === 'directory') throw err('TypeMismatchError');
        if (!c) {
          if (!opts.create) throw err('NotFoundError');
          c = { kind: 'file', name: n, data: new Blob([]) };
          node.children!.set(n, c);
        }
        return fileHandle(c, node, withMove);
      },
      async removeEntry(n: string, opts: { recursive?: boolean } = {}) {
        const c = node.children!.get(n);
        if (!c) throw err('NotFoundError');
        if (c.kind === 'directory' && c.children!.size && !opts.recursive) throw err('InvalidModificationError');
        node.children!.delete(n);
      },
    }) as unknown as FileSystemDirectoryHandle;
  return dirHandle(root);
}
