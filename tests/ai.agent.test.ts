import { describe, expect, it } from 'vitest';
import { runAgent, type StreamFactory } from '../src/ai/agent';
import type { AgentTool } from '../src/ai/tools';

type Msg = { stop_reason: string; content: unknown[] };

/** Fake streaming client replaying scripted assistant turns. */
function fakeStream(turns: Msg[]) {
  const requests: Record<string, unknown>[] = [];
  const factory: StreamFactory = (params) => {
    requests.push(structuredClone(params) as Record<string, unknown>);
    const turn = turns.shift()!;
    const handlers: ((t: string) => void)[] = [];
    return {
      on(_event: 'text', cb: (t: string) => void) {
        handlers.push(cb);
        return this;
      },
      async finalMessage() {
        for (const b of turn.content as { type: string; text?: string }[]) if (b.type === 'text') handlers.forEach((h) => h(b.text!));
        return turn as never;
      },
    };
  };
  return { factory, requests };
}

const echoTool = (log: string[]): AgentTool => ({
  name: 'set_cells',
  description: 'Set cells',
  mutates: true,
  input_schema: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'] },
  run: (input) => {
    log.push(String(input.ref));
    return `ok ${String(input.ref)}`;
  },
});

describe('AI-001/AI-003 agent loop', () => {
  it('runs tools, returns all results in one user message and streams text', async () => {
    const log: string[] = [];
    const { factory, requests } = fakeStream([
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Working.' },
          { type: 'tool_use', id: 't1', name: 'set_cells', input: { ref: 'A1' } },
          { type: 'tool_use', id: 't2', name: 'set_cells', input: { bad: 1 } },
        ],
      },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: ' Done.' }] },
    ]);
    const texts: string[] = [];
    const actions: string[] = [];
    const result = await runAgent({
      stream: factory,
      model: 'claude-opus-5-5',
      effort: 'medium',
      system: 'sys',
      tools: [echoTool(log)],
      history: [],
      prompt: 'Fill A1',
      onText: (t) => texts.push(t),
      onAction: (a) => actions.push(`${a.name}:${a.ok}`),
    });
    expect(log).toEqual(['A1']);
    expect(texts.join('')).toBe('Working. Done.');
    expect(actions).toEqual(['set_cells:true', 'set_cells:false']);
    expect(result.changed).toBe(true);
    expect(result.stop).toBe('end_turn');
    const second = requests[1] as { messages: { role: string; content: { type: string; is_error?: boolean }[] }[] };
    const last = second.messages.at(-1)!;
    expect(last.role).toBe('user');
    expect(last.content.map((c) => [c.type, !!c.is_error])).toEqual([['tool_result', false], ['tool_result', true]]);
    // Request shape: explicit effort, server-side fallbacks, eager input streaming.
    const first = requests[0] as Record<string, unknown>;
    expect(first).toMatchObject({ model: 'claude-opus-5-5', output_config: { effort: 'medium' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    expect((first.tools as { eager_input_streaming: boolean }[])[0]!.eager_input_streaming).toBe(true);
    expect(first).not.toHaveProperty('thinking');
    // The conversation keeps every turn (append-only history).
    expect(result.history).toHaveLength(4);
  });

  it('never runs tools of a refused or truncated turn', async () => {
    for (const stop_reason of ['refusal', 'max_tokens']) {
      const log: string[] = [];
      const { factory } = fakeStream([{ stop_reason, content: [{ type: 'tool_use', id: 't1', name: 'set_cells', input: { ref: 'A1' } }] }]);
      const result = await runAgent({ stream: factory, model: 'm', effort: 'low', system: 's', tools: [echoTool(log)], history: [], prompt: 'x', onText: () => undefined, onAction: () => undefined });
      expect(log).toEqual([]);
      expect(result.stop).toBe(stop_reason);
    }
  });

  it('asks for confirmation before mutating tools when required (AI-006 style)', async () => {
    const log: string[] = [];
    const { factory } = fakeStream([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'set_cells', input: { ref: 'A1' } }] },
      { stop_reason: 'end_turn', content: [] },
    ]);
    await runAgent({ stream: factory, model: 'm', effort: 'low', system: 's', tools: [echoTool(log)], history: [], prompt: 'x', onText: () => undefined, onAction: () => undefined, confirm: async () => false });
    expect(log).toEqual([]);
  });
});
