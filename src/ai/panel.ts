/** Assistant side panel (AI-001..AI-005). */
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { button, h } from '../app/dom';
import { getLocale, t } from '../i18n';
import { createStreamFactory, PROVIDER, runAgent, systemPrompt, type Effort } from './agent';
import { EFFORTS, forgetApiKey, giveConsent, hasConsent, loadAiSettings, saveAiSettings } from './settings';
import type { AgentTool } from './tools';

export interface AssistantContext {
  kind: string;
  name: string;
  tools: AgentTool[];
}

export interface AssistantHost {
  /** Tools for the open document, or null when there is none. */
  context(): AssistantContext | null;
  /** Capture the document; the returned function restores it (AI-003). */
  snapshot(): Promise<() => Promise<void>>;
  confirm(title: string, message: string): Promise<boolean>;
  close(): void;
}

const summarize = (input: unknown): string => {
  const s = JSON.stringify(input) ?? '';
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
};

export class AssistantPanel {
  readonly element: HTMLElement;
  private readonly log: HTMLElement;
  private readonly input: HTMLTextAreaElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly stopButton: HTMLButtonElement;
  private readonly setup: HTMLElement;
  private readonly info: HTMLElement;
  private history: BetaMessageParam[] = [];
  private controller: AbortController | null = null;

  constructor(private readonly host: AssistantHost) {
    this.info = h('p', { class: 'ai-info' });
    this.log = h('div', { class: 'ai-log', role: 'log', 'aria-live': 'polite', 'aria-label': t('ai.conversation') });
    this.input = h('textarea', { rows: 3, 'aria-label': t('ai.prompt'), placeholder: t('ai.placeholder') });
    this.sendButton = button(t('ai.send'), () => void this.send(), { className: 'primary' });
    this.stopButton = button(t('ai.stop'), () => this.controller?.abort());
    this.stopButton.hidden = true;
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void this.send();
      }
    });
    this.setup = this.buildSetup();
    this.element = h(
      'aside',
      { class: 'ai-panel', 'aria-label': t('ai.title') },
      h(
        'div',
        { class: 'ai-head' },
        h('h2', {}, `✨ ${t('ai.title')}`),
        button(t('ai.settings'), () => this.toggleSetup(), { text: '⚙', className: 'icon' }),
        button(t('common.close'), () => this.host.close(), { text: '×', className: 'icon' }),
      ),
      this.info,
      this.setup,
      this.log,
      h('div', { class: 'ai-input' }, this.input, h('div', { class: 'dialog-actions' }, this.stopButton, this.sendButton)),
    );
    this.refreshInfo();
    this.setup.hidden = !!loadAiSettings().apiKey;
  }

  /** New document: start a new conversation. */
  reset(): void {
    this.controller?.abort();
    this.history = [];
    this.log.replaceChildren();
  }

  focus(): void {
    (this.setup.hidden ? this.input : this.setup.querySelector<HTMLInputElement>('input'))?.focus();
  }

  private refreshInfo(): void {
    const s = loadAiSettings();
    this.info.textContent = t('ai.info', { provider: PROVIDER, model: s.model });
  }

  private toggleSetup(): void {
    this.setup.hidden = !this.setup.hidden;
    if (!this.setup.hidden) this.setup.querySelector<HTMLInputElement>('input')?.focus();
  }

  private buildSetup(): HTMLElement {
    const s = loadAiSettings();
    const key = h('input', { type: 'password', value: s.apiKey, autocomplete: 'off', spellcheck: 'false', 'aria-label': t('ai.apiKey') });
    const remember = h('input', { type: 'checkbox', checked: s.remember });
    const model = h('input', { type: 'text', value: s.model, spellcheck: 'false', 'aria-label': t('ai.model') });
    const effort = h('select', { 'aria-label': t('ai.effort') }, ...EFFORTS.map((e) => h('option', { value: e, selected: e === s.effort }, t(`ai.effort.${e}`))));
    const form = h(
      'form',
      { class: 'ai-setup' },
      h('label', {}, t('ai.apiKey'), key),
      h('p', { class: 'hint' }, t('ai.keyHelp')),
      h('label', { class: 'git-row' }, remember, ' ', t('ai.remember')),
      h('label', {}, t('ai.model'), model),
      h('label', {}, t('ai.effort'), effort),
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('ai.forget'), () => {
          forgetApiKey();
          key.value = '';
          remember.checked = false;
        }),
        h('button', { type: 'submit', class: 'primary' }, t('ai.saveSettings')),
      ),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      saveAiSettings({ apiKey: key.value, remember: remember.checked, model: model.value, effort: effort.value as Effort });
      this.refreshInfo();
      if (loadAiSettings().apiKey) {
        form.hidden = true;
        this.input.focus();
      }
    });
    return form;
  }

  private entry(role: 'user' | 'assistant' | 'action' | 'error' | 'note', text = ''): HTMLElement {
    const el = h('div', { class: `ai-msg ${role}` }, text);
    this.log.append(el);
    this.log.scrollTop = this.log.scrollHeight;
    return el;
  }

  private async send(): Promise<void> {
    const prompt = this.input.value.trim();
    if (!prompt || this.controller) return;
    const settings = loadAiSettings();
    if (!settings.apiKey) {
      this.setup.hidden = false;
      this.focus();
      return;
    }
    const ctx = this.host.context();
    if (!ctx) {
      this.entry('note', t('ai.noDocument'));
      return;
    }
    // AI-002: explicit consent before any content leaves the device.
    if (!hasConsent()) {
      if (!(await this.host.confirm(t('ai.consentTitle'), t('ai.consentMessage', { provider: PROVIDER, model: settings.model })))) return;
      giveConsent();
    }
    this.input.value = '';
    this.entry('user', prompt);
    const undo = await this.host.snapshot();
    const controller = new AbortController();
    this.controller = controller;
    this.sendButton.disabled = true;
    this.stopButton.hidden = false;
    let answer: HTMLElement | null = null;
    try {
      const stream = await createStreamFactory(settings.apiKey);
      const result = await runAgent({
        stream,
        model: settings.model,
        effort: settings.effort,
        system: systemPrompt(ctx.kind, ctx.name, getLocale()),
        tools: ctx.tools,
        history: this.history,
        prompt,
        signal: controller.signal,
        onText: (delta) => {
          answer ??= this.entry('assistant');
          answer.textContent += delta;
          this.log.scrollTop = this.log.scrollHeight;
        },
        onAction: (action) => {
          answer = null;
          this.entry('action', `${action.ok ? '✓' : '✗'} ${action.name} ${summarize(action.input)} — ${action.result.split('\n')[0]}`);
        },
      });
      this.history = result.history;
      const notes: Record<string, string> = { refusal: t('ai.refusal'), max_tokens: t('ai.truncated'), turn_limit: t('ai.turnLimit'), aborted: t('ai.stopped') };
      if (notes[result.stop]) this.entry('note', notes[result.stop]);
      if (result.changed) this.offerUndo(undo);
    } catch (err) {
      this.entry('error', await this.describeError(err));
    } finally {
      this.controller = null;
      this.sendButton.disabled = false;
      this.stopButton.hidden = true;
    }
  }

  private offerUndo(undo: () => Promise<void>): void {
    const holder = this.entry('note');
    const b = button(t('ai.undo'), () => {
      b.disabled = true;
      void undo().then(() => holder.replaceChildren(t('ai.undone')));
    });
    holder.append(b);
  }

  private async describeError(err: unknown): Promise<string> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    if (err instanceof Anthropic.AuthenticationError) return t('ai.error.auth');
    if (err instanceof Anthropic.PermissionDeniedError) return t('ai.error.permission');
    if (err instanceof Anthropic.RateLimitError) return t('ai.error.rateLimit');
    if (err instanceof Anthropic.NotFoundError) return t('ai.error.model');
    if (err instanceof Anthropic.APIConnectionError) return t('ai.error.network');
    if (err instanceof Anthropic.APIError) return t('ai.error.api', { message: err.message });
    return t('ai.error.api', { message: (err as Error).message });
  }
}
