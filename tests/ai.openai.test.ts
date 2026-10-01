import { describe, expect, it } from 'vitest';
import { OpenAiError, runOpenAiAgent, type ChatMessage } from '../src/ai/openai-agent';
import type { AgentTool } from '../src/ai/tools';

/** A server-sent events response replaying chat completion chunks. */
function sse(chunks: unknown[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

const delta = (d: Record<string, unknown>, finish: string | null = null) => ({ choices: [{ index: 0, delta: d, finish_reason: finish }] });

const tool = (log: string[], mutates = true): AgentTool => ({
  name: 'set_cells',
  description: 'Set cells',
  mutates,
  input_schema: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'] },
  run: (input) => {
    log.push(String(input.ref));
    return `ok ${String(input.ref)}`;
  },
});

function server(responses: Response[]) {
  const requests: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
    return responses.shift()!;
  };
  return { fetchFn, requests };
}

const base = { baseUrl: 'https://api.example.org/v1/', apiKey: 'sk-1', model: 'model-x', system: 'sys' };

describe('AI-007 OpenAI-compatible providers', () => {
  it('streams text, runs tool calls assembled from chunks, and sends results back', async () => {
    const log: string[] = [];
    const { fetchFn, requests } = server([
      sse([
        delta({ role: 'assistant', content: 'Work' }),
        delta({ content: 'ing.' }),
        delta({ tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'set_cells', arguments: '{"re' } }] }),
        delta({ tool_calls: [{ index: 0, function: { arguments: 'f":"A1"}' } }] }),
        delta({ tool_calls: [{ index: 1, id: 'c2', type: 'function', function: { name: 'set_cells', arguments: '{"bad":1}' } }] }),
        delta({}, 'tool_calls'),
      ]),
      sse([delta({ content: ' Done.' }), delta({}, 'stop')]),
    ]);
    const texts: string[] = [];
    const actions: string[] = [];
    const result = await runOpenAiAgent({
      ...base,
      fetchFn,
      tools: [tool(log)],
      history: [],
      prompt: 'Fill A1',
      onText: (t) => texts.push(t),
      onAction: (a) => actions.push(`${a.name}:${a.ok}`),
    });
    expect(texts.join('')).toBe('Working. Done.');
    expect(log).toEqual(['A1']);
    expect(actions).toEqual(['set_cells:true', 'set_cells:false']);
    expect(result).toMatchObject({ changed: true, stop: 'stop' });

    expect(requests[0]!.url).toBe('https://api.example.org/v1/chat/completions');
    expect(requests[0]!.headers.get('Authorization')).toBe('Bearer sk-1');
    expect(requests[0]!.body).toMatchObject({
      model: 'model-x',
      stream: true,
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'Fill A1' },
      ],
      tools: [{ type: 'function', function: { name: 'set_cells', description: 'Set cells', parameters: { type: 'object' } } }],
    });
    const second = requests[1]!.body.messages as ChatMessage[];
    expect(second.slice(2)).toEqual([
      {
        role: 'assistant',
        content: 'Working.',
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'set_cells', arguments: '{"ref":"A1"}' } },
          { id: 'c2', type: 'function', function: { name: 'set_cells', arguments: '{"bad":1}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'c1', content: 'ok A1' },
      { role: 'tool', tool_call_id: 'c2', content: expect.stringContaining('Invalid input') },
    ]);
    // The history keeps the whole exchange (without the system prompt).
    expect(result.history.map((m) => (m as ChatMessage).role)).toEqual(['user', 'assistant', 'tool', 'tool', 'assistant']);
  });

  it('accepts a non-streamed JSON answer and omits the key when there is none', async () => {
    const { fetchFn, requests } = server([
      new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }] }), { headers: { 'Content-Type': 'application/json' } }),
    ]);
    const texts: string[] = [];
    await runOpenAiAgent({ ...base, apiKey: '', fetchFn, tools: [], history: [], prompt: 'Hi', onText: (t) => texts.push(t), onAction: () => undefined });
    expect(texts).toEqual(['Hello']);
    expect(requests[0]!.headers.has('Authorization')).toBe(false);
    expect(requests[0]!.body.tools).toBeUndefined();
  });

  it('asks before mutating tools and reports a refusal to the model', async () => {
    const log: string[] = [];
    const { fetchFn, requests } = server([
      sse([delta({ tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'set_cells', arguments: '{"ref":"B2"}' } }] }), delta({}, 'tool_calls')]),
      sse([delta({ content: 'OK' }), delta({}, 'stop')]),
    ]);
    const result = await runOpenAiAgent({ ...base, fetchFn, tools: [tool(log)], history: [], prompt: 'x', onText: () => undefined, onAction: () => undefined, confirm: async () => false });
    expect(log).toEqual([]);
    expect(result.changed).toBe(false);
    expect((requests[1]!.body.messages as ChatMessage[]).at(-1)).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'The user declined this change.' });
  });

  it('rolls back a truncated turn and reports HTTP errors with their status', async () => {
    const truncated = server([sse([delta({ content: 'Long' }), delta({}, 'length')])]);
    const result = await runOpenAiAgent({ ...base, fetchFn: truncated.fetchFn, tools: [], history: [], prompt: 'x', onText: () => undefined, onAction: () => undefined });
    expect(result).toEqual({ history: [], changed: false, stop: 'max_tokens' });

    const denied = server([new Response('{"error":{"message":"Incorrect API key"}}', { status: 401 })]);
    const err = await runOpenAiAgent({ ...base, fetchFn: denied.fetchFn, tools: [], history: [], prompt: 'x', onText: () => undefined, onAction: () => undefined }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OpenAiError);
    expect(err).toMatchObject({ status: 401, message: 'Incorrect API key' });

    const offline = await runOpenAiAgent({
      ...base,
      fetchFn: async () => {
        throw new TypeError('Failed to fetch');
      },
      tools: [],
      history: [],
      prompt: 'x',
      onText: () => undefined,
      onAction: () => undefined,
    }).catch((e: unknown) => e);
    expect(offline).toMatchObject({ name: 'OpenAiError', status: 0 });
  });
});
