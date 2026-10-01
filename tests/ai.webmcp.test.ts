import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerWebMcpTools } from '../src/ai/webmcp';
import type { AgentTool } from '../src/ai/tools';
import { forgetApiKey, giveConsent, hasConsent, loadAiSettings, resetAiSettingsForTests, saveAiSettings } from '../src/ai/settings';

type Registered = { name: string; annotations?: { readOnlyHint?: boolean }; execute(i: unknown): Promise<{ content: { text: string }[]; isError?: boolean }> };

describe('AI-006 WebMCP', () => {
  let registered: Map<string, Registered>;
  beforeEach(() => {
    registered = new Map();
    (document as unknown as { modelContext: unknown }).modelContext = {
      registerTool(tool: Registered, opts: { signal: AbortSignal }) {
        registered.set(tool.name, tool);
        opts.signal.addEventListener('abort', () => registered.delete(tool.name));
      },
    };
  });
  afterEach(() => {
    delete (document as unknown as { modelContext?: unknown }).modelContext;
  });

  const tools = (log: string[]): AgentTool[] => [
    { name: 'read_document', description: 'Read', mutates: false, input_schema: { type: 'object', properties: {} }, run: () => 'content' },
    { name: 'find_replace', description: 'Replace', mutates: true, input_schema: { type: 'object', properties: { find: { type: 'string' } }, required: ['find'] }, run: (i) => (log.push(String(i.find)), 'done') },
  ];

  it('registers prefixed tools, validates input and confirms changes', async () => {
    const log: string[] = [];
    let allow = false;
    const unregister = registerWebMcpTools(tools(log), async () => allow);
    expect([...registered.keys()]).toEqual(['pwo_read_document', 'pwo_find_replace']);
    expect(registered.get('pwo_read_document')!.annotations?.readOnlyHint).toBe(true);
    expect((await registered.get('pwo_read_document')!.execute({})).content[0]!.text).toBe('content');
    expect((await registered.get('pwo_find_replace')!.execute({})).isError).toBe(true);
    expect((await registered.get('pwo_find_replace')!.execute({ find: 'x' })).content[0]!.text).toBe('The user declined this change.');
    allow = true;
    expect((await registered.get('pwo_find_replace')!.execute({ find: 'x' })).content[0]!.text).toBe('done');
    expect(log).toEqual(['x']);
    unregister();
    expect(registered.size).toBe(0);
  });

  it('does nothing without the API', () => {
    delete (document as unknown as { modelContext?: unknown }).modelContext;
    expect(() => registerWebMcpTools(tools([]), async () => true)()).not.toThrow();
  });
});

describe('AI-002/AI-004 settings', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAiSettingsForTests();
  });

  it('keeps the key in memory only unless remembered', () => {
    saveAiSettings({ apiKey: 'sk-ant-1', remember: false, model: '', effort: 'high' });
    expect(loadAiSettings()).toEqual({ apiKey: 'sk-ant-1', remember: false, model: 'claude-opus-5-5', effort: 'high' });
    expect(localStorage.getItem('pwo.ai')).not.toContain('sk-ant');
    saveAiSettings({ apiKey: 'sk-ant-2', remember: true, model: 'claude-sonnet-5-5', effort: 'low' });
    resetAiSettingsForTests();
    expect(loadAiSettings().apiKey).toBe('sk-ant-2');
    forgetApiKey();
    resetAiSettingsForTests();
    expect(loadAiSettings().apiKey).toBe('');
    expect(localStorage.getItem('pwo.ai')).not.toContain('sk-ant');
  });

  it('asks consent once per session', () => {
    expect(hasConsent()).toBe(false);
    giveConsent();
    expect(hasConsent()).toBe(true);
  });
});
