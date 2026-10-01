/**
 * WebMCP (AI-006): expose the document tools to AI agents running in the
 * browser (`document.modelContext`, formerly `navigator.modelContext`).
 * The API is still a draft, so it is feature-detected and used defensively.
 */
import { validateInput, type AgentTool } from './tools';

interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean };
  execute(input: Record<string, unknown>): Promise<ToolResult>;
}

interface ModelContext {
  registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal }): unknown;
  unregisterTool?(name: string): void;
}

export function modelContext(): ModelContext | undefined {
  const candidates = [(document as unknown as { modelContext?: ModelContext }).modelContext, (navigator as unknown as { modelContext?: ModelContext }).modelContext];
  return candidates.find((c) => c && typeof c.registerTool === 'function');
}

const text = (t: string, isError = false): ToolResult => (isError ? { content: [{ type: 'text', text: t }], isError } : { content: [{ type: 'text', text: t }] });

/**
 * Register `tools`; mutating tools run only after `confirm` resolves true.
 * Returns a function that unregisters them.
 */
export function registerWebMcpTools(tools: AgentTool[], confirm: (tool: AgentTool, input: Record<string, unknown>) => Promise<boolean>): () => void {
  const mc = modelContext();
  if (!mc || !tools.length) return () => undefined;
  const controller = new AbortController();
  const handles: unknown[] = [];
  for (const tool of tools) {
    const descriptor: ModelContextTool = {
      name: `pwo_${tool.name}`,
      description: `Progressive Web Office: ${tool.description}`,
      inputSchema: tool.input_schema,
      annotations: { readOnlyHint: !tool.mutates },
      execute: async (input) => {
        const args = input ?? {};
        const problem = validateInput(tool.input_schema, args);
        if (problem) return text(`Invalid input: ${problem}`, true);
        if (tool.mutates && !(await confirm(tool, args))) return text('The user declined this change.', true);
        try {
          return text(await tool.run(args));
        } catch (err) {
          return text((err as Error).message, true);
        }
      },
    };
    try {
      handles.push(mc.registerTool(descriptor, { signal: controller.signal }));
    } catch {
      /* a tool with this name may already exist */
    }
  }
  return () => {
    controller.abort();
    for (const h of handles) (h as { unregister?: () => void } | undefined)?.unregister?.();
    for (const tool of tools) {
      try {
        mc.unregisterTool?.(`pwo_${tool.name}`);
      } catch {
        /* already gone */
      }
    }
  };
}
