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
      const clike = (name: 'java' | 'csharp' | 'kotlin' | 'scala' | 'dart' | 'objectiveC') => legacy(import('@codemirror/legacy-modes/mode/clike').then((m) => m[name]));
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
        // CODE-020: languages shown and edited only.
        case 'typescript':
          return (await import('@codemirror/lang-javascript')).typescriptLanguage;
        case 'java':
          return (await import('@codemirror/lang-java')).javaLanguage;
        case 'go':
          return (await import('@codemirror/lang-go')).goLanguage;
        case 'rust':
          return (await import('@codemirror/lang-rust')).rustLanguage;
        case 'php':
          return (await import('@codemirror/lang-php')).php({ plain: true }).language;
        case 'html':
          return (await import('@codemirror/lang-html')).htmlLanguage;
        case 'css':
          return (await import('@codemirror/lang-css')).cssLanguage;
        case 'xml':
          return (await import('@codemirror/lang-xml')).xmlLanguage;
        case 'json':
          return (await import('@codemirror/lang-json')).jsonLanguage;
        case 'yaml':
          return (await import('@codemirror/lang-yaml')).yamlLanguage;
        case 'csharp':
        case 'kotlin':
        case 'scala':
        case 'dart':
          return clike(lang);
        case 'objc':
          return clike('objectiveC');
        case 'bash':
          return legacy(import('@codemirror/legacy-modes/mode/shell').then((m) => m.shell));
        case 'powershell':
          return legacy(import('@codemirror/legacy-modes/mode/powershell').then((m) => m.powerShell));
        case 'vb':
          return legacy(import('@codemirror/legacy-modes/mode/vb').then((m) => m.vb));
        case 'fortran':
          return legacy(import('@codemirror/legacy-modes/mode/fortran').then((m) => m.fortran));
        case 'pascal':
          return legacy(import('@codemirror/legacy-modes/mode/pascal').then((m) => m.pascal));
        case 'asm':
          return legacy(import('@codemirror/legacy-modes/mode/gas').then((m) => m.gas));
        case 'ada':
          return legacy(import('./ada-mode').then((m) => m.ada));
        case 'swift':
          return legacy(import('@codemirror/legacy-modes/mode/swift').then((m) => m.swift));
        case 'cobol':
          return legacy(import('@codemirror/legacy-modes/mode/cobol').then((m) => m.cobol));
        case 'ruby':
          return legacy(import('@codemirror/legacy-modes/mode/ruby').then((m) => m.ruby));
        case 'perl':
          return legacy(import('@codemirror/legacy-modes/mode/perl').then((m) => m.perl));
        case 'matlab':
          return legacy(import('@codemirror/legacy-modes/mode/octave').then((m) => m.octave));
        case 'haskell':
          return legacy(import('@codemirror/legacy-modes/mode/haskell').then((m) => m.haskell));
        case 'ocaml':
          return legacy(import('@codemirror/legacy-modes/mode/mllike').then((m) => m.oCaml));
        case 'fsharp':
          return legacy(import('@codemirror/legacy-modes/mode/mllike').then((m) => m.fSharp));
        case 'erlang':
          return legacy(import('@codemirror/legacy-modes/mode/erlang').then((m) => m.erlang));
        case 'clojure':
          return legacy(import('@codemirror/legacy-modes/mode/clojure').then((m) => m.clojure));
        case 'lisp':
          return legacy(import('@codemirror/legacy-modes/mode/commonlisp').then((m) => m.commonLisp));
        case 'scheme':
          return legacy(import('@codemirror/legacy-modes/mode/scheme').then((m) => m.scheme));
        case 'groovy':
          return legacy(import('@codemirror/legacy-modes/mode/groovy').then((m) => m.groovy));
        case 'tcl':
          return legacy(import('@codemirror/legacy-modes/mode/tcl').then((m) => m.tcl));
        case 'vhdl':
          return legacy(import('@codemirror/legacy-modes/mode/vhdl').then((m) => m.vhdl));
        case 'verilog':
          return legacy(import('@codemirror/legacy-modes/mode/verilog').then((m) => m.verilog));
        case 'modelica':
          return legacy(import('@codemirror/legacy-modes/mode/modelica').then((m) => m.modelica));
        case 'mathematica':
          return legacy(import('@codemirror/legacy-modes/mode/mathematica').then((m) => m.mathematica));
        case 'sas':
          return legacy(import('@codemirror/legacy-modes/mode/sas').then((m) => m.sas));
        case 'toml':
          return legacy(import('@codemirror/legacy-modes/mode/toml').then((m) => m.toml));
        case 'latex':
          return legacy(import('@codemirror/legacy-modes/mode/stex').then((m) => m.stex));
        case 'dockerfile':
          return legacy(import('@codemirror/legacy-modes/mode/dockerfile').then((m) => m.dockerFile));
        case 'cmake':
          return legacy(import('@codemirror/legacy-modes/mode/cmake').then((m) => m.cmake));
        case 'nginx':
          return legacy(import('@codemirror/legacy-modes/mode/nginx').then((m) => m.nginx));
        case 'protobuf':
          return legacy(import('@codemirror/legacy-modes/mode/protobuf').then((m) => m.protobuf));
        case 'diff':
          return legacy(import('@codemirror/legacy-modes/mode/diff').then((m) => m.diff));
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
