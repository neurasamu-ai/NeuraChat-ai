// Single custom OpenAI-compatible endpoint used for the SMS text Refine
// feature. Stored locally on the device — no cloud sync.

export interface RefineConfig {
  url: string;    // base URL, e.g. "https://api.openai.com" or "http://192.168.1.10:8080"
  key: string;    // bearer token; may be empty for local endpoints
  model: string;  // model id, e.g. "gpt-4o-mini" or "llama3-8b"
}

const STORAGE_KEY = 'neura_refine_config';

export const EMPTY_REFINE_CONFIG: RefineConfig = { url: '', key: '', model: '' };

export function getRefineConfig(): RefineConfig {
  if (typeof window === 'undefined') return EMPTY_REFINE_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_REFINE_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      url: typeof parsed.url === 'string' ? parsed.url : '',
      key: typeof parsed.key === 'string' ? parsed.key : '',
      model: typeof parsed.model === 'string' ? parsed.model : '',
    };
  } catch {
    return EMPTY_REFINE_CONFIG;
  }
}

export function saveRefineConfig(cfg: RefineConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {}
}

export function clearRefineConfig(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function isRefineConfigured(cfg: RefineConfig = getRefineConfig()): boolean {
  return !!(cfg.url && cfg.model);
}

// Normalize a user-entered base URL into a full chat-completions endpoint.
// Accepts "...", ".../", ".../v1", or the full ".../v1/chat/completions".
export function buildChatEndpoint(baseUrl: string): string {
  let u = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  if (u.endsWith('/chat/completions')) return u;
  if (u.endsWith('/v1')) return u + '/chat/completions';
  return u + '/v1/chat/completions';
}
