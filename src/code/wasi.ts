/**
 * A small WASI (preview 1) for programs compiled from C/C++ (CODE-018): their
 * arguments, standard output and error, the clock and random numbers; no
 * files, no input. Calls it does not offer return ENOSYS.
 */

const ENOSYS = 52;
const EBADF = 8;
const ESPIPE = 70;

export class WasiExit extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

export function runWasi(module: WebAssembly.Module, args: string[], write: (fd: 1 | 2, text: string) => void): number {
  let memory: WebAssembly.Memory | undefined;
  const view = (): DataView => new DataView(memory!.buffer);
  const bytes = (): Uint8Array => new Uint8Array(memory!.buffer);
  const enc = new TextEncoder();
  const decoders = { 1: new TextDecoder(), 2: new TextDecoder() };
  const argv = args.map((a) => enc.encode(`${a}\0`));
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
    fd_read(fd, _iovs, _len, readPtr) {
      if (fd !== 0) return EBADF;
      view().setUint32(readPtr, 0, true);
      return 0;
    },
    fd_fdstat_get(fd, statPtr) {
      if (fd > 2) return EBADF;
      // A character device (filetype 2), no flags, all rights.
      view().setUint8(statPtr, 2);
      view().setUint16(statPtr + 2, 0, true);
      view().setBigUint64(statPtr + 8, 0xffffffffn, true);
      view().setBigUint64(statPtr + 16, 0xffffffffn, true);
      return 0;
    },
    fd_close: () => 0,
    fd_seek: () => ESPIPE,
    fd_prestat_get: () => EBADF,
    fd_prestat_dir_name: () => EBADF,
    random_get(ptr, len) {
      crypto.getRandomValues(bytes().subarray(ptr, ptr + len));
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
