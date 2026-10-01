import './app/styles.css';
import { initLocale } from './i18n';
import { applyTheme, loadTheme } from './app/theme';
import { App } from './app/app';
import { installPwa } from './app/pwa';
import { installRecent } from './app/recent-ui';
import { clearDraft, loadDraft, saveDraft } from './storage/recent';

applyTheme(loadTheme());
initLocale();
const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');
const app = new App(root, { drafts: { save: saveDraft, load: loadDraft, clear: clearDraft } });
installRecent(app);
installPwa(app);
