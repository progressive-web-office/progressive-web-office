/**
 * BACKUP-002, BACKUP-004: where backups go, how often, and when the last one
 * was made — kept in this browser; a backup is due when the last one is
 * older than the chosen interval.
 */

/** `download`, `folder` (a folder chosen once), or `webdav:<account id>`. */
export type BackupTarget = 'download' | 'folder' | `webdav:${string}`;

export interface BackupSettings {
  target: BackupTarget;
  /** Days between backups; 0: no reminder. */
  every: number;
  encrypt: boolean;
  /** BACKUP-006: made by itself while the application is open (a folder or a cloud, not a download). */
  auto?: boolean;
  /** The last backup: when, where, its name and size. */
  last?: { at: number; target: BackupTarget; name: string; size: number; files: number };
}

const KEY = 'pwo.backup';
const DAY = 86_400_000;
export const DEFAULT_SETTINGS: BackupSettings = { target: 'download', every: 7, encrypt: true };

export function loadBackupSettings(): BackupSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<BackupSettings> | null;
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
    const target = raw.target === 'folder' || raw.target === 'download' || (typeof raw.target === 'string' && raw.target.startsWith('webdav:')) ? raw.target : DEFAULT_SETTINGS.target;
    return {
      target,
      every: typeof raw.every === 'number' && raw.every >= 0 ? raw.every : DEFAULT_SETTINGS.every,
      encrypt: raw.encrypt !== false,
      ...(raw.auto === true ? { auto: true } : {}),
      ...(raw.last && typeof raw.last.at === 'number' ? { last: raw.last } : {}),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveBackupSettings(s: BackupSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

/** Whether a reminder is due. */
export const backupDue = (s: BackupSettings, now = Date.now()): boolean => s.every > 0 && (!s.last || now - s.last.at >= s.every * DAY);

/** Whole days since the last backup, or undefined when there was none. */
export const daysSinceBackup = (s: BackupSettings, now = Date.now()): number | undefined => (s.last ? Math.max(0, Math.floor((now - s.last.at) / DAY)) : undefined);
