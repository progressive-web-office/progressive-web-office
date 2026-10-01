/** AI providers the assistant can use (AI-007). */
import type { MessageKey } from '../i18n';

export type ProviderId = 'anthropic' | 'openai' | 'mistral' | 'albert' | 'ollama' | 'custom';

export interface Provider {
  id: ProviderId;
  label: string;
  /** API family: Claude Messages API, or OpenAI-compatible chat completions. */
  kind: 'anthropic' | 'openai';
  /** Default API base (OpenAI-compatible providers). */
  baseUrl: string;
  /** The user may change the API address (local and custom servers). */
  editableUrl: boolean;
  needsKey: boolean;
  defaultModel: string;
  /** Example shown in the empty model field. */
  modelHint: string;
  keyHelp: MessageKey;
}

export const PROVIDERS: readonly Provider[] = [
  { id: 'anthropic', label: 'Anthropic (Claude)', kind: 'anthropic', baseUrl: 'https://api.anthropic.com', editableUrl: false, needsKey: true, defaultModel: 'claude-opus-5-5', modelHint: 'claude-opus-5-5', keyHelp: 'ai.keyHelp.anthropic' },
  { id: 'openai', label: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', editableUrl: false, needsKey: true, defaultModel: '', modelHint: 'gpt-…', keyHelp: 'ai.keyHelp.openai' },
  { id: 'mistral', label: 'Mistral AI', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1', editableUrl: false, needsKey: true, defaultModel: 'mistral-large-latest', modelHint: 'mistral-large-latest', keyHelp: 'ai.keyHelp.mistral' },
  { id: 'albert', label: 'Albert (API de l’État)', kind: 'openai', baseUrl: 'https://albert.api.etalab.gouv.fr/v1', editableUrl: true, needsKey: true, defaultModel: '', modelHint: 'see /v1/models', keyHelp: 'ai.keyHelp.albert' },
  { id: 'ollama', label: 'Ollama (local)', kind: 'openai', baseUrl: 'http://localhost:11434/v1', editableUrl: true, needsKey: false, defaultModel: '', modelHint: 'qwen3, llama3.2…', keyHelp: 'ai.keyHelp.ollama' },
  { id: 'custom', label: 'OpenAI-compatible server', kind: 'openai', baseUrl: '', editableUrl: true, needsKey: false, defaultModel: '', modelHint: 'model name', keyHelp: 'ai.keyHelp.custom' },
];

export const providerById = (id: string): Provider => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]!;
