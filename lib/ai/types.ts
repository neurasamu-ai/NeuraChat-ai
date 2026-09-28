// Core types for the AI provider layer. Every provider adapter normalizes
// its input / output to these so the chat UI never has to know which
// vendor it is talking to.

export type ProviderKind = 'openai' | 'gemini' | 'anthropic';

export interface ProviderDef {
  id: string;                // e.g. 'openai', 'deepseek', 'gemini'
  name: string;              // display name
  kind: ProviderKind;        // which adapter to use
  defaultBaseUrl: string;    // endpoint root, e.g. https://api.openai.com/v1
  defaultModel: string;      // model id used when the user has not changed it
  // Additional models the user can pick from.
  models: string[];
  // Provider requires a key. (Some local providers do not.)
  requiresKey: boolean;
  // If true, the key must be prefixed with "Bearer " in the Authorization
  // header. Anthropic uses x-api-key instead.
  authHeader?: 'bearer' | 'x-api-key' | 'query';
  // Short description for the settings page.
  description?: string;
}

export interface ApiKeyEntry {
  id: string;                // generated
  providerId: string;        // which provider this key belongs to
  label: string;             // user-facing label ("Personal", "Work")
  key: string;               // the secret
  addedAt: number;
  // Rolling stats for the key.
  lastUsed?: number;
  lastError?: string;
  requestCount?: number;
}

export interface ProviderSettings {
  providerId: string;
  enabled: boolean;
  // If the user wants to override the default endpoint.
  baseUrl?: string;
  // Model selected for this provider.
  model?: string;
  // Rotation strategy across multiple keys.
  rotation: 'round-robin' | 'fallback';
  // Points at the last used key so round-robin can keep going.
  rrCursor?: number;
}

export interface ChatAttachment {
  type: 'image' | 'pdf' | 'text';
  name: string;
  mime: string;
  // base64 (no data-url prefix) for image/pdf
  data: string;
  size: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  attachments?: ChatAttachment[];
}

export interface ChatDelta {
  // Incremental text from a streaming response.
  text?: string;
  // Set when a request finished successfully.
  done?: boolean;
  // Set when the request failed. `error` is human-readable.
  error?: string;
  // Which provider+key actually handled the request (useful for logs).
  meta?: {
    providerId: string;
    keyId?: string;
    model?: string;
  };
}
