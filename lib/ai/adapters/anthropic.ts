'use client';

import { ChatDelta, ChatMessage, ProviderDef } from '../types';

// Anthropic uses x-api-key header, anthropic-version header, and a
// messages[] array with role "user" / "assistant". System prompt goes in a
// top-level `system` field.

function buildMessages(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const parts: any[] = [];
      if (m.content) parts.push({ type: 'text', text: m.content });
      if (m.attachments) {
        for (const a of m.attachments) {
          if (a.type === 'image') {
            parts.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: a.mime,
                data: a.data,
              },
            });
          }
        }
      }
      if (parts.length === 0) parts.push({ type: 'text', text: '' });
      return { role: m.role, content: parts };
    });
}

function buildSystem(messages: ChatMessage[]) {
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n').trim();
  return sys || undefined;
}

export async function* streamAnthropic(
  provider: ProviderDef,
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<ChatDelta> {
  const url = `${baseUrl.replace(/\/$/, '')}/messages`;
  const body: any = {
    model,
    max_tokens: 4096,
    stream: true,
    messages: buildMessages(messages),
  };
  const sys = buildSystem(messages);
  if (sys) body.system = sys;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Anthropic requires the browser direct access header when called
        // from a webview/browser. Harmless on native.
        'anthropic-dangerous-direct-browser-access': 'true',
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
      let eventType = '';
      let payload = '';
      for (const line of chunk.split('\n')) {
        const t = line.trim();
        if (t.startsWith('event:')) eventType = t.slice(6).trim();
        else if (t.startsWith('data:')) payload = t.slice(5).trim();
      }
      if (!payload) continue;
      if (eventType === 'message_stop') {
        yield { done: true };
        return;
      }
      try {
        const json = JSON.parse(payload);
        // Content block delta events carry text in delta.text
        if (json?.type === 'content_block_delta' && json?.delta?.type === 'text_delta') {
          if (typeof json.delta.text === 'string' && json.delta.text.length > 0) {
            yield { text: json.delta.text };
          }
        }
      } catch {}
    }
  }

  yield { done: true };
}
