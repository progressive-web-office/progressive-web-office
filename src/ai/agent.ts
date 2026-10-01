/**
 * Assistant loop with the Claude API (AI-001..AI-005): a manual streaming
 * tool-use loop over the document tools. The SDK is loaded lazily, only when
 * the user actually talks to the assistant.
 */
import type { BetaContentBlock, BetaMessage, BetaMessageParam, BetaTool, BetaToolResultBlockParam, BetaToolUseBlock, MessageCreateParamsStreaming } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { validateInput, type AgentTool } from './tools';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export const DEFAULT_MODEL = 'claude-opus-5-5';
export const PROVIDER = 'Anthropic';

export type StreamParams = Omit<MessageCreateParamsStreaming, 'stream'>;

/** The subset of the SDK message stream used by the loop. */
export interface MessageStreamLike {
  on(event: 'text', listener: (delta: string) => void): unknown;
  finalMessage(): Promise<BetaMessage>;
}

export type StreamFactory = (params: StreamParams, signal?: AbortSignal) => MessageStreamLike;

export interface AgentAction {
  name: string;
  input: unknown;
  ok: boolean;
  result: string;
}

export interface RunOptions {
  stream: StreamFactory;
  model: string;
  effort: Effort;
  system: string;
  tools: AgentTool[];
  /** Previous turns (append-only; returned updated). */
  history: BetaMessageParam[];
  prompt: string;
  onText(delta: string): void;
  onAction(action: AgentAction): void;
  /** Ask before running a mutating tool; refusing returns an error to the model. */
  confirm?: (tool: AgentTool, input: Record<string, unknown>) => Promise<boolean>;
  signal?: AbortSignal;
  maxTokens?: number;
  /** Safety limit on model round trips per request. */
  maxTurns?: number;
}

export interface RunResult {
  history: BetaMessageParam[];
  /** True when at least one mutating tool ran. */
  changed: boolean;
  /** Last stop reason: end_turn, refusal, max_tokens, aborted, turn_limit… */
  stop: string;
}

/** Create a browser client with the user's own key (AI-004). */
export async function createStreamFactory(apiKey: string): Promise<StreamFactory> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  // The key belongs to the user and only ever goes to api.anthropic.com.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  return (params, signal) => client.beta.messages.stream(params, signal ? { signal } : undefined);
}

const isToolUse = (b: BetaContentBlock): b is BetaToolUseBlock => b.type === 'tool_use';

export async function runAgent(opts: RunOptions): Promise<RunResult> {
  const start = opts.history.length;
  const history: BetaMessageParam[] = [...opts.history, { role: 'user', content: opts.prompt }];
  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  // Eager input streaming: inputs arrive unvalidated, so the loop validates them.
  const tools: BetaTool[] = opts.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema as BetaTool['input_schema'], eager_input_streaming: true }));
  let changed = false;
  let jsonRetries = 0;
  const maxTurns = opts.maxTurns ?? 25;
  // Roll back this request's turns when it ends without a usable answer.
  const abandon = (stop: string): RunResult => ({ history: history.slice(0, start), changed, stop });

  for (let turn = 0; turn < maxTurns; turn++) {
    if (opts.signal?.aborted) return abandon('aborted');
    const params: StreamParams = {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 32000,
      // Thinking is adaptive by default on current models; depth is set by effort.
      output_config: { effort: opts.effort },
      // Server-side fallback: a declined request is retried on the recommended model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
      tools,
      messages: history,
    };
    const stream = opts.stream(params, opts.signal);
    stream.on('text', (delta) => opts.onText(delta));
    let message: BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // With eager input streaming an unparseable tool input rejects; retry that only.
      if (err instanceof SyntaxError && jsonRetries++ < 2) {
        turn--;
        continue;
      }
      if (opts.signal?.aborted) return abandon('aborted');
      throw err;
    }

    const stop = message.stop_reason ?? 'end_turn';
    // A refusal can cut a tool call off mid-input; a max_tokens stop can truncate it.
    if (stop === 'refusal' || stop === 'max_tokens') return abandon(stop);
    history.push({ role: 'assistant', content: message.content });
    if (stop === 'pause_turn') continue;
    const calls = message.content.filter(isToolUse);
    if (!calls.length) return { history, changed, stop };

    const results: BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const tool = byName.get(call.name);
      const fail = (text: string): void => {
        results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: text });
        opts.onAction({ name: call.name, input: call.input, ok: false, result: text });
      };
      if (!tool) {
        fail(`Unknown tool ${call.name}.`);
        continue;
      }
      const problem = validateInput(tool.input_schema, call.input);
      if (problem) {
        fail(`Invalid input: ${problem}. Input received: ${JSON.stringify(call.input)}`);
        continue;
      }
      const input = call.input as Record<string, unknown>;
      if (tool.mutates && opts.confirm && !(await opts.confirm(tool, input))) {
        fail('The user declined this change.');
        continue;
      }
      try {
        const text = await tool.run(input);
        if (tool.mutates) changed = true;
        results.push({ type: 'tool_result', tool_use_id: call.id, content: text });
        opts.onAction({ name: call.name, input, ok: true, result: text });
      } catch (err) {
        fail((err as Error).message);
      }
    }
    // All results of one assistant turn go back in a single user message.
    history.push({ role: 'user', content: results });
  }
  return { history, changed, stop: 'turn_limit' };
}

export function systemPrompt(kind: string, fileName: string, locale: string): string {
  return [
    'You are the assistant built into Progressive Web Office (PWO), a private office suite that runs in the browser.',
    `The user has the ${kind} "${fileName}" open. Use the tools to read it before answering questions about it, and to make the changes the user asks for.`,
    'Read the current content before editing it; make focused changes and keep existing content, formatting and images unless asked otherwise.',
    'Mathematics is written in LaTeX: $...$ inline and $$...$$ for display equations. Spreadsheet formulas use Excel A1 syntax with English function names.',
    'Every change is visible to the user and can be undone. When you are done, summarise briefly what you changed.',
    `Answer in the user's language (interface language: ${locale}).`,
  ].join('\n');
}
