// Minimal OpenAI-compatible chat client for the Refine button.
// Uses the single endpoint stored in lib/refine/config.ts.

import {
  getRefineConfig,
  buildChatEndpoint,
  isRefineConfigured,
  RefineConfig,
} from './config';

export interface RefineResult {
  ok: boolean;
  text?: string;
  error?: string;
}

interface ChatMsg {
  role: 'system' | 'user';
  content: string;
}

export async function refineText(
  textToRefine: string,
  customPrompt: string,
): Promise<RefineResult> {
  if (!textToRefine.trim()) {
    return { ok: false, error: 'Nothing to refine.' };
  }

  const cfg = getRefineConfig();
  if (!isRefineConfigured(cfg)) {
    return { ok: false, error: 'Configure AI Refine in Settings first.' };
  }

  const endpoint = buildChatEndpoint(cfg.url);
  if (!endpoint) {
    return { ok: false, error: 'Invalid refine endpoint URL.' };
  }

  const instruction = customPrompt
    ? `Follow all of these user instructions exactly, in the order they were given:\n${customPrompt}`
    : 'Fix only grammar, spelling, punctuation, and sentence structure. Do not change the meaning, do not add anything, do not remove anything.';

  const messages: ChatMsg[] = [
    {
      role: 'system',
      content: `You are a precise text-refinement assistant. Rules:
1. Preserve the ORIGINAL language. English stays English, Hinglish stays Hinglish, Urdu stays Urdu, Roman Urdu stays Roman Urdu. Never translate.
2. ${instruction}
3. Output ONLY the refined text. No quotes, no code fences, no explanation, no preamble.
4. Keep the original line structure unless the instruction says otherwise.`,
    },
    { role: 'user', content: textToRefine },
  ];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cfg.key) headers['Authorization'] = `Bearer ${cfg.key}`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0.2,
        stream: false,
      }),
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error.' };
  }

  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
      if (detail.length > 300) detail = detail.slice(0, 300) + '…';
    } catch {}
    return {
      ok: false,
      error: `HTTP ${res.status}${detail ? ' — ' + detail : ''}`,
    };
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'Invalid JSON response.' };
  }

  const content =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.text ??
    '';
  const cleaned = String(content).trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!cleaned) {
    return { ok: false, error: 'AI returned empty response.' };
  }
  return { ok: true, text: cleaned };
}

// Lightweight health check used by the Settings "Test" button.
export async function testRefineConfig(cfg?: RefineConfig): Promise<RefineResult> {
  const active = cfg || getRefineConfig();
  if (!isRefineConfigured(active)) {
    return { ok: false, error: 'URL and Model are required.' };
  }
  const endpoint = buildChatEndpoint(active.url);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (active.key) headers['Authorization'] = `Bearer ${active.key}`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: active.model,
        messages: [
          { role: 'system', content: 'Reply with the single word: ok' },
          { role: 'user', content: 'ping' },
        ],
        temperature: 0,
        stream: false,
        max_tokens: 10,
      }),
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = await res.text();
        if (detail.length > 200) detail = detail.slice(0, 200) + '…';
      } catch {}
      return { ok: false, error: `HTTP ${res.status}${detail ? ' — ' + detail : ''}` };
    }
    return { ok: true, text: 'OK' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error.' };
  }
}
