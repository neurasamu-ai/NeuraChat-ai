'use client';

import { ChatDelta, ChatMessage, ProviderDef } from '../types';

// Gemini uses a different schema: contents[] with parts[] and role
// "user" / "model". Images are provided as inlineData.

function buildContents(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.role !== 'system') // system goes separately
    .map((m) => {
      const parts: any[] = [];
      if (m.content) parts.push({ text: m.content });
      if (m.attachments) {
        for (const a of m.attachments) {
          if (a.type === 'image' || a.type === 'pdf') {
            parts.push({
              inlineData: { mimeType: a.mime, data: a.data },
            });
          }
        }
      }
      if (parts.length === 0) parts.push({ text: '' });
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    });
}

function buildSystem(messages: ChatMessage[]) {
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n').trim();
  if (!sys) return undefined;
  return { parts: [{ text: sys }] };
}

export async function* streamGemini(
  provider: ProviderDef,
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<ChatDelta> {
  const root = baseUrl.replace(/\/$/, '');
  const url = `${root}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  const body: any = { contents: buildContents(messages) };
  const sys = buildSystem(messages);
  if (sys) body.systemInstruction = sys;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
        if (!payload || payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          const parts = json?.candidates?.[0]?.content?.parts || [];
          for (const p of parts) {
            if (typeof p?.text === 'string' && p.text.length > 0) {
              yield { text: p.text };
            }
          }
        } catch {}
      }
    }
  }

  yield { done: true };
}
