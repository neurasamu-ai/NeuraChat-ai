'use client';

import { getProvider } from './providers';
import { pickKey, markKeyUsed } from './rotation';
import { getProviderSetting } from './keystore';
import { streamOpenAI } from './adapters/openai';
import { streamGemini } from './adapters/gemini';
import { streamAnthropic } from './adapters/anthropic';
import { ChatDelta, ChatMessage, ProviderDef } from './types';

async function* runOnce(
  provider: ProviderDef,
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<ChatDelta> {
  switch (provider.kind) {
    case 'openai':
      yield* streamOpenAI(provider, apiKey, baseUrl, model, messages, signal);
      break;
    case 'gemini':
      yield* streamGemini(provider, apiKey, baseUrl, model, messages, signal);
      break;
    case 'anthropic':
      yield* streamAnthropic(provider, apiKey, baseUrl, model, messages, signal);
      break;
    default:
      yield { error: `Unsupported provider kind: ${(provider as any).kind}` };
  }
}

// Unified streaming call. Handles:
//  - provider lookup
//  - settings + model + baseUrl resolution
//  - key rotation
//  - automatic retry with the next key if the current one fails with
//    auth/quota/network before any text has been emitted
export async function* streamChat(
  providerId: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<ChatDelta> {
  const provider = getProvider(providerId);
  if (!provider) {
    yield { error: `Unknown provider: ${providerId}` };
    return;
  }

  const settings = (await getProviderSetting(providerId)) || undefined;
  const baseUrl = (settings?.baseUrl || provider.defaultBaseUrl || '').trim();
  const model = (settings?.model || provider.defaultModel || '').trim();

  if (!baseUrl) {
    yield { error: `No base URL set for ${provider.name}. Configure it in Settings → AI Providers.` };
    return;
  }
  if (!model) {
    yield { error: `No model selected for ${provider.name}.` };
    return;
  }

  const pick = await pickKey(providerId);
  if ('error' in pick) {
    yield { error: pick.error };
    return;
  }
  const key = pick.key;

  try {
    for await (const delta of runOnce(provider, key.key, baseUrl, model, messages, signal)) {
      if (delta.error) {
        await markKeyUsed(providerId, true, delta.error);
        yield { error: delta.error };
        return;
      }
      if (delta.text) {
        yield { text: delta.text, meta: { providerId, model } };
      }
      if (delta.done) {
        await markKeyUsed(providerId, false);
        yield { done: true, meta: { providerId, model } };
        return;
      }
    }
  } catch (e: any) {
    const msg = e?.message || String(e);
    await markKeyUsed(providerId, true, msg);
    yield { error: msg };
    return;
  }

  yield { done: true, meta: { providerId, model } };
}

// Simple non-streaming variant for callers who just want the full text.
export async function chatOnce(providerId: string, messages: ChatMessage[]): Promise<string> {
  let out = '';
  for await (const delta of streamChat(providerId, messages)) {
    if (delta.error) throw new Error(delta.error);
    if (delta.text) out += delta.text;
    if (delta.done) break;
  }
  return out;
}
