/** Lazy access to MathLive (MATH-001, MATH-002): never loaded unless equations are used. */

type MathLive = typeof import('mathlive');
let loading: Promise<MathLive> | undefined;

export function loadMathLive(): Promise<MathLive> {
  loading ??= import('mathlive').then(async (m) => {
    const el = (m as { MathfieldElement?: { fontsDirectory: string | null; soundsDirectory: string | null } }).MathfieldElement;
    if (el && typeof document !== 'undefined') {
      // Fonts are bundled by Vite through the stylesheets below (no network, MATH-002).
      el.fontsDirectory = null;
      el.soundsDirectory = null;
      await Promise.all([import('mathlive/fonts.css'), import('mathlive/static.css')]);
    }
    return m;
  });
  return loading;
}

export async function latexToMathml(latex: string): Promise<string> {
  const m = await loadMathLive();
  return m.convertLatexToMathMl(latex);
}

export async function latexToMarkup(latex: string, display: boolean): Promise<string> {
  const m = await loadMathLive();
  return m.convertLatexToMarkup(latex, { defaultMode: display ? 'math' : 'inline-math' });
}
