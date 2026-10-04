/** TEACH-005: starting the exam mode, its banner, and leaving it with the teacher's code. */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import { checkCode, endExam, loadExam, startExam, type ExamEvent, type ExamEventKind } from './mode';

const showModal = (host: HTMLElement, dialog: HTMLDialogElement): void => {
  host.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
};

const time = (at: number): string => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** The log as lines of text, for the teacher. */
export function logText(log: ExamEvent[]): string {
  return log.map((e) => `${new Date(e.at).toLocaleString()}\t${t(`exam.event.${e.kind}` as MessageKey)}${e.detail ? ` (${e.detail})` : ''}`).join('\n');
}

/** How many times each kind of event happened (start left out). */
function counts(log: ExamEvent[]): string {
  const n = new Map<ExamEventKind, number>();
  for (const e of log) if (e.kind !== 'start') n.set(e.kind, (n.get(e.kind) ?? 0) + 1);
  return n.size ? [...n].map(([k, v]) => `${t(`exam.event.${k}` as MessageKey)}: ${v}`).join(' · ') : t('exam.nothing');
}

/** Ask the teacher for a code (twice) and a name for the test, then start. */
export function chooseStartExam(host: HTMLElement): Promise<boolean> {
  return new Promise((resolve) => {
    const title = h('input', { type: 'text', placeholder: t('exam.titlePlaceholder') });
    const code = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'new-password' });
    const again = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'new-password' });
    const problem = h('p', { class: 'error', role: 'alert', hidden: '' });
    const dialog = h('dialog', { class: 'dialog exam-dialog', 'aria-labelledby': 'exam-start-title' });
    const finish = (ok: boolean): void => {
      dialog.close();
      dialog.remove();
      resolve(ok);
    };
    const start = async (): Promise<void> => {
      const fail = (key: MessageKey): void => {
        problem.textContent = t(key);
        problem.hidden = false;
      };
      if (code.value.length < 4) return fail('exam.codeShort');
      if (code.value !== again.value) return fail('exam.codeMismatch');
      await startExam(code.value, title.value.trim() || undefined);
      finish(true);
    };
    const field = (label: MessageKey, control: HTMLElement): HTMLElement => h('label', { class: 'field' }, t(label), control);
    dialog.append(
      h('h2', { id: 'exam-start-title' }, `🔒 ${t('exam.startTitle')}`),
      h('p', {}, t('exam.what')),
      h('ul', {}, ...(['exam.offNetwork', 'exam.offPaste', 'exam.offDrop', 'exam.watch'] as const).map((k) => h('li', {}, t(k)))),
      h('p', { class: 'hint' }, t('exam.limits')),
      field('exam.titleLabel', title),
      field('exam.code', code),
      field('exam.codeAgain', again),
      problem,
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(false)), button(t('exam.start'), () => void start(), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    showModal(host, dialog);
    title.focus();
  });
}

/** The log, in a window. */
export function showExamLog(host: HTMLElement, log: ExamEvent[] = loadExam()?.log ?? [], ended = false): Promise<void> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog exam-dialog', 'aria-labelledby': 'exam-log-title' });
    const finish = (): void => {
      dialog.close();
      dialog.remove();
      resolve();
    };
    const save = (): void => {
      const a = h('a', { href: URL.createObjectURL(new Blob([`${logText(log)}\n`], { type: 'text/plain' })), download: `exam-log-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    dialog.append(
      h('h2', { id: 'exam-log-title' }, t(ended ? 'exam.endedTitle' : 'exam.logTitle')),
      h('p', { class: 'exam-counts' }, counts(log)),
      h('ol', { class: 'exam-log' }, ...log.map((e) => h('li', { class: `exam-${e.kind}` }, h('time', {}, time(e.at)), ' ', t(`exam.event.${e.kind}` as MessageKey), e.detail ? h('span', { class: 'hint' }, ` (${e.detail})`) : null))),
      h('div', { class: 'dialog-actions' }, button(t('exam.saveLog'), save), button(t('common.close'), finish, { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish();
    });
    showModal(host, dialog);
  });
}

/** Ask for the teacher's code; resolves to true once the mode is ended. */
export function chooseEndExam(host: HTMLElement): Promise<boolean> {
  return new Promise((resolve) => {
    const code = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off' });
    const problem = h('p', { class: 'error', role: 'alert', hidden: '' });
    const dialog = h('dialog', { class: 'dialog exam-dialog', 'aria-labelledby': 'exam-end-title' });
    const finish = (ok: boolean): void => {
      dialog.close();
      dialog.remove();
      resolve(ok);
    };
    const end = async (): Promise<void> => {
      if (!(await checkCode(code.value))) {
        problem.textContent = t('exam.wrongCode');
        problem.hidden = false;
        code.select();
        return;
      }
      const log = endExam();
      dialog.close();
      dialog.remove();
      await showExamLog(host, log, true);
      resolve(true);
    };
    code.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void end();
      }
    });
    dialog.append(
      h('h2', { id: 'exam-end-title' }, t('exam.endTitle')),
      h('label', { class: 'field' }, t('exam.teacherCode'), code),
      problem,
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(false)), button(t('exam.end'), () => void end(), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    showModal(host, dialog);
    code.focus();
  });
}

/** The banner always in sight in exam mode; `say` tells what was just refused. */
export function examBanner(host: HTMLElement): { element: HTMLElement; say(kind: ExamEventKind): void } {
  const state = loadExam();
  const status = h('span', { class: 'exam-status', role: 'status', 'aria-live': 'polite' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const element = h(
    'div',
    { class: 'exam-banner', role: 'region', 'aria-label': t('exam.banner') },
    h('strong', {}, `🔒 ${state?.title ? `${state.title} — ` : ''}${t('exam.banner')}`),
    h('span', { class: 'hint' }, t('exam.since', { time: state ? new Date(state.since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '' })),
    status,
    button(t('exam.fullscreen'), () => void document.documentElement.requestFullscreen?.().catch(() => undefined), { icon: '⛶' }),
    button(t('exam.log'), () => void showExamLog(host), { icon: '📋' }),
    button(t('exam.end'), async () => {
      if (await chooseEndExam(host)) location.reload();
    }, { icon: '🔓' }),
  );
  return {
    element,
    say: (kind) => {
      if (kind !== 'paste-blocked' && kind !== 'drop-blocked' && kind !== 'network-blocked') return;
      status.textContent = t(`exam.refused.${kind}`);
      clearTimeout(timer);
      timer = setTimeout(() => (status.textContent = ''), 6000);
    },
  };
}
