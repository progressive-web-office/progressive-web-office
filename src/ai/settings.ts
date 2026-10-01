/**
 * Assistant settings (AI-002, AI-004, AI-007): one profile per provider. API
 * keys stay in memory unless the user chooses to remember them.
 */
import { type Effort } from './agent';
import { PROVIDERS, providerById, type ProviderId } from './providers';

export interface ProviderProfile {
  apiKey: string;
  model: string;
  /** API base for OpenAI-compatible providers. */
  baseUrl: string;
}

export interface AiSettings {
  provider: ProviderId;
  profiles: Record<ProviderId, ProviderProfile>;
  /** Keep the keys in this browser's storage. */
  remember: boolean;
  /** Claude only. */
  effort: Effort;
}

const KEY = 'pwo.ai';
export const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

let memory: AiSettings | undefined;
let consent = '';

interface Stored {
  provider?: string;
  profiles?: Partial<Record<ProviderId, Partial<ProviderProfile>>>;
  remember?: boolean;
  effort?: string;
  // Before AI-007: a single Anthropic profile.
  apiKey?: string;
  model?: string;
}

function stored(): Stored {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Stored;
  } catch {
    return {};
  }
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function loadAiSettings(): AiSettings {
  if (memory) return structuredClone(memory);
  const s = stored();
  const remember = s.remember === true;
  const legacy: Partial<ProviderProfile> = { apiKey: s.apiKey, model: s.model };
  const profiles = Object.fromEntries(
    PROVIDERS.map((p) => {
      const saved = s.profiles?.[p.id] ?? (p.id === 'anthropic' ? legacy : {});
      return [p.id, { apiKey: remember ? text(saved.apiKey) : '', model: text(saved.model) || p.defaultModel, baseUrl: text(saved.baseUrl) || p.baseUrl }];
    }),
  ) as Record<ProviderId, ProviderProfile>;
  return {
    provider: providerById(s.provider ?? 'anthropic').id,
    profiles,
    remember,
    effort: EFFORTS.includes(s.effort as Effort) ? (s.effort as Effort) : 'medium',
  };
}

export function activeProfile(settings: AiSettings = loadAiSettings()): ProviderProfile {
  return settings.profiles[settings.provider];
}

export function saveAiSettings(settings: AiSettings): void {
  const profiles = Object.fromEntries(
    PROVIDERS.map((p) => {
      const profile = settings.profiles[p.id] ?? { apiKey: '', model: '', baseUrl: '' };
      return [p.id, { apiKey: profile.apiKey.trim(), model: profile.model.trim() || p.defaultModel, baseUrl: (p.editableUrl ? profile.baseUrl.trim().replace(/\/+$/, '') : '') || p.baseUrl }];
    }),
  ) as Record<ProviderId, ProviderProfile>;
  memory = { ...settings, profiles };
  const persisted: Stored = {
    provider: memory.provider,
    effort: memory.effort,
    remember: memory.remember,
    profiles: Object.fromEntries(PROVIDERS.map((p) => [p.id, { model: profiles[p.id].model, baseUrl: profiles[p.id].baseUrl, ...(memory!.remember && profiles[p.id].apiKey ? { apiKey: profiles[p.id].apiKey } : {}) }])),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(persisted));
  } catch {
    /* storage unavailable: settings live for this session */
  }
}

/** Remove every key from memory and storage. */
export function forgetApiKey(): void {
  const s = loadAiSettings();
  for (const p of PROVIDERS) s.profiles[p.id].apiKey = '';
  saveAiSettings({ ...s, remember: false });
  consent = '';
}

/** Where content goes: consent is given for one provider, address and model at a time. */
const destination = (s: AiSettings): string => `${s.provider}|${activeProfile(s).baseUrl}|${activeProfile(s).model}`;

/** Consent to send document content to the provider, for this session only (AI-002). */
export function hasConsent(settings: AiSettings = loadAiSettings()): boolean {
  return consent === destination(settings);
}

export function giveConsent(settings: AiSettings = loadAiSettings()): void {
  consent = destination(settings);
}

/** Test helper. */
export function resetAiSettingsForTests(): void {
  memory = undefined;
  consent = '';
}
