/**
 * Equation format conversions (MATH-004, MATH-005):
 * MathML -> LaTeX, MathML -> Office Math (OMML), OMML -> LaTeX.
 * They cover the common subset (fractions, scripts, roots, n-ary operators,
 * matrices, delimiters, functions, accents, Greek letters and operators).
 */
import { escapeXml as esc, parseXml } from '../core/xml';

export const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';
export const OMML_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

const SYMBOLS: Record<string, string> = {
  α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\epsilon', ϵ: '\\epsilon', ζ: '\\zeta', η: '\\eta', θ: '\\theta',
  ι: '\\iota', κ: '\\kappa', λ: '\\lambda', μ: '\\mu', ν: '\\nu', ξ: '\\xi', π: '\\pi', ρ: '\\rho', σ: '\\sigma', τ: '\\tau',
  υ: '\\upsilon', φ: '\\phi', ϕ: '\\phi', χ: '\\chi', ψ: '\\psi', ω: '\\omega', Γ: '\\Gamma', Δ: '\\Delta', Θ: '\\Theta',
  Λ: '\\Lambda', Ξ: '\\Xi', Π: '\\Pi', Σ: '\\Sigma', Φ: '\\Phi', Ψ: '\\Psi', Ω: '\\Omega',
  '≤': '\\leq', '≥': '\\geq', '≠': '\\neq', '±': '\\pm', '∓': '\\mp', '×': '\\times', '÷': '\\div', '·': '\\cdot', '⋅': '\\cdot',
  '∞': '\\infty', '→': '\\to', '←': '\\leftarrow', '⇒': '\\Rightarrow', '⇔': '\\Leftrightarrow', '↔': '\\leftrightarrow',
  '∈': '\\in', '∉': '\\notin', '⊂': '\\subset', '⊆': '\\subseteq', '⊃': '\\supset', '∪': '\\cup', '∩': '\\cap', '∅': '\\emptyset',
  '∀': '\\forall', '∃': '\\exists', '∂': '\\partial', '∇': '\\nabla', '≈': '\\approx', '≡': '\\equiv', '∼': '\\sim', '∝': '\\propto',
  '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '∬': '\\iint', '∮': '\\oint', '…': '\\ldots', '⋯': '\\cdots', '′': "'", '∘': '\\circ',
  '¬': '\\neg', '∧': '\\wedge', '∨': '\\vee', '⊥': '\\perp', '∠': '\\angle', '°': '^{\\circ}', 'ℝ': '\\mathbb{R}', 'ℕ': '\\mathbb{N}',
  'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}', 'ℂ': '\\mathbb{C}', '{': '\\{', '}': '\\}', '%': '\\%', '#': '\\#', '&': '\\&',
};
const INVISIBLE = /[⁡-⁤​]/g;
const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'deg', 'dim', 'ker', 'arg', 'Pr']);
const NARY = new Set(['∑', '∏', '∫', '∬', '∭', '∮', '⋃', '⋂']);

function symbols(text: string): string {
  return [...text.replace(INVISIBLE, '')].map((c) => SYMBOLS[c] ?? c).join('');
}

/** Concatenate LaTeX fragments, separating a control word from a following letter. */
function join(parts: string[]): string {
  let out = '';
  for (const p of parts) {
    if (!p) continue;
    if (/\\[A-Za-z]+$/.test(out) && /^[A-Za-z0-9]/.test(p)) out += ' ';
    out += p;
  }
  return out;
}

const group = (s: string): string => (/^(\\[A-Za-z]+|.)$/.test(s) ? s : `{${s}}`);
const arg = (s: string): string => `{${s}}`;

// --- MathML -> LaTeX ------------------------------------------------------------

function mathmlRoot(input: string | Element): Element {
  if (typeof input !== 'string') return input;
  const src = input.trim().startsWith('<math') ? input : `<math xmlns="${MATHML_NS}">${input}</math>`;
  return parseXml(src).documentElement;
}

export function mathmlToLatex(input: string | Element): string {
  const conv = (el: Element): string => {
    const kids = Array.from(el.children);
    const c = (i: number): string => (kids[i] ? conv(kids[i]!) : '');
    switch (el.localName) {
      case 'semantics': {
        const tex = kids.find((k) => k.localName === 'annotation' && /tex/i.test(k.getAttribute('encoding') ?? ''));
        return tex ? (tex.textContent ?? '').trim() : c(0);
      }
      case 'annotation':
      case 'annotation-xml':
      case 'mspace':
      case 'none':
      case 'mprescripts':
        return '';
      case 'mi': {
        const t = (el.textContent ?? '').trim();
        return FUNCTIONS.has(t) ? `\\${t}` : t.length > 1 && !/^[\p{L}]$/u.test(t) && /^[A-Za-z]+$/.test(t) ? `\\mathrm{${t}}` : symbols(t);
      }
      case 'mn':
        return (el.textContent ?? '').trim();
      case 'mo':
        return symbols((el.textContent ?? '').trim());
      case 'mtext': {
        const t = el.textContent ?? '';
        return t.trim() ? `\\text{${t}}` : '';
      }
      case 'mfrac':
        return `\\frac${arg(c(0))}${arg(c(1))}`;
      case 'msup':
      case 'mover':
        return `${group(c(0))}^${arg(c(1))}`;
      case 'msub':
      case 'munder':
        return `${group(c(0))}_${arg(c(1))}`;
      case 'msubsup':
      case 'munderover':
        return `${group(c(0))}_${arg(c(1))}^${arg(c(2))}`;
      case 'msqrt':
        return `\\sqrt${arg(join(kids.map(conv)))}`;
      case 'mroot':
        return `\\sqrt[${c(1)}]${arg(c(0))}`;
      case 'mtable':
        return `\\begin{matrix}${kids.map((row) => Array.from(row.children).map(conv).join('&')).join('\\\\')}\\end{matrix}`;
      case 'mtd':
      case 'mtr':
        return join(kids.map(conv));
      case 'mfenced': {
        const open = el.getAttribute('open') ?? '(';
        const close = el.getAttribute('close') ?? ')';
        return `\\left${open === '{' ? '\\{' : open || '.'}${kids.map(conv).join(el.getAttribute('separators') ?? ',')}\\right${close === '}' ? '\\}' : close || '.'}`;
      }
      default:
        return join(kids.map(conv));
    }
  };
  return conv(mathmlRoot(input)).trim();
}

// --- MathML -> OMML ---------------------------------------------------------------

const run = (text: string, plain = false): string =>
  text ? `<m:r>${plain ? '<m:rPr><m:sty m:val="p"/></m:rPr>' : ''}<m:t xml:space="preserve">${esc(text)}</m:t></m:r>` : '';

export function mathmlToOmml(input: string | Element): string {
  const conv = (el: Element): string => {
    const kids = Array.from(el.children);
    const c = (i: number): string => (kids[i] ? conv(kids[i]!) : '');
    switch (el.localName) {
      case 'semantics':
        return c(0);
      case 'annotation':
      case 'annotation-xml':
      case 'mspace':
      case 'none':
        return '';
      case 'mi': {
        const t = (el.textContent ?? '').replace(INVISIBLE, '').trim();
        return run(t, t.length > 1);
      }
      case 'mn':
      case 'mo':
        return run((el.textContent ?? '').replace(INVISIBLE, '').trim());
      case 'mtext':
        return run(el.textContent ?? '', true);
      case 'mfrac':
        return `<m:f><m:num>${c(0)}</m:num><m:den>${c(1)}</m:den></m:f>`;
      case 'msup':
        return `<m:sSup><m:e>${c(0)}</m:e><m:sup>${c(1)}</m:sup></m:sSup>`;
      case 'msub':
        return `<m:sSub><m:e>${c(0)}</m:e><m:sub>${c(1)}</m:sub></m:sSub>`;
      case 'msubsup':
      case 'munderover':
      case 'munder':
      case 'mover': {
        const base = kids[0];
        const op = base?.localName === 'mo' ? (base.textContent ?? '').trim() : '';
        const sub = el.localName === 'mover' ? '' : c(1);
        const sup = el.localName === 'munder' ? '' : el.localName === 'mover' ? c(1) : c(2);
        if (NARY.has(op)) {
          return `<m:nary><m:naryPr><m:chr m:val="${op}"/>${sub ? '' : '<m:subHide m:val="1"/>'}${sup ? '' : '<m:supHide m:val="1"/>'}</m:naryPr><m:sub>${sub}</m:sub><m:sup>${sup}</m:sup><m:e/></m:nary>`;
        }
        if (el.localName === 'munder') return `<m:limLow><m:e>${c(0)}</m:e><m:lim>${sub}</m:lim></m:limLow>`;
        if (el.localName === 'mover') return `<m:limUpp><m:e>${c(0)}</m:e><m:lim>${sup}</m:lim></m:limUpp>`;
        return `<m:sSubSup><m:e>${c(0)}</m:e><m:sub>${sub}</m:sub><m:sup>${sup}</m:sup></m:sSubSup>`;
      }
      case 'msqrt':
        return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${kids.map(conv).join('')}</m:e></m:rad>`;
      case 'mroot':
        return `<m:rad><m:deg>${c(1)}</m:deg><m:e>${c(0)}</m:e></m:rad>`;
      case 'mtable':
        return `<m:m>${kids.map((row) => `<m:mr>${Array.from(row.children).map((cell) => `<m:e>${conv(cell)}</m:e>`).join('')}</m:mr>`).join('')}</m:m>`;
      default:
        return kids.map(conv).join('');
    }
  };
  return conv(mathmlRoot(input));
}

// --- OMML -> LaTeX ------------------------------------------------------------------

const DELIMS: Record<string, string> = { '(': '(', ')': ')', '[': '[', ']': ']', '{': '\\{', '}': '\\}', '|': '|', '‖': '\\|', '⟨': '\\langle', '⟩': '\\rangle', '': '.' };
const ACCENTS: Record<string, string> = { '̂': '\\hat', '^': '\\hat', '̄': '\\bar', '¯': '\\bar', '⃗': '\\vec', '→': '\\vec', '̇': '\\dot', '̃': '\\tilde', '~': '\\tilde' };

function prop(el: Element, pr: string, name: string): string | null {
  const p = Array.from(el.children).find((k) => k.localName === pr);
  const v = p && Array.from(p.children).find((k) => k.localName === name);
  return v ? (v.getAttributeNS(OMML_NS, 'val') ?? v.getAttribute('m:val') ?? '') : null;
}

export function ommlToLatex(root: Element): string {
  const part = (el: Element, name: string): Element | undefined => Array.from(el.children).find((k) => k.localName === name);
  const conv = (el: Element | undefined, inFunctionName = false): string => {
    if (!el) return '';
    const sub = (name: string): string => conv(part(el, name));
    switch (el.localName) {
      case 'r': {
        const text = Array.from(el.children).filter((k) => k.localName === 't').map((t) => t.textContent ?? '').join('');
        const plain = prop(el, 'rPr', 'sty') === 'p';
        if (inFunctionName || (plain && text.length > 1)) {
          const t = text.trim();
          if (FUNCTIONS.has(t)) return `\\${t}`;
          return inFunctionName ? `\\operatorname{${t}}` : `\\text{${text}}`;
        }
        return symbols(text);
      }
      case 'f':
        return `\\frac${arg(sub('num'))}${arg(sub('den'))}`;
      case 'sSup':
        return `${group(sub('e'))}^${arg(sub('sup'))}`;
      case 'sSub':
        return `${group(sub('e'))}_${arg(sub('sub'))}`;
      case 'sSubSup':
        return `${group(sub('e'))}_${arg(sub('sub'))}^${arg(sub('sup'))}`;
      case 'sPre':
        return `{}_${arg(sub('sub'))}^${arg(sub('sup'))}${group(sub('e'))}`;
      case 'rad': {
        const deg = sub('deg');
        return deg && prop(el, 'radPr', 'degHide') !== '1' ? `\\sqrt[${deg}]${arg(sub('e'))}` : `\\sqrt${arg(sub('e'))}`;
      }
      case 'nary': {
        const chr = prop(el, 'naryPr', 'chr') || '∫';
        const lo = sub('sub');
        const hi = sub('sup');
        const e = sub('e');
        return `${SYMBOLS[chr] ?? chr}${lo ? `_${arg(lo)}` : ''}${hi ? `^${arg(hi)}` : ''}${e ? arg(e) : ''}`;
      }
      case 'd': {
        const beg = prop(el, 'dPr', 'begChr') ?? '(';
        const end = prop(el, 'dPr', 'endChr') ?? ')';
        const sep = prop(el, 'dPr', 'sepChr') ?? '|';
        const items = Array.from(el.children).filter((k) => k.localName === 'e').map((k) => conv(k));
        return `\\left${DELIMS[beg] ?? beg}${items.join(sep)}\\right${DELIMS[end] ?? end}`;
      }
      case 'func':
        return `${conv(part(el, 'fName'), true)}${arg(sub('e'))}`;
      case 'fName':
        return join(Array.from(el.children).map((k) => conv(k, true)));
      case 'm':
        return `\\begin{matrix}${Array.from(el.children)
          .filter((k) => k.localName === 'mr')
          .map((row) => Array.from(row.children).filter((k) => k.localName === 'e').map((k) => conv(k)).join('&'))
          .join('\\\\')}\\end{matrix}`;
      case 'acc': {
        const chr = prop(el, 'accPr', 'chr') ?? '̂';
        return `${ACCENTS[chr] ?? '\\hat'}${arg(sub('e'))}`;
      }
      case 'bar':
        return `${prop(el, 'barPr', 'pos') === 'top' ? '\\overline' : '\\underline'}${arg(sub('e'))}`;
      case 'limLow':
        return `${group(sub('e'))}_${arg(sub('lim'))}`;
      case 'limUpp':
        return `${group(sub('e'))}^${arg(sub('lim'))}`;
      case 'eqArr':
        return `\\begin{aligned}${Array.from(el.children).filter((k) => k.localName === 'e').map((k) => conv(k)).join('\\\\')}\\end{aligned}`;
      default:
        if (el.localName.endsWith('Pr')) return '';
        return join(Array.from(el.children).map((k) => conv(k, inFunctionName)));
    }
  };
  return conv(root).trim();
}
