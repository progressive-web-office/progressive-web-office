import './app/styles.css';
import { initLocale } from './i18n';
import { applyTheme, loadTheme } from './app/theme';
import { applyPaper, loadPaper } from './app/paper';
import { App } from './app/app';
import { installPwa } from './app/pwa';
import { followKeyboard } from './app/keyboard';
import { installRecent } from './app/recent-ui';
import { clearDraft, loadDraft, saveDraft } from './storage/recent';
import { inExam, installExamGuards, type ExamEventKind } from './exam/mode';
import { loadLock, lockSet } from './lock/session';
import { wrapPrivateStorage } from './fs';
import { sealed } from './lock/sealed-provider';

// TEACH-005: in exam mode, the guards come before anything can reach the network.
let sayRefused: (kind: ExamEventKind) => void = () => {};
installExamGuards((kind) => sayRefused(kind));
applyTheme(loadTheme());
applyPaper(loadPaper());
// UI-022: the floating buttons stay above the on-screen keyboard.
followKeyboard();
initLocale();
const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');
// LOCK-002: the files of the browser's storage sealed while the lock is set.
wrapPrivateStorage(sealed);
// LOCK-001: nothing of what the browser keeps is shown before the lock opens.
if (lockSet()) {
  root.hidden = true;
  const { unlockScreen } = await import('./lock/ui');
  await unlockScreen(root);
  root.hidden = false;
}
// LOCK-004: locked again after the delay chosen without use.
const idle = loadLock()?.idleMinutes;
if (idle) void import('./lock/manager').then(({ lockWhenIdle }) => lockWhenIdle(idle));
const app = new App(root, { drafts: { save: saveDraft, load: loadDraft, clear: clearDraft } });
installRecent(app);
installPwa(app);
if (inExam()) {
  void import('./exam/ui').then(({ examBanner }) => {
    const banner = examBanner(root);
    sayRefused = banner.say;
    document.body.classList.add('exam-mode');
    document.body.prepend(banner.element);
  });
}
