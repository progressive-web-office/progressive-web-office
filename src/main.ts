import './app/styles.css';
import { initLocale } from './i18n';
import { applyTheme, loadTheme } from './app/theme';
import { App } from './app/app';
import { installPwa } from './app/pwa';
import { followKeyboard } from './app/keyboard';
import { installRecent } from './app/recent-ui';
import { clearDraft, loadDraft, saveDraft } from './storage/recent';
import { inExam, installExamGuards, type ExamEventKind } from './exam/mode';

// TEACH-005: in exam mode, the guards come before anything can reach the network.
let sayRefused: (kind: ExamEventKind) => void = () => {};
installExamGuards((kind) => sayRefused(kind));
applyTheme(loadTheme());
// UI-022: the floating buttons stay above the on-screen keyboard.
followKeyboard();
initLocale();
const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');
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
