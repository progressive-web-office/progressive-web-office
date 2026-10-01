import { expect, test, type Route } from '@playwright/test';
import { openApp, openFile } from './helpers';

type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };

/** Server-sent events of a Messages API stream for the given content. */
function sse(content: Block[], stopReason: string): string {
  const events: [string, unknown][] = [
    ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
  ];
  content.forEach((block, index) => {
    if (block.type === 'text') {
      events.push(['content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }]);
      events.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } }]);
    } else {
      events.push(['content_block_start', { type: 'content_block_start', index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } }]);
      events.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } }]);
    }
    events.push(['content_block_stop', { type: 'content_block_stop', index }]);
  });
  events.push(['message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 20 } }]);
  events.push(['message_stop', { type: 'message_stop' }]);
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

test('the assistant edits a spreadsheet with tools, with consent and undo (AI-001..AI-005)', async ({ page }) => {
  const errors = await openApp(page);
  const requests: { headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const turns = [
    sse(
      [
        { type: 'text', text: 'Filling the cells.' },
        { type: 'tool_use', id: 'toolu_1', name: 'set_cells', input: { cells: [{ ref: 'A1', value: '2' }, { ref: 'A2', value: '3' }, { ref: 'A3', value: '=SUM(A1:A2)' }] } },
      ],
      'tool_use',
    ),
    sse([{ type: 'text', text: 'Done: A3 = 5.' }], 'end_turn'),
  ];
  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    const req = route.request();
    requests.push({ headers: req.headers(), body: JSON.parse(req.postData() ?? '{}') as Record<string, unknown> });
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: turns.shift() ?? sse([], 'end_turn') });
  });

  await page.getByRole('button', { name: 'New spreadsheet' }).click();
  await page.getByRole('button', { name: 'AI assistant' }).click();
  const panel = page.getByRole('complementary', { name: 'Assistant' });
  await expect(panel).toContainText('Anthropic · claude-opus-5-5');
  await panel.getByLabel('Anthropic API key').fill('sk-ant-test');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await panel.getByLabel('Message to the assistant').fill('Put 2 and 3 in A1:A2 and their sum in A3');
  await panel.getByRole('button', { name: 'Send', exact: true }).click();

  const consent = page.getByRole('dialog', { name: 'Send this document to the AI provider?' });
  await expect(consent).toContainText('Anthropic (model claude-opus-5-5)');
  await consent.getByRole('button', { name: 'Continue' }).click();

  await expect(panel.locator('.ai-msg.assistant').last()).toHaveText('Done: A3 = 5.');
  await expect(panel.locator('.ai-msg.action')).toContainText('✓ set_cells');
  await expect(page.locator('td[data-r="2"][data-c="0"]')).toHaveText('5');
  await expect(page.locator('.modified')).toBeVisible();

  expect(requests).toHaveLength(2);
  expect(requests[0]!.headers['x-api-key']).toBe('sk-ant-test');
  expect(requests[0]!.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
  expect(requests[0]!.body).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', output_config: { effort: 'medium' }, stream: true });
  const messages = requests[1]!.body.messages as { role: string; content: { type: string; tool_use_id?: string }[] }[];
  expect(messages.at(-1)!.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_1' });

  // AI-003: undo everything the assistant did.
  await panel.getByRole('button', { name: 'Undo the assistant’s changes' }).click();
  await expect(panel).toContainText('Changes undone.');
  await expect(page.locator('td[data-r="2"][data-c="0"]')).toHaveText('');
  // The key was not remembered (AI-004).
  expect(await page.evaluate(() => localStorage.getItem('pwo.ai'))).not.toContain('sk-ant');
  expect(errors).toEqual([]);
});

test('exposes document tools to in-browser agents through WebMCP (AI-006)', async ({ page }) => {
  await page.addInitScript(() => {
    const tools = new Map<string, { execute(input: unknown): Promise<unknown> }>();
    (window as unknown as { __tools: typeof tools }).__tools = tools;
    (document as unknown as { modelContext: unknown }).modelContext = {
      registerTool(tool: { name: string; execute(input: unknown): Promise<unknown> }, opts?: { signal?: AbortSignal }) {
        tools.set(tool.name, tool);
        opts?.signal?.addEventListener('abort', () => tools.delete(tool.name));
      },
    };
  });
  const errors = await openApp(page);
  await openFile(page, 'notes.md', '# Notes\n\nHello world.\n');
  await expect(page.locator('.doc-page h1')).toHaveText('Notes');
  await expect.poll(() => page.evaluate(() => [...(window as unknown as { __tools: Map<string, unknown> }).__tools.keys()].sort())).toEqual(['pwo_find_replace', 'pwo_read_document', 'pwo_replace_blocks']);
  const read = await page.evaluate(() => (window as unknown as { __tools: Map<string, { execute(i: unknown): Promise<{ content: { text: string }[] }> }> }).__tools.get('pwo_read_document')!.execute({}));
  expect(read.content[0]!.text).toContain('[1] Hello world.');

  // Modifications need the user's approval.
  const pending = page.evaluate(() => (window as unknown as { __tools: Map<string, { execute(i: unknown): Promise<{ content: { text: string }[] }> }> }).__tools.get('pwo_find_replace')!.execute({ find: 'world', replace: 'agents' }));
  const dialog = page.getByRole('dialog', { name: 'An AI agent wants to modify the document' });
  await dialog.getByRole('button', { name: 'Allow' }).click();
  expect((await pending).content[0]!.text).toBe('1 replacement(s).');
  await expect(page.locator('.doc-page p')).toHaveText('Hello agents.');

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Close' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __tools: Map<string, unknown> }).__tools.size)).toBe(0);
  expect(errors).toEqual([]);
});
