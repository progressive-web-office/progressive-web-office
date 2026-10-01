/**
 * Assistant loop for OpenAI-compatible chat completion APIs (AI-007): OpenAI,
 * Mistral, Albert, Ollama, LM Studio, vLLM, OpenRouter… Plain `fetch`, no SDK:
 * streamed text and tool calls (function calling), the same document tools
 * and confirmations as the Claude loop.
 */
import { callTool, type AgentTool } from './tools';
import type { AgentAction } from './agent';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface OpenAiRunOptions {
  fetchFn?: FetchFn;
  /** API base, e.g. https://api.openai.com/v1 (`/chat/completions` is appended). */
  baseUrl: string;
  /** Empty for servers without authentication (local Ollama…). */
  apiKey: string;
  model: string;
  system: string;
  tools: AgentTool[];
  history: unknown[];
  prompt: string;
  onText(delta: string): void;
  onAction(action: AgentAction): void;
  confirm?: (tool: AgentTool, input: Record<string, unknown>) => Promise<boolean>;
  signal?: AbortSignal;
  maxTurns?: number;
}

export class OpenAiError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when the server could not be reached (network, CORS). */
    readonly status: number,
  ) {
    super(message);
    this.name = 'OpenAiError';
  }
}

interface Turn {
  content: string;
  calls: ToolCall[];
  finish: string;
}

interface Chunk {
  choices?: { delta?: { content?: string | null; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] }; message?: { content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string | null }[];
}

async function request(opts: OpenAiRunOptions, messages: ChatMessage[]): Promise<Response> {
  const tools = opts.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  const url = `${opts.baseUrl.trim().replace(/\/+$/, '')}/chat/completions`;
  let res: Response;
  try {
    res = await (opts.fetchFn ?? ((i, init) => fetch(i, init)))(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}) },
      body: JSON.stringify({ model: opts.model, messages, stream: true, ...(tools.length ? { tools } : {}) }),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new OpenAiError((err as Error).message || 'Network error', 0);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = `HTTP ${res.status}`;
    try {
      const data = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
      message = (typeof data.error === 'string' ? data.error : data.error?.message) ?? data.message ?? message;
    } catch {
      if (text.trim()) message = text.trim().slice(0, 200);
    }
    throw new OpenAiError(message, res.status);
  }
  return res;
}

/** Read a streamed (server-sent events) or plain JSON completion. */
async function readTurn(res: Response, onText: (delta: string) => void): Promise<Turn> {
  const turn: Turn = { content: '', calls: [], finish: 'stop' };
  const apply = (chunk: Chunk): void => {
    const choice = chunk.choices?.[0];
    if (!choice) return;
    if (choice.message) {
      // Non-streamed answer.
      if (choice.message.content) {
        turn.content += choice.message.content;
        onText(choice.message.content);
      }
      turn.calls.push(...(choice.message.tool_calls ?? []));
    }
    const d = choice.delta;
    if (d?.content) {
      turn.content += d.content;
      onText(d.content);
    }
    for (const part of d?.tool_calls ?? []) {
      const call = (turn.calls[part.index] ??= { id: '', type: 'function', function: { name: '', arguments: '' } });
      if (part.id) call.id = part.id;
      if (part.function?.name) call.function.name += part.function.name;
      if (part.function?.arguments) call.function.arguments += part.function.arguments;
    }
    if (choice.finish_reason) turn.finish = choice.finish_reason;
  };

  if (!(res.headers.get('Content-Type') ?? '').includes('text/event-stream') || !res.body) {
    apply((await res.json()) as Chunk);
    return turn;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return turn;
      try {
        apply(JSON.parse(data) as Chunk);
      } catch {
        /* keep-alive or partial line */
      }
    }
    if (done) return turn;
  }
}

export interface OpenAiRunResult {
  history: ChatMessage[];
  changed: boolean;
  stop: string;
}

export async function runOpenAiAgent(opts: OpenAiRunOptions): Promise<OpenAiRunResult> {
  const previous = opts.history as ChatMessage[];
  const history: ChatMessage[] = [...previous, { role: 'user', content: opts.prompt }];
  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  let changed = false;
  const abandon = (stop: string) => ({ history: previous, changed, stop });

  for (let turn = 0; turn < (opts.maxTurns ?? 25); turn++) {
    if (opts.signal?.aborted) return abandon('aborted');
    let result: Turn;
    try {
      result = await readTurn(await request(opts, [{ role: 'system', content: opts.system }, ...history]), opts.onText);
    } catch (err) {
      if (opts.signal?.aborted || (err as Error).name === 'AbortError') return abandon('aborted');
      throw err;
    }
    // A truncated answer may hold a cut tool call: never run it.
    if (result.finish === 'length') return abandon('max_tokens');
    if (result.finish === 'content_filter') return abandon('refusal');
    const calls = result.calls.filter((c) => c.function.name);
    calls.forEach((c, i) => (c.id ||= `call_${turn}_${i}`));
    history.push({ role: 'assistant', content: result.content || null, ...(calls.length ? { tool_calls: calls } : {}) });
    if (!calls.length) return { history, changed, stop: 'stop' };

    for (const call of calls) {
      let input: unknown;
      try {
        input = call.function.arguments.trim() ? JSON.parse(call.function.arguments) : {};
      } catch {
        input = undefined;
      }
      const outcome =
        input === undefined
          ? { ok: false, content: `Invalid JSON arguments: ${call.function.arguments}`, mutated: false }
          : await callTool(byName, call.function.name, input, opts.confirm);
      if (outcome.mutated) changed = true;
      history.push({ role: 'tool', tool_call_id: call.id, content: outcome.content });
      opts.onAction({ name: call.function.name, input, ok: outcome.ok, result: outcome.content });
    }
  }
  return { history, changed, stop: 'turn_limit' };
}
