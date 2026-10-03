/**
 * Syntax colours of code (FILE-022, CODE-011): the token classes shared by the
 * code viewer and the cell editor, and the code of the document's cells,
 * coloured when shown.
 */
import type { Language } from '@codemirror/language';
import { highlightCode, tagHighlighter, tags } from '@lezer/highlight';
import type { CodeLang } from '../document/model';
import './tokens.css';

/** Token classes, coloured by `tokens.css` in both themes (also in print). */
export const highlighter = tagHighlighter([
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], class: 'tok-comment' },
  { tag: [tags.string, tags.special(tags.string), tags.character, tags.regexp], class: 'tok-string' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], class: 'tok-number' },
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword, tags.operatorKeyword, tags.modifier, tags.self], class: 'tok-keyword' },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.standard(tags.typeName)], class: 'tok-type' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName], class: 'tok-function' },
  { tag: [tags.tagName, tags.angleBracket, tags.processingInstruction, tags.meta], class: 'tok-tag' },
  { tag: [tags.attributeName, tags.propertyName], class: 'tok-property' },
  { tag: [tags.heading, tags.strong], class: 'tok-strong' },
  { tag: [tags.inserted], class: 'tok-inserted' },
  { tag: [tags.deleted, tags.invalid], class: 'tok-deleted' },
]);

const languages = new Map<CodeLang, Promise<Language>>();

/** The grammar of a cell language, loaded once. */
export function cellLanguage(lang: CodeLang): Promise<Language> {
  let found = languages.get(lang);
  if (!found) {
    found = (async (): Promise<Language> => {
      const legacy = async (mode: Promise<object>): Promise<Language> => {
        const { StreamLanguage } = await import('@codemirror/language');
        return StreamLanguage.define((await mode) as Parameters<typeof StreamLanguage.define>[0]);
      };
      switch (lang) {
        case 'python':
          return (await import('@codemirror/lang-python')).pythonLanguage;
        case 'sql':
          return (await import('@codemirror/lang-sql')).StandardSQL.language;
        case 'cpp':
          return (await import('@codemirror/lang-cpp')).cppLanguage;
        case 'julia':
          return legacy(import('@codemirror/legacy-modes/mode/julia').then((m) => m.julia));
        case 'lua':
          return legacy(import('@codemirror/legacy-modes/mode/lua').then((m) => m.lua));
        case 'r':
          return legacy(import('@codemirror/legacy-modes/mode/r').then((m) => m.r));
        default:
          return (await import('@codemirror/lang-javascript')).javascriptLanguage;
      }
    })();
    languages.set(lang, found);
  }
  return found;
}

/** Colour the code shown in `el` (its text stays the same). */
export async function highlightInto(el: HTMLElement, code: string, lang: CodeLang): Promise<void> {
  const language = await cellLanguage(lang);
  // Changed meanwhile (edited, re-rendered): left as it is.
  if (el.textContent !== code) return;
  const out = document.createDocumentFragment();
  highlightCode(
    code,
    language.parser.parse(code),
    highlighter,
    (text, classes) => out.append(classes ? Object.assign(document.createElement('span'), { className: classes, textContent: text }) : document.createTextNode(text)),
    () => out.append('\n'),
  );
  el.replaceChildren(out);
}
