/** Assistant settings (AI-002, AI-004): the API key stays in memory unless the user chooses to remember it. */
import { DEFAULT_MODEL, type Effort } from './agent';

export interface AiSettings {
  apiKey: string;
  /** Keep the key in this browser's storage. */
  remember: boolean;
  model: string;
  effort: Effort;
}

const KEY = 'pwo.ai';
export const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

let memory: AiSettings | undefined;
let consent = false;

function stored(): Partial<AiSettings> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AiSettings>;
  } catch {
    return {};
  }
}

export function loadAiSettings(): AiSettings {
  if (memory) return { ...memory };
  const s = stored();
  return {
    apiKey: s.remember && typeof s.apiKey === 'string' ? s.apiKey : '',
    remember: s.remember === true,
    model: typeof s.model === 'string' && s.model.trim() ? s.model.trim() : DEFAULT_MODEL,
    effort: EFFORTS.includes(s.effort as Effort) ? (s.effort as Effort) : 'medium',
  };
}

export function saveAiSettings(settings: AiSettings): void {
  memory = { ...settings, model: settings.model.trim() || DEFAULT_MODEL, apiKey: settings.apiKey.trim() };
  const persisted: Partial<AiSettings> = { model: memory.model, effort: memory.effort, remember: memory.remember };
  if (memory.remember) persisted.apiKey = memory.apiKey;
  try {
    localStorage.setItem(KEY, JSON.stringify(persisted));
  } catch {
    /* storage unavailable: settings live for this session */
  }
}

/** Remove the key from memory and storage. */
export function forgetApiKey(): void {
  saveAiSettings({ ...loadAiSettings(), apiKey: '', remember: false });
  consent = false;
}

/** Consent to send document content to the provider, for this session only (AI-002). */
export function hasConsent(): boolean {
  return consent;
}

export function giveConsent(): void {
  consent = true;
}

/** Test helper. */
export function resetAiSettingsForTests(): void {
  memory = undefined;
  consent = false;
}
