/**
 * LOCK-002: the browser's private storage, its files sealed while the lock
 * is set — encrypted when written, opened when read — for every part of the
 * application reading it (folders, synchronisation, backups) at once.
 */
import type { StorageProvider } from '../fs';
import { isEncrypted } from './crypto';
import { lockSet, seal, unseal } from './session';

export function sealed<T extends StorageProvider>(provider: T): T {
  return new Proxy(provider, {
    get(target, prop, receiver) {
      if (prop === 'read')
        return async (path: string): Promise<Blob> => {
          const blob = await target.read(path);
          const bytes = new Uint8Array(await blob.arrayBuffer());
          return isEncrypted(bytes) ? new Blob([(await unseal(bytes)) as BlobPart], { type: blob.type }) : blob;
        };
      if (prop === 'write')
        return async (path: string, data: Blob): Promise<void> => {
          if (!lockSet()) return target.write(path, data);
          return target.write(path, new Blob([(await seal(new Uint8Array(await data.arrayBuffer()))) as BlobPart]));
        };
      const value = Reflect.get(target, prop, receiver) as unknown;
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}
