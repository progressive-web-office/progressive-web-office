/** Word goal of a document, words written per day, focus timer (DOC-034). */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { lastDays } from './writing-stats';

export interface GoalChoice {
  goal: number | undefined;
  /** Start a focus timer of this many minutes. */
  timer?: number;
}

export function editGoal(host: HTMLElement, current: { goal: number | undefined; words: number }): Promise<GoalChoice | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog goal-dialog', 'aria-labelledby': 'goal-title' });
    const goal = h('input', { type: 'number', min: '0', step: '50', value: current.goal ? String(current.goal) : '', placeholder: '1000' });
    const days = lastDays(14);
    const max = Math.max(1, ...days.map((d) => d.words));
    const finish = (c: GoalChoice | null): void => {
      dialog.close();
      dialog.remove();
      resolve(c);
    };
    const value = (): number | undefined => Number(goal.value) || undefined;
    dialog.append(
      h('h2', { id: 'goal-title' }, t('goal.title')),
      h('label', { class: 'field' }, t('goal.target'), goal),
      h('p', { class: 'hint' }, current.goal ? t('goal.progress', { words: current.words, goal: current.goal, pct: Math.min(100, Math.round((current.words / current.goal) * 100)) }) : t('goal.none', { words: current.words })),
      h('h3', {}, t('goal.days')),
      h(
        'ul',
        { class: 'goal-days', 'aria-label': t('goal.days') },
        ...days.map((d) =>
          h('li', {}, h('span', { class: 'goal-day' }, new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })), h('span', { class: 'goal-bar', style: `width: ${(d.words / max) * 100}%` }), h('span', { class: 'goal-count' }, String(d.words))),
        ),
      ),
      h('h3', {}, t('goal.timer')),
      h('p', { class: 'hint' }, t('goal.timerHint')),
      h('div', { class: 'comment-actions' }, button(t('goal.timer25'), () => finish({ goal: value(), timer: 25 })), button(t('goal.timer5'), () => finish({ goal: value(), timer: 5 }))),
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null)), button(t('common.ok'), () => finish({ goal: value() }), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    goal.focus();
  });
}
