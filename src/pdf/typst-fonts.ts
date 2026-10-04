/**
 * PDF-020: the fonts of the typeset PDF, downloaded once and kept: Typst's
 * own (Libertinus, the New Computer Modern math font) and fonts with the
 * widths of the usual ones — Carlito for Calibri, Arimo for Arial, Tinos for
 * Times New Roman, Cousine for Courier New, Caladea for Cambria — so that
 * lines break where they do in Word or LibreOffice.
 */
import type { FontFamily } from '../document/typst-writer';

const CDN = 'https://cdn.jsdelivr.net';
const TYPST_ASSETS = `${CDN}/gh/typst/typst-assets@v0.14.2/files/fonts/`;
const google = (name: string, version: string, files: [dir: string, file: string][]): string[] => files.map(([dir, file]) => `${CDN}/npm/@expo-google-fonts/${name}@${version}/${dir}/${file}`);
const fourStyles = (name: string, version: string, prefix: string): string[] =>
  google(name, version, [
    ['400Regular', `${prefix}_400Regular.ttf`],
    ['400Regular_Italic', `${prefix}_400Regular_Italic.ttf`],
    ['700Bold', `${prefix}_700Bold.ttf`],
    ['700Bold_Italic', `${prefix}_700Bold_Italic.ttf`],
  ]);

/** The files of each family. */
export const FONT_FILES: Record<FontFamily, string[]> = {
  carlito: fourStyles('carlito', '0.4.1', 'Carlito'),
  arimo: fourStyles('arimo', '0.4.3', 'Arimo'),
  tinos: fourStyles('tinos', '0.4.2', 'Tinos'),
  cousine: fourStyles('cousine', '0.4.3', 'Cousine'),
  caladea: fourStyles('caladea', '0.4.2', 'Caladea'),
  libertinus: ['Regular', 'Italic', 'Bold', 'BoldItalic'].map((s) => `${TYPST_ASSETS}LibertinusSerif-${s}.otf`),
  math: [`${TYPST_ASSETS}NewCMMath-Regular.otf`],
};

export const FONT_ORIGIN = CDN;

/** The files the families need, in a stable order. */
export const fontUrls = (families: Iterable<FontFamily>): string[] => [...new Set(families)].sort().flatMap((f) => FONT_FILES[f]);
