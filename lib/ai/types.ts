// Core types for the AI provider layer.

export type ProviderKind = 'openai' | 'gemini' | 'anthropic';

export interface ProviderDef {
  id: string;
  name: string;
  kind: ProviderKind;
  defaultBaseUrl: string;
  defaultModelHint: string; // shown as placeholder only
  requiresKey: boolean;
  description?: string;
}

// One API key per provider. Multiple keys are not supported anymore.
export interface ProviderKey {
  providerId: string;
  key: string;
  updatedAt: number;
  lastError?: string;
}

export interface ProviderSettings {
  providerId: string;
  enabled: boolean;
  baseUrl?: string;
  model?: string;
}

export interface ChatAttachment {
  type: 'image' | 'pdf' | 'text';
  name: string;
  mime: string;
  data: string; // base64 (no data-url prefix)
  size: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  attachments?: ChatAttachment[];
}

export interface ChatDelta {
  text?: string;
  done?: boolean;
  error?: string;
  meta?: { providerId: string; model?: string };
}
