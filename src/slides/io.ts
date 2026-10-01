/** Read/write presentations in any supported format. */
import type { DocumentFormat } from '../core/format';
import type { Presentation } from './model';
import { readOdp } from './odp-reader';
import { writeOdp } from './odp-writer';
import { readPptx } from './pptx-reader';
import { writePptx } from './pptx-writer';

export type SlidesFormat = Extract<DocumentFormat, 'pptx' | 'odp'>;

export function readPresentation(format: SlidesFormat, bytes: Uint8Array): Presentation {
  return format === 'pptx' ? readPptx(bytes) : readOdp(bytes);
}

export function writePresentation(pres: Presentation, format: SlidesFormat): Uint8Array {
  return format === 'pptx' ? writePptx(pres) : writeOdp(pres);
}
