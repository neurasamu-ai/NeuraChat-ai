'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, X, Send, Settings as SettingsIcon, Trash2, Sparkles } from 'lucide-react';
import Header from '@/components/Header';
import { useBackHandler } from '@/lib/use-back-handler';
import { PROVIDERS, getProvider } from '@/lib/ai/providers';
import { getProviderSettings } from '@/lib/ai/keystore';
import { streamChat } from '@/lib/ai/client';
import { ChatMessage } from '@/lib/ai/types';
import {
  AiMessage,
  loadAiMessages,
  saveAiMessage,
  clearAiMessages,
} from '@/lib/ai/storage';
import { generateId } from '@/lib/utils';

export default function AiChatPage() {
  const router = useRouter();

  const [activeProviderId, setActiveProviderId] = useState<string>('openai');
  const [activeModel, setActiveModel] = useState<string>('');
  const [enabledProviders, setEnabledProviders] = useState<string[]>([]);

  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const threadId = `ai-${activeProviderId}`;

  // Load enabled providers + settings
  useEffect(() => {
    (async () => {
      const settings = await getProviderSettings();
      const enabled = settings.filter((s) => s.enabled).map((s) => s.providerId);
      setEnabledProviders(enabled);
      const firstEnabled = enabled[0] || 'openai';
      setActiveProviderId(firstEnabled);
      const s = settings.find((x) => x.providerId === firstEnabled);
      const def = getProvider(firstEnabled);
      setActiveModel(s?.model || def?.defaultModel || '');
    })();
  }, []);

  // Load thread when provider changes
  useEffect(() => {
    (async () => {
      const msgs = await loadAiMessages(threadId);
      setMessages(msgs);
    })();
  }, [threadId]);

  // Scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useBackHandler(pickerOpen, () => setPickerOpen(false));

  const triggerVibration = () => {
    if (typeof window !== 'undefined' && navigator.vibrate) navigator.vibrate(25);
  };

  const handleClear = async () => {
    triggerVibration();
    await clearAiMessages(threadId);
    setMessages([]);
  };

  const stopStreaming = () => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
      abortRef.current = null;
    }
    setStreaming(false);
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;

    triggerVibration();
    setInput('');

    const userMsg: AiMessage = {
      id: generateId('ai-u'),
      threadId,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      providerId: activeProviderId,
      model: activeModel,
    };
    await saveAiMessage(userMsg);
    setMessages((prev) => [...prev, userMsg]);

    // Build the request history (last 20 messages for context).
    const history: ChatMessage[] = [...messages, userMsg]
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));

    // Placeholder assistant message that we stream into.
    const assistantId = generateId('ai-a');
    const assistantMsg: AiMessage = {
      id: assistantId,
      threadId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      providerId: activeProviderId,
      model: activeModel,
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let acc = '';
    let meta: { providerId: string; keyId?: string; model?: string } | undefined;

    try {
      for await (const delta of streamChat(activeProviderId, history, controller.signal)) {
        if (delta.error) {
          acc += (acc ? '\n\n' : '') + `⚠️ ${delta.error}`;
          break;
        }
        if (delta.text) {
          acc += delta.text;
          if (delta.meta) meta = delta.meta;
          // Update UI on the fly.
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m))
          );
        }
        if (delta.done) {
          if (delta.meta) meta = delta.meta;
          break;
        }
      }
    } catch (err: any) {
      acc += (acc ? '\n\n' : '') + `⚠️ ${err?.message || 'stream failed'}`;
    } finally {
      abortRef.current = null;
      setStreaming(false);

      const finalMsg: AiMessage = {
        ...assistantMsg,
        content: acc || '(no response)',
        providerId: meta?.providerId || activeProviderId,
        model: meta?.model || activeModel,
      };
      await saveAiMessage(finalMsg);
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? finalMsg : m)));
    }
  };

  const openProviderPicker = () => {
    triggerVibration();
    setPickerOpen(true);
  };

  const pickProvider = async (providerId: string) => {
    triggerVibration();
    setPickerOpen(false);
    const settings = await getProviderSettings();
    const s = settings.find((x) => x.providerId === providerId);
    const def = getProvider(providerId);
    setActiveProviderId(providerId);
    setActiveModel(s?.model || def?.defaultModel || '');
  };

  const activeProvider = getProvider(activeProviderId);
  const providerName = activeProvider?.name || activeProviderId;

  return (
    <>
      <Header
        title="Chat With AI's"
        onBack={() => router.back()}
        rightAction={
          <div className="flex items-center gap-1">
            <button
              onClick={handleClear}
              className="p-2 rounded-full text-zinc-400 hover:text-red-400 transition-colors"
              title="Clear chat"
            >
              <Trash2 className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={() => {
                triggerVibration();
                router.push('/settings');
              }}
              className="p-2 rounded-full text-zinc-400 hover:text-white transition-colors"
              title="AI Providers"
            >
              <SettingsIcon className="h-4.5 w-4.5" />
            </button>
          </div>
        }
      />

      <div className="flex-1 flex flex-col min-h-0 bg-zinc-950">
        {/* Provider badge */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-center">
          <button
            onClick={openProviderPicker}
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl border transition-all active:scale-95"
            style={{
              backgroundColor: '#18181b',
              borderColor: 'rgba(0,212,255,0.35)',
            }}
          >
            <Sparkles className="h-3.5 w-3.5 text-[#00D4FF]" />
            <span className="text-xs font-bold text-white">{providerName}</span>
            <span className="text-[10px] text-zinc-500 font-mono truncate max-w-[120px]">
              {activeModel}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-16 select-none">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-[#00D4FF]/20 to-[#FF006E]/20 border border-[#00D4FF]/40 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-[#00D4FF]" />
              </div>
              <p className="text-sm font-bold text-white mb-1">Start a conversation</p>
              <p className="text-[11px] text-zinc-500 px-8 leading-relaxed">
                Messages go directly to your provider. Your API keys stay on
                this device.
              </p>
            </div>
          )}

          {messages.map((m) => {
            const isUser = m.role === 'user';
            return (
              <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                    isUser
                      ? 'bg-[#00D4FF] text-black rounded-tr-sm'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-tl-sm'
                  }`}
                >
                  {m.content || (streaming ? '…' : '')}
                </div>
              </div>
            );
          })}
          <div ref={scrollRef} className="h-1" />
        </div>

        {/* Input */}
        <form
          onSubmit={handleSend}
          className="px-3 py-3 bg-zinc-950 border-t border-zinc-900 flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message…"
            disabled={streaming}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 px-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#00D4FF] disabled:opacity-50"
          />
          {streaming ? (
            <button
              type="button"
              onClick={stopStreaming}
              className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center active:scale-95"
              title="Stop"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="w-10 h-10 rounded-xl bg-[#00D4FF] text-black flex items-center justify-center active:scale-95 disabled:opacity-30"
              title="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>

      {/* Provider picker modal */}
      <AnimatePresence>
        {pickerOpen && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-5 relative max-h-[80vh] overflow-y-auto"
            >
              <button
                onClick={() => setPickerOpen(false)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>

              <h3 className="text-base font-bold text-white mb-1">Choose AI</h3>
              <p className="text-[11px] text-zinc-500 mb-4">
                Only providers you enabled in Settings → AI Providers appear here.
              </p>

              {enabledProviders.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-xs text-zinc-400 mb-3">
                    No provider enabled yet.
                  </p>
                  <button
                    onClick={() => {
                      setPickerOpen(false);
                      router.push('/settings');
                    }}
                    className="px-4 py-2 rounded-xl bg-[#00D4FF] text-black text-xs font-bold active:scale-95"
                  >
                    Configure in Settings
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {PROVIDERS.filter((p) => enabledProviders.includes(p.id)).map((p) => {
                    const selected = p.id === activeProviderId;
                    return (
                      <button
                        key={p.id}
                        onClick={() => pickProvider(p.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all active:scale-[0.98] ${
                          selected
                            ? 'bg-zinc-900 border-zinc-700'
                            : 'bg-zinc-950 border-zinc-900 hover:bg-zinc-900/60'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-xl bg-[#00D4FF]/15 flex items-center justify-center">
                          <Sparkles className="h-4 w-4 text-[#00D4FF]" />
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                          <p className="text-[10px] text-zinc-500 truncate">{p.description}</p>
                        </div>
                        {selected && <span className="text-[#00D4FF] text-xs font-bold">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
