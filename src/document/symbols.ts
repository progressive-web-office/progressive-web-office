/**
 * DOC-051: special characters typed at the cursor — superscripts and
 * subscripts, degrees, signs of mathematics, units, currencies, quotes,
 * arrows, Greek letters — chosen in a grid, searched by name.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';

/** Each group: its name, then characters with a few words to find them. */
const GROUPS: [string, [string, string][]][] = [
  ['symbols.scripts', [['¹', 'superscript one exposant'], ['²', 'superscript two square carré'], ['³', 'superscript three cube'], ['⁰', 'superscript zero'], ['⁴', 'superscript four'], ['ⁿ', 'superscript n'], ['⁻', 'superscript minus'], ['₀', 'subscript zero indice'], ['₁', 'subscript one'], ['₂', 'subscript two'], ['₃', 'subscript three'], ['ᵉ', 'superscript e ordinal'], ['ʳ', 'superscript r'], ['ᵒ', 'ordinal o']]],
  ['symbols.maths', [['°', 'degree degré'], ['±', 'plus minus'], ['×', 'times multiplication'], ['÷', 'divide division'], ['−', 'minus moins'], ['≈', 'approximately environ'], ['≠', 'not equal différent'], ['≤', 'less or equal inférieur'], ['≥', 'greater or equal supérieur'], ['∞', 'infinity infini'], ['√', 'square root racine'], ['∑', 'sum somme'], ['∫', 'integral intégrale'], ['∂', 'partial'], ['∆', 'delta increment'], ['∈', 'element of appartient'], ['∀', 'for all'], ['∃', 'exists'], ['→', 'arrow right flèche'], ['←', 'arrow left'], ['↔', 'arrow both'], ['⇒', 'implies'], ['⇔', 'equivalent'], ['‰', 'per mille pour mille'], ['½', 'half demi'], ['¼', 'quarter quart'], ['¾', 'three quarters']]],
  ['symbols.greek', [['α', 'alpha'], ['β', 'beta'], ['γ', 'gamma'], ['δ', 'delta'], ['ε', 'epsilon'], ['θ', 'theta'], ['λ', 'lambda'], ['μ', 'mu micro'], ['π', 'pi'], ['ρ', 'rho'], ['σ', 'sigma'], ['τ', 'tau'], ['φ', 'phi'], ['ω', 'omega'], ['Δ', 'Delta'], ['Σ', 'Sigma'], ['Φ', 'Phi'], ['Ω', 'Omega ohm']]],
  ['symbols.text', [['« ', 'guillemets open french quotes'], [' »', 'guillemets close'], ['“', 'quote open'], ['”', 'quote close'], ['’', 'apostrophe'], ['…', 'ellipsis points de suspension'], ['–', 'en dash tiret'], ['—', 'em dash tiret cadratin'], ['•', 'bullet puce'], ['§', 'section paragraphe'], ['¶', 'pilcrow'], ['†', 'dagger'], [' ', 'non-breaking space espace insécable'], ['©', 'copyright'], ['®', 'registered'], ['™', 'trade mark marque'], ['✓', 'check coche'], ['✗', 'cross croix'], ['★', 'star étoile']]],
  ['symbols.units', [['€', 'euro'], ['£', 'pound livre'], ['$', 'dollar'], ['¥', 'yen yuan'], ['µ', 'micro'], ['Å', 'angstrom'], ['℃', 'celsius'], ['Ω', 'ohm']]],
];

/** Resolves to the character chosen, or null. */
export function chooseSymbol(host: HTMLElement): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog symbol-dialog', 'aria-label': t('doc.symbol') });
    const finish = (ch: string | null): void => {
      dialog.close();
      dialog.remove();
      resolve(ch);
    };
    const search = h('input', { type: 'search', placeholder: t('symbols.search'), 'aria-label': t('symbols.search') });
    const cells: { el: HTMLButtonElement; words: string }[] = [];
    const sections = GROUPS.map(([key, chars]) =>
      h(
        'section',
        {},
        h('h3', {}, t(key as 'symbols.maths')),
        h(
          'div',
          { class: 'symbol-grid' },
          ...chars.map(([ch, words]) => {
            const shown = ch.trim() || '⍽';
            const el = button(`${shown} — ${words.split(' ')[0]}`, () => finish(ch), { text: shown, className: 'symbol-cell', title: words });
            cells.push({ el, words: `${ch} ${words}`.toLowerCase() });
            return el;
          }),
        ),
      ),
    );
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      for (const c of cells) c.el.hidden = !!q && !c.words.includes(q);
    });
    dialog.append(h('h2', {}, t('doc.symbol')), search, h('div', { class: 'symbol-groups' }, ...sections), h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null))));
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    search.focus();
  });
}
