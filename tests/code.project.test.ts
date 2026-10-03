import { describe, expect, it } from 'vitest';
import { loadProject, parsePwoToml, projectPaths, projectRoot, resolveModule } from '../src/code/project';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('CODE-019 a folder is a project', () => {
  it('is the folder of the file, or the nearest folder above with a project file', () => {
    const paths = ['notes/a.md', 'tools/x.py', 'tools/lib.py', 'app/pyproject.toml', 'app/src/main.py', 'app/src/pkg/u.py', 'c/pwo.toml', 'c/src/m.c'];
    expect(projectRoot(paths, 'tools/x.py')).toBe('tools');
    expect(projectRoot(paths, 'app/src/main.py')).toBe('app');
    expect(projectRoot(paths, 'c/src/m.c')).toBe('c');
    expect(projectRoot(['x.py'], 'x.py')).toBe('');
  });

  it('finds the root by listing the folders above the file', async () => {
    const { findProjectRoot } = await import('../src/code/project');
    const tree: Record<string, string[]> = { '': ['app', 'x.py'], app: ['pyproject.toml', 'src'], 'app/src': ['main.py'] };
    expect(await findProjectRoot('app/src/main.py', async (d) => tree[d] ?? [])).toBe('app');
    expect(await findProjectRoot('x.py', async (d) => tree[d] ?? [])).toBe('');
  });

  it('leaves out hidden folders, dependencies and caches', () => {
    const paths = ['p/a.py', 'p/.git/HEAD', 'p/node_modules/x/i.js', 'p/__pycache__/a.pyc', 'p/.venv/lib.py', 'p/sub/b.py', 'q/c.py'];
    expect(projectPaths(paths, 'p')).toEqual(['a.py', 'sub/b.py']);
    expect(projectPaths(paths, '')).toEqual(['p/a.py', 'p/sub/b.py', 'q/c.py']);
  });

  it('reads pwo.toml: entry point, arguments, compiler options, sources, standard input', () => {
    const config = parsePwoToml(`# my project
main = "src/app.c"   # the entry point
args = ["data.csv", '-v']
cflags = [
  "-O2",
  "-std=c11",
]
sources = ["src/*.c", "lib/util.c"]
stdin = "input.txt"
name = "demo"
`);
    expect(config).toEqual({ main: 'src/app.c', args: ['data.csv', '-v'], cflags: ['-O2', '-std=c11'], sources: ['src/*.c', 'lib/util.c'], stdin: 'input.txt' });
    expect(() => parsePwoToml('main = ')).toThrow(/pwo.toml, line 1/);
  });

  it('loads the files, with the entry point of pwo.toml and the text being edited', async () => {
    const disk: Record<string, string> = { 'p/pwo.toml': 'main = "run.py"\nargs = ["x"]', 'p/run.py': 'import lib', 'p/lib.py': 'v = 1', 'p/big.bin': 'x'.repeat(50) };
    const project = await loadProject(Object.keys(disk), 'p/lib.py', 'v = 2', async (p) => enc(disk[p]!), { maxFileBytes: 20 });
    expect(project.root).toBe('p');
    expect(project.entry).toBe('run.py');
    expect(project.config.args).toEqual(['x']);
    expect(new TextDecoder().decode(project.files['lib.py'])).toBe('v = 2');
    expect(project.files['big.bin']).toBeUndefined();
    expect(project.skipped).toEqual(['big.bin']);
  });

  it('runs the file being edited when there is no pwo.toml', async () => {
    const project = await loadProject(['d/a.py', 'd/b.py'], 'd/a.py', 'print(1)', async () => enc('x'));
    expect(project.entry).toBe('a.py');
    expect(project.config).toEqual({});
  });

  it('resolves the modules of a JavaScript project', () => {
    const files = new Set(['main.js', 'lib/util.ts', 'lib/index.js', 'data.json']);
    expect(resolveModule(files, 'main.js', './lib/util')).toBe('lib/util.ts');
    expect(resolveModule(files, 'lib/util.ts', '../data.json')).toBe('data.json');
    expect(resolveModule(files, 'main.js', './lib')).toBe('lib/index.js');
    expect(resolveModule(files, 'main.js', './lib/util.js')).toBe('lib/util.ts');
    expect(resolveModule(files, 'main.js', './missing')).toBeUndefined();
  });
});

describe('CODE-019 project helpers', () => {
  it('rewrites the relative imports of a module', async () => {
    const { rewriteImports } = await import('../src/code/project');
    const code = 'import a from "./a.js";\nimport { b } from \'../b\';\nimport "./side.js";\nconst c = await import("./c.js");\nimport x from "lodash";\nexport * from "./d";';
    expect(rewriteImports(code, (s) => `blob:${s}`)).toBe('import a from "blob:./a.js";\nimport { b } from \'blob:../b\';\nimport "blob:./side.js";\nconst c = await import("blob:./c.js");\nimport x from "lodash";\nexport * from "blob:./d";');
  });

  it('chooses the C/C++ files compiled together', async () => {
    const { cSources } = await import('../src/code/project');
    const files = Object.fromEntries(['src/main.c', 'src/util.c', 'src/util.h', 'lib/extra.c', 'tests/t.c'].map((p) => [p, new Uint8Array()]));
    expect(cSources({ files, entry: 'src/main.c', config: {} })).toEqual(['src/main.c', 'src/util.c']);
    expect(cSources({ files, entry: 'src/main.c', config: { sources: ['src/*.c', 'lib/**/*.c'] } })).toEqual(['src/main.c', 'lib/extra.c', 'src/util.c']);
  });
});
