/**
 * A small WASI (preview 1) for programs compiled from C/C++ (CODE-018): their
 * arguments, standard output and error, the clock and random numbers. With a
 * project (CODE-019), its files: read, and written in memory for the run
 * only, relative to the project's folder; and a standard input. Calls it
 * does not offer return ENOSYS.
 */

const ENOSYS = 52;
const EBADF = 8;
const ESPIPE = 70;
const ENOENT = 44;
const EISDIR = 31;
const ENOTDIR = 54;
const EINVAL = 28;
const EEXIST = 20;

/** The files a program sees. */
export interface WasiFiles {
  /** Files by path relative to the project. */
  files: Record<string, Uint8Array>;
  /** The working folder, relative to the project: relative paths start there. */
  cwd: string;
  stdin?: Uint8Array;
}

interface OpenFile {
  path: string;
  dir: boolean;
  pos: number;
}

/** `a/./b/../c` relative to `cwd`; undefined when it leaves the project. */
function resolvePath(cwd: string, path: string): string | undefined {
  const out = path.startsWith('/') ? [] : cwd.split('/').filter(Boolean);
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!out.length) return undefined;
      out.pop();
    } else out.push(part);
  }
  return out.join('/');
}

export class WasiExit extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

export function runWasi(module: WebAssembly.Module, args: string[], write: (fd: 1 | 2, text: string) => void, fs?: WasiFiles): number {
  let memory: WebAssembly.Memory | undefined;
  const view = (): DataView => new DataView(memory!.buffer);
  const bytes = (): Uint8Array => new Uint8Array(memory!.buffer);
  const enc = new TextEncoder();
  const decoders = { 1: new TextDecoder(), 2: new TextDecoder() };
  const argv = args.map((a) => enc.encode(`${a}\0`));
  // CODE-019: a copy of the files, which the program may change; fd 3 is the preopened folder "/".
  const files = new Map(Object.entries(fs?.files ?? {}).map(([p, b]) => [p, b.slice()]));
  const isDir = (p: string): boolean => p === '' || [...files.keys()].some((f) => f.startsWith(`${p}/`));
  const open = new Map<number, OpenFile>();
  let nextFd = 4;
  let stdinPos = 0;
  const pathAt = (ptr: number, len: number): string => new TextDecoder().decode(bytes().subarray(ptr, ptr + len));
  /** The project path of a path given relative to a folder descriptor. */
  const lookup = (dirFd: number, path: string): string | undefined => {
    if (!fs) return undefined;
    if (dirFd === 3) return resolvePath(fs.cwd, path);
    const dir = open.get(dirFd);
    return dir?.dir ? resolvePath(dir.path, path) : undefined;
  };
  const iovecs = (iovs: number, len: number): [number, number][] =>
    Array.from({ length: len }, (_, i) => [view().getUint32(iovs + i * 8, true), view().getUint32(iovs + i * 8 + 4, true)]);
  const filestat = (ptr: number, dir: boolean, size: number): number => {
    for (let i = 0; i < 64; i += 8) view().setBigUint64(ptr + i, 0n, true);
    view().setUint8(ptr + 16, dir ? 3 : 4);
    view().setBigUint64(ptr + 24, 1n, true);
    view().setBigUint64(ptr + 32, BigInt(size), true);
    return 0;
  };
  const impl: Record<string, (...a: number[]) => number> = {
    args_sizes_get(countPtr, sizePtr) {
      view().setUint32(countPtr, argv.length, true);
      view().setUint32(sizePtr, argv.reduce((n, a) => n + a.length, 0), true);
      return 0;
    },
    args_get(argvPtr, bufPtr) {
      let at = bufPtr;
      argv.forEach((a, i) => {
        view().setUint32(argvPtr + i * 4, at, true);
        bytes().set(a, at);
        at += a.length;
      });
      return 0;
    },
    environ_sizes_get(countPtr, sizePtr) {
      view().setUint32(countPtr, 0, true);
      view().setUint32(sizePtr, 0, true);
      return 0;
    },
    environ_get: () => 0,
    clock_res_get(_id, resPtr) {
      view().setBigUint64(resPtr, 1000n, true);
      return 0;
    },
    clock_time_get(id, _precision, timePtr) {
      const ns = id === 0 ? BigInt(Date.now()) * 1_000_000n : BigInt(Math.round(performance.now() * 1e6));
      view().setBigUint64(timePtr, ns, true);
      return 0;
    },
    fd_write(fd, iovs, iovsLen, writtenPtr) {
      const file = open.get(fd);
      if (file) {
        if (file.dir) return EISDIR;
        let data = files.get(file.path) ?? new Uint8Array();
        let n = 0;
        for (const [ptr, len] of iovecs(iovs, iovsLen)) {
          if (file.pos + len > data.length) {
            const grown = new Uint8Array(file.pos + len);
            grown.set(data);
            data = grown;
          }
          data.set(bytes().subarray(ptr, ptr + len), file.pos);
          file.pos += len;
          n += len;
        }
        files.set(file.path, data);
        view().setUint32(writtenPtr, n, true);
        return 0;
      }
      if (fd !== 1 && fd !== 2) return EBADF;
      let n = 0;
      for (let i = 0; i < iovsLen; i++) {
        const ptr = view().getUint32(iovs + i * 8, true);
        const len = view().getUint32(iovs + i * 8 + 4, true);
        write(fd, decoders[fd].decode(bytes().subarray(ptr, ptr + len), { stream: true }));
        n += len;
      }
      view().setUint32(writtenPtr, n, true);
      return 0;
    },
    fd_read(fd, iovs, iovsLen, readPtr) {
      const file = open.get(fd);
      if (fd !== 0 && !file) return EBADF;
      if (file?.dir) return EISDIR;
      const data = file ? (files.get(file.path) ?? new Uint8Array()) : (fs?.stdin ?? new Uint8Array());
      let pos = file ? file.pos : stdinPos;
      let n = 0;
      for (const [ptr, len] of iovecs(iovs, iovsLen)) {
        const chunk = data.subarray(pos, Math.min(data.length, pos + len));
        bytes().set(chunk, ptr);
        pos += chunk.length;
        n += chunk.length;
        if (chunk.length < len) break;
      }
      if (file) file.pos = pos;
      else stdinPos = pos;
      view().setUint32(readPtr, n, true);
      return 0;
    },
    fd_fdstat_get(fd, statPtr) {
      const file = fd === 3 && fs ? { dir: true } : open.get(fd);
      if (fd > 2 && !file) return EBADF;
      // A character device (2), a folder (3) or a file (4); no flags, all rights.
      view().setUint8(statPtr, file ? (file.dir ? 3 : 4) : 2);
      view().setUint16(statPtr + 2, 0, true);
      view().setBigUint64(statPtr + 8, 0xffffffffn, true);
      view().setBigUint64(statPtr + 16, 0xffffffffn, true);
      return 0;
    },
    fd_fdstat_set_flags: () => 0,
    fd_close(fd) {
      open.delete(fd);
      return 0;
    },
    fd_seek(fd, offset, whence, newPtr) {
      const file = open.get(fd);
      if (!file) return fd <= 2 ? ESPIPE : EBADF;
      const size = files.get(file.path)?.length ?? 0;
      const to = Number(offset as unknown as bigint) + (whence === 0 ? 0 : whence === 1 ? file.pos : size);
      if (to < 0) return EINVAL;
      file.pos = to;
      view().setBigUint64(newPtr, BigInt(to), true);
      return 0;
    },
    fd_tell(fd, ptr) {
      const file = open.get(fd);
      if (!file) return EBADF;
      view().setBigUint64(ptr, BigInt(file.pos), true);
      return 0;
    },
    fd_filestat_get(fd, ptr) {
      const file = fd === 3 && fs ? { path: '', dir: true } : open.get(fd);
      if (!file) return fd <= 2 ? filestat(ptr, false, 0) : EBADF;
      return filestat(ptr, file.dir, files.get(file.path)?.length ?? 0);
    },
    path_filestat_get(fd, _flags, pathPtr, pathLen, ptr) {
      const path = lookup(fd, pathAt(pathPtr, pathLen));
      if (path === undefined) return ENOENT;
      if (files.has(path)) return filestat(ptr, false, files.get(path)!.length);
      return isDir(path) ? filestat(ptr, true, 0) : ENOENT;
    },
    path_open(fd, _dirflags, pathPtr, pathLen, oflags, _rights, _inherited, fdflags, fdPtr) {
      const path = lookup(fd, pathAt(pathPtr, pathLen));
      if (path === undefined) return ENOENT;
      const exists = files.has(path);
      const dir = !exists && isDir(path);
      // O_CREAT 1, O_DIRECTORY 2, O_EXCL 4, O_TRUNC 8.
      if (oflags & 2 && !dir) return ENOTDIR;
      if (dir && oflags & 9) return EISDIR;
      if (exists && oflags & 4) return EEXIST;
      if (!exists && !dir) {
        if (!(oflags & 1)) return ENOENT;
        files.set(path, new Uint8Array());
      } else if (oflags & 8) files.set(path, new Uint8Array());
      const id = nextFd++;
      // FDFLAGS_APPEND 1: writes go at the end.
      open.set(id, { path, dir, pos: fdflags & 1 ? (files.get(path)?.length ?? 0) : 0 });
      view().setUint32(fdPtr, id, true);
      return 0;
    },
    fd_prestat_get(fd, ptr) {
      if (fd !== 3 || !fs) return EBADF;
      // A folder (tag 0) named "/".
      view().setUint8(ptr, 0);
      view().setUint32(ptr + 4, 1, true);
      return 0;
    },
    fd_prestat_dir_name(fd, ptr, len) {
      if (fd !== 3 || !fs || len < 1) return EBADF;
      bytes()[ptr] = 0x2f;
      return 0;
    },
    random_get(ptr, len) {
      crypto.getRandomValues(bytes().subarray(ptr, ptr + len) as Uint8Array<ArrayBuffer>);
      return 0;
    },
    sched_yield: () => 0,
    proc_exit(code) {
      throw new WasiExit(code);
    },
  };
  const wasi = new Proxy(impl, { get: (target, name: string) => target[name] ?? (() => ENOSYS) });
  const instance = new WebAssembly.Instance(module, { wasi_snapshot_preview1: wasi as unknown as WebAssembly.ModuleImports });
  memory = instance.exports.memory as WebAssembly.Memory;
  try {
    (instance.exports._start as () => void)();
    return 0;
  } catch (err) {
    if (err instanceof WasiExit) return err.code;
    throw err;
  } finally {
    for (const fd of [1, 2] as const) {
      const rest = decoders[fd].decode();
      if (rest) write(fd, rest);
    }
  }
}
