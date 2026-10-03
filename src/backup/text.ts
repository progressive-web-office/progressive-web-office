/** BACKUP-004: how old the last backup is, in words. */
import { t } from '../i18n';
import { daysSinceBackup, type BackupSettings } from './settings';

export function lastBackupText(s: BackupSettings, now = Date.now()): string {
  const days = daysSinceBackup(s, now);
  if (days === undefined || !s.last) return t('backup.never');
  const when = new Date(s.last.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return t(days === 0 ? 'backup.lastToday' : 'backup.lastDays', { n: days, when });
}

/** The short age shown in the header: "today", "3 d", or "!" when there was none. */
export function backupAge(s: BackupSettings, now = Date.now()): string {
  const days = daysSinceBackup(s, now);
  return days === undefined ? '!' : days === 0 ? t('backup.ageToday') : t('backup.ageDays', { n: days });
}
