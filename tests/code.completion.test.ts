import { describe, expect, it } from 'vitest';
import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { mergeResults, pythonSources, smartOptions, type SmartItem } from '../src/code/completion';

const context = (doc: string, explicit = false) => {
  const state = EditorState.create({ doc, extensions: [python()] });
  return new CompletionContext(state, doc.length, explicit);
};
const labels = (r: CompletionResult | null) => (r?.options ?? []).map((o) => o.label);

describe('CODE-011 completion while writing code', () => {
  it('turns the interpreter completions into options, best first, with signature and documentation', () => {
    const items: SmartItem[] = [
      { name: 'linspace', type: 'function', signature: 'linspace(start, stop, num=50)', doc: 'Return evenly spaced numbers.' },
      { name: 'pi', type: 'instance' },
      { name: 'linalg', type: 'module' },
    ];
    const options = smartOptions(items);
    expect(options.map((o) => [o.label, o.type, o.detail ?? ''])).toEqual([
      ['linspace', 'function', '(start, stop, num=50)'],
      ['pi', 'variable', ''],
      ['linalg', 'namespace', ''],
    ]);
    expect(options[0]!.info).toBe('Return evenly spaced numbers.');
    expect(options[0]!.boost!).toBeGreaterThan(options[2]!.boost!);
  });

  it('merges sources, each name once', () => {
    const merged = mergeResults([
      { from: 3, options: [{ label: 'print' }, { label: 'pow' }] },
      null,
      { from: 3, options: [{ label: 'print' }, { label: 'property' }] },
    ]);
    expect(merged?.from).toBe(3);
    expect(labels(merged)).toEqual(['print', 'pow', 'property']);
  });

  it('completes Python with keywords, built-ins and the names of the code when the interpreter is not running', async () => {
    const [source] = await pythonSources();
    const result = (await source!(context('voltage_drop = 3\npri'))) as CompletionResult;
    expect(labels(result)).toContain('print');
    const names = (await source!(context('voltage_drop = 3\nvolt'))) as CompletionResult;
    expect(labels(names)).toContain('voltage_drop');
  });

  it('asks the running interpreter first, at the line and column of the cursor', async () => {
    const asked: [number, number][] = [];
    const [source] = await pythonSources(async (_code, line, column) => {
      asked.push([line, column]);
      return [{ name: 'mean', type: 'function', signature: 'mean(data)' }];
    });
    const result = (await source!(context('import statistics\nstatistics.me'))) as CompletionResult;
    expect(asked).toEqual([[2, 13]]);
    expect(labels(result)).toEqual(['mean']);
    expect(result.from).toBe('import statistics\nstatistics.'.length);
  });

  it('falls back to the keywords when the interpreter is not running', async () => {
    const [source] = await pythonSources(async () => null);
    expect(labels((await source!(context('whi'))) as CompletionResult)).toContain('while');
  });
});
