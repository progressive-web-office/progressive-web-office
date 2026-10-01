import { describe, expect, it } from 'vitest';
import { latexToMathml } from '../src/math/mathlive';
import { mathmlToLatex, mathmlToOmml, ommlToLatex } from '../src/math/convert';
import { parseXml } from '../src/core/xml';

const SAMPLES = [
  '\\frac{a+b}{2}',
  'x^{2}+y_{i}',
  '\\sqrt{x}',
  '\\sqrt[3]{x}',
  '\\sum_{i=1}^{n}i^{2}',
  '\\int_{0}^{1}f(x)dx',
  '\\alpha\\leq\\beta',
  '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}',
  'E=mc^{2}',
];

/** Normalise LaTeX for comparison (spacing and redundant braces). */
const norm = (s: string) => s.replace(/\s+/g, '').replace(/\{(\w)\}/g, '$1').replace(/\\left|\\right/g, '');

describe('MATH conversions', () => {
  it.each(SAMPLES)('LaTeX -> MathML -> LaTeX preserves %s', async (latex) => {
    const mathml = await latexToMathml(latex);
    expect(norm(mathmlToLatex(mathml))).toBe(norm(latex.replace('\\begin{pmatrix}', '\\left(\\begin{matrix}').replace('\\end{pmatrix}', '\\end{matrix}\\right)')));
  });

  it.each(SAMPLES)('LaTeX -> MathML -> OMML -> LaTeX preserves %s', async (latex) => {
    const omml = mathmlToOmml(await latexToMathml(latex));
    const doc = parseXml(`<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${omml}</m:oMath>`);
    expect(norm(ommlToLatex(doc.documentElement))).toBe(norm(latex.replace('\\begin{pmatrix}', '(\\begin{matrix}').replace('\\end{pmatrix}', '\\end{matrix})')));
  });

  it('prefers a LaTeX annotation when present', () => {
    const mathml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mi>x</mi><annotation encoding="application/x-tex">\\mathbb{R}</annotation></semantics></math>';
    expect(mathmlToLatex(mathml)).toBe('\\mathbb{R}');
  });

  it('reads Word n-ary operators, delimiters and functions', () => {
    const omml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
      <m:nary><m:naryPr><m:chr m:val="∏"/></m:naryPr><m:sub><m:r><m:t>k</m:t></m:r></m:sub><m:sup/><m:e><m:r><m:t>a</m:t></m:r></m:e></m:nary>
      <m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr><m:e><m:r><m:t>x</m:t></m:r></m:e></m:d>
      <m:func><m:fName><m:r><m:t>sin</m:t></m:r></m:fName><m:e><m:r><m:t>θ</m:t></m:r></m:e></m:func>
    </m:oMath>`;
    expect(ommlToLatex(parseXml(omml).documentElement).replace(/\s+/g, '')).toBe('\\prod_{k}{a}\\left[x\\right]\\sin{\\theta}');
  });
});
