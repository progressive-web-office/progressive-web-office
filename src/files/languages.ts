/**
 * Languages of text and source files (FILE-022), by file name. Each one is
 * loaded only when a file of that language is opened: Lezer grammars for
 * the main languages, CodeMirror's stream modes for the others.
 */
import { StreamLanguage, type LanguageSupport, type StreamParser } from '@codemirror/language';

export interface LanguageEntry {
  name: string;
  load(): Promise<LanguageSupport | StreamLanguage<unknown>>;
}

const legacy = <T>(parser: Promise<StreamParser<T>>): Promise<StreamLanguage<unknown>> => parser.then((p) => StreamLanguage.define(p) as StreamLanguage<unknown>);

const LANGUAGES: [RegExp, LanguageEntry][] = [
  [/\.(c|h|ino)$/i, { name: 'C', load: () => import('@codemirror/lang-cpp').then((m) => m.cpp()) }],
  [/\.(cpp|cc|cxx|c\+\+|hpp|hh|hxx|cu|cuh)$/i, { name: 'C++', load: () => import('@codemirror/lang-cpp').then((m) => m.cpp()) }],
  [/\.(java)$/i, { name: 'Java', load: () => import('@codemirror/lang-java').then((m) => m.java()) }],
  [/\.(py|pyw|pyi|sage)$/i, { name: 'Python', load: () => import('@codemirror/lang-python').then((m) => m.python()) }],
  [/\.(js|mjs|cjs)$/i, { name: 'JavaScript', load: () => import('@codemirror/lang-javascript').then((m) => m.javascript()) }],
  [/\.(jsx)$/i, { name: 'JavaScript (JSX)', load: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true })) }],
  [/\.(ts|mts|cts)$/i, { name: 'TypeScript', load: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: true })) }],
  [/\.(tsx)$/i, { name: 'TypeScript (JSX)', load: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: true, jsx: true })) }],
  [/\.(json|jsonc|json5|geojson|ipynb)$/i, { name: 'JSON', load: () => import('@codemirror/lang-json').then((m) => m.json()) }],
  [/\.(rs)$/i, { name: 'Rust', load: () => import('@codemirror/lang-rust').then((m) => m.rust()) }],
  [/\.(go)$/i, { name: 'Go', load: () => import('@codemirror/lang-go').then((m) => m.go()) }],
  [/\.(php)$/i, { name: 'PHP', load: () => import('@codemirror/lang-php').then((m) => m.php()) }],
  [/\.(sql)$/i, { name: 'SQL', load: () => import('@codemirror/lang-sql').then((m) => m.sql()) }],
  [/\.(html?|xhtml|vue|svelte)$/i, { name: 'HTML', load: () => import('@codemirror/lang-html').then((m) => m.html()) }],
  [/\.(css|scss|less)$/i, { name: 'CSS', load: () => import('@codemirror/lang-css').then((m) => m.css()) }],
  [/\.(xml|xsd|xsl|xslt|svg|plist|csproj|pom)$/i, { name: 'XML', load: () => import('@codemirror/lang-xml').then((m) => m.xml()) }],
  [/\.(ya?ml)$/i, { name: 'YAML', load: () => import('@codemirror/lang-yaml').then((m) => m.yaml()) }],
  [/\.(cs)$/i, { name: 'C#', load: () => legacy(import('@codemirror/legacy-modes/mode/clike').then((m) => m.csharp)) }],
  [/\.(kt|kts)$/i, { name: 'Kotlin', load: () => legacy(import('@codemirror/legacy-modes/mode/clike').then((m) => m.kotlin)) }],
  [/\.(scala|sc)$/i, { name: 'Scala', load: () => legacy(import('@codemirror/legacy-modes/mode/clike').then((m) => m.scala)) }],
  [/\.(dart)$/i, { name: 'Dart', load: () => legacy(import('@codemirror/legacy-modes/mode/clike').then((m) => m.dart)) }],
  [/\.(m|mm)$/i, { name: 'MATLAB / Octave', load: () => legacy(import('@codemirror/legacy-modes/mode/octave').then((m) => m.octave)) }],
  [/\.(glsl|hlsl|wgsl|frag|vert)$/i, { name: 'Shader', load: () => legacy(import('@codemirror/legacy-modes/mode/clike').then((m) => m.shader)) }],
  [/\.(groovy|gradle)$/i, { name: 'Groovy', load: () => legacy(import('@codemirror/legacy-modes/mode/groovy').then((m) => m.groovy)) }],
  [/\.(swift)$/i, { name: 'Swift', load: () => legacy(import('@codemirror/legacy-modes/mode/swift').then((m) => m.swift)) }],
  [/\.(rb|rake|gemspec)$|(^|\/)(gemfile|rakefile|vagrantfile)$/i, { name: 'Ruby', load: () => legacy(import('@codemirror/legacy-modes/mode/ruby').then((m) => m.ruby)) }],
  [/\.(pl|pm)$/i, { name: 'Perl', load: () => legacy(import('@codemirror/legacy-modes/mode/perl').then((m) => m.perl)) }],
  [/\.(sh|bash|zsh|ksh|fish|env)$|(^|\/)(\.bashrc|\.profile|procfile)$/i, { name: 'Shell', load: () => legacy(import('@codemirror/legacy-modes/mode/shell').then((m) => m.shell)) }],
  [/\.(ps1|psm1)$/i, { name: 'PowerShell', load: () => legacy(import('@codemirror/legacy-modes/mode/powershell').then((m) => m.powerShell)) }],
  [/\.(r|rmd|qmd)$/i, { name: 'R', load: () => legacy(import('@codemirror/legacy-modes/mode/r').then((m) => m.r)) }],
  [/\.(jl)$/i, { name: 'Julia', load: () => legacy(import('@codemirror/legacy-modes/mode/julia').then((m) => m.julia)) }],
  [/\.(lua)$/i, { name: 'Lua', load: () => legacy(import('@codemirror/legacy-modes/mode/lua').then((m) => m.lua)) }],
  [/\.(hs|lhs)$/i, { name: 'Haskell', load: () => legacy(import('@codemirror/legacy-modes/mode/haskell').then((m) => m.haskell)) }],
  [/\.(elm)$/i, { name: 'Elm', load: () => legacy(import('@codemirror/legacy-modes/mode/elm').then((m) => m.elm)) }],
  [/\.(ml|mli)$/i, { name: 'OCaml', load: () => legacy(import('@codemirror/legacy-modes/mode/mllike').then((m) => m.oCaml)) }],
  [/\.(fs|fsi|fsx)$/i, { name: 'F#', load: () => legacy(import('@codemirror/legacy-modes/mode/mllike').then((m) => m.fSharp)) }],
  [/\.(f|f77|f90|f95|f03|for)$/i, { name: 'Fortran', load: () => legacy(import('@codemirror/legacy-modes/mode/fortran').then((m) => m.fortran)) }],
  [/\.(pas|pp|dpr)$/i, { name: 'Pascal', load: () => legacy(import('@codemirror/legacy-modes/mode/pascal').then((m) => m.pascal)) }],
  [/\.(lisp|lsp|cl|el)$/i, { name: 'Lisp', load: () => legacy(import('@codemirror/legacy-modes/mode/commonlisp').then((m) => m.commonLisp)) }],
  [/\.(scm|ss|rkt)$/i, { name: 'Scheme', load: () => legacy(import('@codemirror/legacy-modes/mode/scheme').then((m) => m.scheme)) }],
  [/\.(clj|cljs|cljc|edn)$/i, { name: 'Clojure', load: () => legacy(import('@codemirror/legacy-modes/mode/clojure').then((m) => m.clojure)) }],
  [/\.(erl|hrl)$/i, { name: 'Erlang', load: () => legacy(import('@codemirror/legacy-modes/mode/erlang').then((m) => m.erlang)) }],
  [/\.(d)$/i, { name: 'D', load: () => legacy(import('@codemirror/legacy-modes/mode/d').then((m) => m.d)) }],
  [/\.(vhd|vhdl)$/i, { name: 'VHDL', load: () => legacy(import('@codemirror/legacy-modes/mode/vhdl').then((m) => m.vhdl)) }],
  [/\.(v|sv|svh)$/i, { name: 'Verilog', load: () => legacy(import('@codemirror/legacy-modes/mode/verilog').then((m) => m.verilog)) }],
  [/\.(asm|s)$/i, { name: 'Assembly', load: () => legacy(import('@codemirror/legacy-modes/mode/gas').then((m) => m.gas)) }],
  [/\.(tcl)$/i, { name: 'Tcl', load: () => legacy(import('@codemirror/legacy-modes/mode/tcl').then((m) => m.tcl)) }],
  [/\.(vb|bas)$/i, { name: 'Visual Basic', load: () => legacy(import('@codemirror/legacy-modes/mode/vb').then((m) => m.vb)) }],
  [/\.(wl|nb)$/i, { name: 'Mathematica', load: () => legacy(import('@codemirror/legacy-modes/mode/mathematica').then((m) => m.mathematica)) }],
  [/\.(proto)$/i, { name: 'Protocol Buffers', load: () => legacy(import('@codemirror/legacy-modes/mode/protobuf').then((m) => m.protobuf)) }],
  [/\.(toml)$/i, { name: 'TOML', load: () => legacy(import('@codemirror/legacy-modes/mode/toml').then((m) => m.toml)) }],
  [/\.(ini|cfg|conf|properties|editorconfig|gitattributes|gitignore|dockerignore)$/i, { name: 'Properties', load: () => legacy(import('@codemirror/legacy-modes/mode/properties').then((m) => m.properties)) }],
  [/\.(cmake)$|(^|\/)cmakelists\.txt$/i, { name: 'CMake', load: () => legacy(import('@codemirror/legacy-modes/mode/cmake').then((m) => m.cmake)) }],
  [/(^|\/)(dockerfile|containerfile)$|\.dockerfile$/i, { name: 'Dockerfile', load: () => legacy(import('@codemirror/legacy-modes/mode/dockerfile').then((m) => m.dockerFile)) }],
  [/(^|\/)(makefile|gnumakefile)$|\.(mk|mak)$/i, { name: 'Makefile', load: () => legacy(import('@codemirror/legacy-modes/mode/shell').then((m) => m.shell)) }],
  [/\.(diff|patch)$/i, { name: 'Diff', load: () => legacy(import('@codemirror/legacy-modes/mode/diff').then((m) => m.diff)) }],
  [/\.(bib|sty|cls|bst|dtx|ins|tex)$/i, { name: 'LaTeX', load: () => legacy(import('@codemirror/legacy-modes/mode/stex').then((m) => m.stex)) }],
];

/** The language of a file, by name; undefined for plain text. */
export function languageOf(name: string): LanguageEntry | undefined {
  return LANGUAGES.find(([re]) => re.test(name))?.[1];
}
