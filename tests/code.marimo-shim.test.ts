// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { MARIMO_SHIM } from '../src/code/marimo-shim';

const python = ((): string | undefined => {
  try {
    execFileSync('python3', ['-c', 'pass']);
    return 'python3';
  } catch {
    return undefined;
  }
})();

const run = (code: string): string => execFileSync(python!, ['-c', `${MARIMO_SHIM}\n${code}`], { encoding: 'utf8' }).trim();

describe.skipIf(!python)('DOC-039 the marimo stand-in of the Python sandbox', () => {
  it('runs mo.md and the App decorators', () => {
    expect(run('import marimo as mo\nprint(mo.md("  # Hi  "))\napp = mo.App()\n@app.cell\ndef f():\n    return 1\nprint(f())')).toBe('# Hi\n1');
  });

  it('is not a package: probing a submodule raises ImportError, as libraries expect', () => {
    expect(run('try:\n    from marimo._runtime.context import runtime_context_installed\nexcept ImportError as e:\n    print(type(e).__name__)')).toBe('ModuleNotFoundError');
    expect(run('import marimo\nprint(hasattr(marimo, "__path__"), hasattr(marimo, "_private"))')).toBe('False False');
  });

  it('still says what needs marimo itself', () => {
    expect(run('import marimo as mo\ntry:\n    mo.ui\nexcept NotImplementedError as e:\n    print("needs marimo itself" in str(e))')).toBe('True');
  });
});
