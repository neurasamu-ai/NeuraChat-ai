'use client';

import { registerPlugin, Capacitor } from '@capacitor/core';

export interface AiWebViewPluginType {
  openAi(options: { url: string; title?: string; modelId?: string }): Promise<void>;
}

const AiWebViewPlugin = registerPlugin<AiWebViewPluginType>('AiWebViewPlugin');

export function isAiWebViewAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor.getPlatform() !== 'android') return false;
    try {
      if (Capacitor.isPluginAvailable('AiWebViewPlugin')) return true;
    } catch {}
    try {
      if (Capacitor.isNativePlatform()) return true;
    } catch {}
    return false;
  } catch {
    return false;
  }
}

export async function openAiWebView(url: string, title: string, modelId: string): Promise<void> {
  if (!isAiWebViewAvailable()) {
    // Fallback on web: open in a new tab.
    if (typeof window !== 'undefined') window.open(url, '_blank');
    return;
  }
  await AiWebViewPlugin.openAi({ url, title, modelId });
}

// ---- Model catalog ----
export interface AiModel {
  id: string;
  name: string;
  url: string;
  loginUrl?: string;
  color: string;
  emoji: string;
}

export const AI_MODELS: AiModel[] = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chat.openai.com/', color: '#10A37F', emoji: '💬' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app', color: '#4285F4', emoji: '✨' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/', color: '#D97757', emoji: '🎭' },
  { id: 'grok', name: 'Grok', url: 'https://grok.com/', color: '#000000', emoji: '⚡' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com/', color: '#4D6BFE', emoji: '🐋' },
  { id: 'copilot', name: 'Copilot', url: 'https://copilot.microsoft.com/', color: '#0078D4', emoji: '🟦' },
  { id: 'qwen', name: 'Qwen', url: 'https://chat.qwen.ai/', color: '#5B2E91', emoji: '🌊' },
  { id: 'zai', name: 'Z.AI', url: 'https://chat.z.ai/', color: '#7C3AED', emoji: '🤖' },
];

const PREFERRED_AI_KEY = 'preferred_ai_model';

export function getPreferredAiModelId(): string {
  if (typeof window === 'undefined') return 'chatgpt';
  try {
    return localStorage.getItem(PREFERRED_AI_KEY) || 'chatgpt';
  } catch {
    return 'chatgpt';
  }
}

export function setPreferredAiModelId(id: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFERRED_AI_KEY, id);
  } catch {}
}

export function getAiModel(id: string): AiModel | undefined {
  return AI_MODELS.find((m) => m.id === id);
}

// Fixed chat id / name for the pinned AI contact.
export const AI_CHAT_ID = 'chat-neura-ai-hub';
export const AI_CHAT_NAME = "Chat With AI's";
