/** COLOR-001: a "⋯" button next to a colour input, choosing its colour by RGB or CMYK values. */
import { button } from '../app/dom';
import { t } from '../i18n';

export function colorMoreButton(input: HTMLInputElement, title: string, host: () => HTMLElement = () => document.body): HTMLButtonElement {
  return button(
    `${title}: ${t('color.more')}`,
    async () => {
      const { colorDialog } = await import('./dialog');
      const hex = await colorDialog(host(), { title, current: input.value });
      if (!hex) return;
      input.value = hex;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { text: '⋯', title: t('color.more'), className: 'color-more' },
  );
}
