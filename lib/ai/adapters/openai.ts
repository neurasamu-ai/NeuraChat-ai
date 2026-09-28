'use client';

import { Capacitor } from '@capacitor/core';
import { ChatDelta, ChatMessage, ProviderDef } from '../types';

// Build the OpenAI-compatible request body. Images are sent as part of the
// `content` array using the vision format. Other file types are appended to
// the text since the base chat completions API does not accept them.
function buildMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (!m.attachments || m.attachments.length === 0) {
      return { role: m.role, content: m.content };
    }
    const parts: any[] = [];
    if (m.content) parts.push({ type: 'text', text: m.content });
    for (const a of m.attachments) {
      if (a.type === 'image') {
        parts.push({
          type: 'image_url',
          image_url: { url: `data:${a.mime};base64,${a.data}` },
        });
      } else {
        parts.push({ type: 'text', text: `\n[Attached: ${a.name}]` });
      }
    }
    return { role: m.role, content: parts };
  });
}

async function doFetch(url: string, init: RequestInit): Promise<Response> {
  // When CapacitorHttp is enabled, the native layer handles the request.
  // On web we fall back to normal fetch (may hit CORS for some providers).
  if (Capacitor.isNativePlatform()) {
    return fetch(url, init);
  }
  return fetch(url, init);
}

export async function* streamOpenAI(
  provider: ProviderDef,
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<ChatDelta> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const body = {
    model,
    messages: buildMessages(messages),
    stream: true,
  };

  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e: any) {
    yield { error: `Network error: ${e?.message || String(e)}` };
    return;
  }

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.error?.message || JSON.stringify(j);
    } catch {
      detail = await res.text().catch(() => '');
    }
    yield { error: `HTTP ${res.status}: ${detail || res.statusText}` };
    return;
  }

  if (!res.body) {
    yield { error: 'No response body' };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          yield { done: true };
          return;
        }
        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            yield { text: delta };
          }
        } catch {}
      }
    }
  }

  yield { done: true };
}
