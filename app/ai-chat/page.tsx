'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronDown, X, Send, Settings as SettingsIcon, Trash2, Sparkles,
  Paperclip, FileImage, FileText, Image as ImageIcon, Globe, Plus,
  History, RotateCcw, Pencil,
} from 'lucide-react';
import Header from '@/components/Header';
import { useBackHandler } from '@/lib/use-back-handler';
import { PROVIDERS, getProvider } from '@/lib/ai/providers';
import { getProviderSettings } from '@/lib/ai/keystore';
import { streamChat } from '@/lib/ai/client';
import { ChatAttachment, ChatMessage } from '@/lib/ai/types';
import {
  AiMessage, AiThread,
  listThreads, upsertThread, deleteThread, getThread,
  loadAiMessages, saveAiMessage, deleteAiMessage,
  titleFromContent,
} from '@/lib/ai/storage';
import { generateId } from '@/lib/utils';
import {
  AI_MODELS, getPreferredAiModelId, setPreferredAiModelId,
  getAiModel, openAiWebView,
} from '@/lib/ai-webview';

type Mode = 'api' | 'web';

const newThread = (providerId: string): AiThread => ({
  id: generateId('thread'),
  providerId,
  title: 'New chat',
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export default function AiChatPage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('api');
  const [modeKey, setModeKey] = useState(0);

  // API mode
  const [activeProviderId, setActiveProviderId] = useState<string>('openai');
  const [activeModel, setActiveModel] = useState<string>('');
  const [enabledProviders, setEnabledProviders] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);

  // Threads
  const [threads, setThreads] = useState<AiThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>('');
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Composer / streaming
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);

  // Web mode
  const [webModelId, setWebModelId] = useState<string>('chatgpt');
  const [webPickerOpen, setWebPickerOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerVibration = () => {
    if (typeof window !== 'undefined' && navigator.vibrate) navigator.vibrate(25);
  };

  const switchMode = (m: Mode) => {
    triggerVibration();
    setMode(m);
    setModeKey((k) => k + 1);
  };

  // Init: load settings + providers, load web model, create or pick a thread.
  useEffect(() => {
    (async () => {
      const settings = await getProviderSettings();
      const enabled = settings.filter((s) => s.enabled).map((s) => s.providerId);
      setEnabledProviders(enabled);
      const firstEnabled = enabled[0] || 'openai';
      setActiveProviderId(firstEnabled);
      const s = settings.find((x) => x.providerId === firstEnabled);
      const def = getProvider(firstEnabled);
      setActiveModel(s?.model || def?.defaultModelHint || '');
      setWebModelId(getPreferredAiModelId());

      // Load threads for the first provider and either resume the newest
      // or create a fresh one.
      const list = await listThreads(firstEnabled);
      setThreads(list);
      if (list.length > 0) {
        setActiveThreadId(list[0].id);
      } else {
        const t = newThread(firstEnabled);
        await upsertThread(t);
        setThreads([t]);
        setActiveThreadId(t.id);
      }
    })();
  }, []);

  // Reload threads whenever the provider changes.
  useEffect(() => {
    if (!activeProviderId) return;
    (async () => {
      const list = await listThreads(activeProviderId);
      setThreads(list);
      // If we do not have an active thread for this provider, use the newest
      // or create one.
      const current = list.find((t) => t.id === activeThreadId);
      if (!current) {
        if (list.length > 0) {
          setActiveThreadId(list[0].id);
        } else {
          const t = newThread(activeProviderId);
          await upsertThread(t);
          setThreads([t]);
          setActiveThreadId(t.id);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProviderId]);

  // Load messages for the active thread.
  useEffect(() => {
    if (!activeThreadId) return;
    (async () => {
      const msgs = await loadAiMessages(activeThreadId);
      setMessages(msgs);
    })();
  }, [activeThreadId]);

  // Scroll to bottom on new content.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Reset transient state when the app returns from the WebView.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setModeKey((k) => k + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useBackHandler(pickerOpen, () => setPickerOpen(false));
  useBackHandler(webPickerOpen, () => setWebPickerOpen(false));
  useBackHandler(historyOpen, () => setHistoryOpen(false));

  const stopStreaming = () => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
      abortRef.current = null;
    }
    setStreaming(false);
  };

  // ---- New chat ----
  const handleNewChat = async () => {
    triggerVibration();
    if (streaming) stopStreaming();
    const t = newThread(activeProviderId);
    await upsertThread(t);
    const list = await listThreads(activeProviderId);
    setThreads(list);
    setActiveThreadId(t.id);
    setMessages([]);
    setAttachment(null);
    setInput('');
  };

  // ---- Clear current thread ----
  const handleClearThread = async () => {
    if (!activeThreadId) return;
    triggerVibration();
    if (streaming) stopStreaming();
    await deleteThread(activeThreadId);
    const list = await listThreads(activeProviderId);
    setThreads(list);
    if (list.length > 0) {
      setActiveThreadId(list[0].id);
    } else {
      const t = newThread(activeProviderId);
      await upsertThread(t);
      setThreads([t]);
      setActiveThreadId(t.id);
      setMessages([]);
    }
  };

  // ---- Thread switch ----
  const openThread = (id: string) => {
    triggerVibration();
    if (streaming) stopStreaming();
    setActiveThreadId(id);
    setHistoryOpen(false);
  };

  // ---- Delete a thread from the history list ----
  const removeThread = async (id: string) => {
    triggerVibration();
    await deleteThread(id);
    const list = await listThreads(activeProviderId);
    setThreads(list);
    if (id === activeThreadId) {
      if (list.length > 0) setActiveThreadId(list[0].id);
      else {
        const t = newThread(activeProviderId);
        await upsertThread(t);
        setThreads([t]);
        setActiveThreadId(t.id);
        setMessages([]);
      }
    }
  };

  // ---- File picker ----
  const pickFile = () => {
    triggerVibration();
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      alert('File too large. Max 6 MB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      const mime = file.type || 'application/octet-stream';
      let kind: ChatAttachment['type'] = 'text';
      if (mime.startsWith('image/')) kind = 'image';
      else if (mime === 'application/pdf') kind = 'pdf';
      else if (mime.startsWith('text/')) kind = 'text';
      setAttachment({
        type: kind, name: file.name, mime, data: base64, size: file.size,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ---- Core streaming routine ----
  // Given a list of messages to send, creates an assistant placeholder,
  // streams into it, and persists the final result.
  const runStream = async (historyMsgs: AiMessage[], assistantId: string) => {
    const history: ChatMessage[] = historyMsgs
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content, attachments: m.attachments }));

    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);

    let acc = '';
    let meta: { providerId: string; model?: string } | undefined;

    try {
      for await (const delta of streamChat(activeProviderId, history, controller.signal)) {
        if (delta.error) {
          acc += (acc ? '\n\n' : '') + `⚠️ ${delta.error}`;
          break;
        }
        if (delta.text) {
          acc += delta.text;
          if (delta.meta) meta = delta.meta;
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
        id: assistantId,
        threadId: activeThreadId,
        role: 'assistant',
        content: acc || '(no response)',
        timestamp: Date.now(),
        providerId: meta?.providerId || activeProviderId,
        model: meta?.model || activeModel,
      };
      await saveAiMessage(finalMsg);
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? finalMsg : m)));

      // Update thread title if still "New chat".
      const t = await getThread(activeThreadId);
      if (t && t.title === 'New chat') {
        const firstUser = historyMsgs.find((m) => m.role === 'user');
        if (firstUser) {
          const updated: AiThread = {
            ...t,
            title: titleFromContent(firstUser.content),
            updatedAt: Date.now(),
          };
          await upsertThread(updated);
          const list = await listThreads(activeProviderId);
          setThreads(list);
        }
      } else if (t) {
        await upsertThread({ ...t, updatedAt: Date.now() });
      }
    }
  };

  // ---- Send (fresh message) ----
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if ((!text && !attachment) || streaming || !activeThreadId) return;

    triggerVibration();
    const currentAttachment = attachment;
    setInput('');
    setAttachment(null);
    setEditingMsgId(null);

    const userMsg: AiMessage = {
      id: generateId('ai-u'),
      threadId: activeThreadId,
      role: 'user',
      content: text,
      attachments: currentAttachment ? [currentAttachment] : undefined,
      timestamp: Date.now(),
      providerId: activeProviderId,
      model: activeModel,
    };
    await saveAiMessage(userMsg);
    setMessages((prev) => [...prev, userMsg]);

    const assistantId = generateId('ai-a');
    const assistantMsg: AiMessage = {
      id: assistantId,
      threadId: activeThreadId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      providerId: activeProviderId,
      model: activeModel,
    };
    setMessages((prev) => [...prev, assistantMsg]);

    await runStream([...messages, userMsg], assistantId);
  };

  // ---- Retry without clone: reuse the user message, replace the assistant ----
  const handleRetry = async (userMsg: AiMessage) => {
    if (streaming) return;
    triggerVibration();

    // Remove any assistant message that came right after this user message.
    const idx = messages.findIndex((m) => m.id === userMsg.id);
    if (idx === -1) return;
    const after = messages.slice(idx + 1);
    const nextAssistant = after.find((m) => m.role === 'assistant');
    if (nextAssistant) {
      await deleteAiMessage(nextAssistant.id);
    }

    // Build the history up to and including the user message.
    const history = messages.slice(0, idx + 1);

    // Create a fresh assistant placeholder.
    const assistantId = generateId('ai-a');
    const assistantMsg: AiMessage = {
      id: assistantId,
      threadId: activeThreadId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      providerId: activeProviderId,
      model: activeModel,
    };
    setMessages([...history, assistantMsg]);

    await runStream(history, assistantId);
  };

  // ---- Edit & resend: same as retry but user can change text first ----
  const startEdit = (m: AiMessage) => {
    triggerVibration();
    if (streaming) return;
    setEditingMsgId(m.id);
    setInput(m.content);
    setAttachment(m.attachments && m.attachments[0] ? m.attachments[0] : null);
  };

  const cancelEdit = () => {
    setEditingMsgId(null);
    setInput('');
    setAttachment(null);
  };

  const submitEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingMsgId) return;
    const target = messages.find((m) => m.id === editingMsgId);
    if (!target) return;

    // Update the existing user message in place.
    const updated: AiMessage = {
      ...target,
      content: input.trim(),
      attachments: attachment ? [attachment] : undefined,
      timestamp: Date.now(),
    };
    await saveAiMessage(updated);

    // Remove any assistant reply that followed.
    const idx = messages.findIndex((m) => m.id === editingMsgId);
    const after = messages.slice(idx + 1);
    const nextAssistant = after.find((m) => m.role === 'assistant');
    if (nextAssistant) {
      await deleteAiMessage(nextAssistant.id);
    }

    setEditingMsgId(null);
    setInput('');
    setAttachment(null);

    const history = messages.slice(0, idx + 1).map((m) => (m.id === updated.id ? updated : m));
    const assistantId = generateId('ai-a');
    const assistantMsg: AiMessage = {
      id: assistantId,
      threadId: activeThreadId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      providerId: activeProviderId,
      model: activeModel,
    };
    setMessages([...history, assistantMsg]);
    await runStream(history, assistantId);
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
    setActiveModel(s?.model || def?.defaultModelHint || '');
  };

  const openWebModel = async (modelId: string) => {
    triggerVibration();
    setWebPickerOpen(false);
    setWebModelId(modelId);
    setPreferredAiModelId(modelId);
    const m = getAiModel(modelId);
    if (!m) return;
    try {
      await openAiWebView(m.url, m.name, m.id);
    } catch (e) {
      console.error('openAiWebView failed', e);
    }
  };

  const activeProvider = getProvider(activeProviderId);
  const providerName = activeProvider?.name || activeProviderId;
  const webModel = getAiModel(webModelId);

  return (
    <>
      <Header
        title="Chat With AI's"
        onBack={() => router.back()}
        rightAction={
          <div className="flex items-center gap-0.5">
            {mode === 'api' && (
              <>
                <button
                  onClick={handleNewChat}
                  className="p-2 rounded-full text-zinc-400 hover:text-[#00D4FF] transition-colors"
                  title="New chat"
                >
                  <Plus className="h-4.5 w-4.5" />
                </button>
                <button
                  onClick={handleClearThread}
                  className="p-2 rounded-full text-zinc-400 hover:text-red-400 transition-colors"
                  title="Delete this chat"
                >
                  <Trash2 className="h-4.5 w-4.5" />
                </button>
              </>
            )}
            <button
              onClick={() => {
                triggerVibration();
                router.push('/settings');
              }}
              className="p-2 rounded-full text-zinc-400 hover:text-white transition-colors"
              title="Settings"
            >
              <SettingsIcon className="h-4.5 w-4.5" />
            </button>
          </div>
        }
      />

      <div key={modeKey} className="flex-1 flex flex-col min-h-0 bg-zinc-950">
        {/* Toggle + provider badge + history */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-2">
          {mode === 'api' && (
            <button
              onClick={() => { triggerVibration(); setHistoryOpen(true); }}
              className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 active:scale-95 shrink-0"
              title="Chat history"
            >
              <History className="h-4 w-4" />
            </button>
          )}
          <div className="flex items-center p-0.5 rounded-xl bg-zinc-900 border border-zinc-800">
            <button
              type="button"
              onClick={() => switchMode('api')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                mode === 'api' ? 'bg-[#00D4FF] text-black' : 'text-zinc-400'
              }`}
            >
              API
            </button>
            <button
              type="button"
              onClick={() => switchMode('web')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                mode === 'web' ? 'bg-[#00D4FF] text-black' : 'text-zinc-400'
              }`}
            >
              Web
            </button>
          </div>
          {mode === 'api' ? (
            <button
              onClick={openProviderPicker}
              className="flex-1 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all active:scale-95 min-w-0"
              style={{ backgroundColor: '#18181b', borderColor: 'rgba(0,212,255,0.35)' }}
            >
              <Sparkles className="h-3 w-3 text-[#00D4FF] shrink-0" />
              <span className="text-[11px] font-bold text-white truncate flex-1 text-left">{providerName}</span>
              <ChevronDown className="h-3 w-3 text-zinc-400 shrink-0" />
            </button>
          ) : (
            <button
              onClick={() => setWebPickerOpen(true)}
              className="flex-1 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all active:scale-95 min-w-0"
              style={{ backgroundColor: '#18181b', borderColor: 'rgba(0,212,255,0.35)' }}
            >
              <Globe className="h-3 w-3 text-[#00D4FF] shrink-0" />
              <span className="text-[11px] font-bold text-white truncate flex-1 text-left">
                {webModel?.name || 'ChatGPT'}
              </span>
              <ChevronDown className="h-3 w-3 text-zinc-400 shrink-0" />
            </button>
          )}
        </div>

        {/* ================= API MODE ================= */}
        {mode === 'api' && (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-16 select-none">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-[#00D4FF]/20 to-[#FF006E]/20 border border-[#00D4FF]/40 flex items-center justify-center">
                    <Sparkles className="h-6 w-6 text-[#00D4FF]" />
                  </div>
                  <p className="text-sm font-bold text-white mb-1">Start a conversation</p>
                  <p className="text-[11px] text-zinc-500 px-8 leading-relaxed">
                    Messages go directly to your provider. Your API keys stay on this device.
                  </p>
                </div>
              )}

              {messages.map((m) => {
                const isUser = m.role === 'user';
                return (
                  <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                        isUser
                          ? 'bg-[#00D4FF] text-black rounded-tr-sm'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-tl-sm'
                      }`}
                    >
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="flex items-center gap-1.5 mb-1.5 opacity-80">
                          {m.attachments[0].type === 'image' ? (
                            <FileImage className="h-3 w-3" />
                          ) : m.attachments[0].type === 'pdf' ? (
                            <FileText className="h-3 w-3" />
                          ) : (
                            <Paperclip className="h-3 w-3" />
                          )}
                          <span className="text-[10px] font-mono truncate">
                            {m.attachments[0].name}
                          </span>
                        </div>
                      )}
                      {m.content || (streaming && !isUser ? '…' : '')}
                    </div>

                    {/* User actions: edit + retry (only on user messages,
                        only when not streaming) */}
                    {isUser && !streaming && (
                      <div className="flex items-center gap-1 mt-1">
                        <button
                          onClick={() => startEdit(m)}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold text-zinc-500 hover:text-white flex items-center gap-1"
                        >
                          <Pencil className="h-2.5 w-2.5" /> Edit
                        </button>
                        <button
                          onClick={() => handleRetry(m)}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold text-zinc-500 hover:text-white flex items-center gap-1"
                        >
                          <RotateCcw className="h-2.5 w-2.5" /> Retry
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={scrollRef} className="h-1" />
            </div>

            {/* Attachment preview */}
            {attachment && (
              <div className="px-3 py-2 border-t border-zinc-900 flex items-center justify-between bg-zinc-950">
                <div className="flex items-center gap-2 min-w-0">
                  {attachment.type === 'image' ? (
                    <ImageIcon className="h-3.5 w-3.5 text-[#00D4FF] shrink-0" />
                  ) : attachment.type === 'pdf' ? (
                    <FileText className="h-3.5 w-3.5 text-[#00D4FF] shrink-0" />
                  ) : (
                    <Paperclip className="h-3.5 w-3.5 text-[#00D4FF] shrink-0" />
                  )}
                  <span className="text-[11px] text-zinc-300 truncate">{attachment.name}</span>
                  <span className="text-[10px] text-zinc-600 font-mono shrink-0">
                    {(attachment.size / 1024).toFixed(1)}KB
                  </span>
                </div>
                <button
                  onClick={() => setAttachment(null)}
                  className="p-1 rounded-full bg-zinc-900 text-zinc-400 hover:text-white shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Edit banner */}
            {editingMsgId && (
              <div className="px-3 py-2 border-t border-[#00D4FF]/40 bg-[#00D4FF]/10 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#00D4FF]">Editing message</span>
                <button
                  onClick={cancelEdit}
                  className="p-1 rounded-full bg-zinc-900 text-zinc-400 hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Composer */}
            <form
              onSubmit={editingMsgId ? submitEdit : handleSend}
              className="px-3 py-3 bg-zinc-950 border-t border-zinc-900 flex items-center gap-2"
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={pickFile}
                disabled={streaming}
                className="w-10 h-10 rounded-xl bg-zinc-900 text-[#00D4FF] flex items-center justify-center active:scale-95 disabled:opacity-30 shrink-0"
                title="Attach file"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={editingMsgId ? 'Edit message…' : 'Message…'}
                disabled={streaming}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 px-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#00D4FF] disabled:opacity-50"
              />
              {streaming ? (
                <button
                  type="button"
                  onClick={stopStreaming}
                  className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center active:scale-95 shrink-0"
                  title="Stop"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() && !attachment}
                  className="w-10 h-10 rounded-xl bg-[#00D4FF] text-black flex items-center justify-center active:scale-95 disabled:opacity-30 shrink-0"
                  title="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </form>
          </>
        )}

        {/* ================= WEB MODE ================= */}
        {mode === 'web' && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-8">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-sm rounded-3xl border p-6 text-center"
              style={{
                backgroundColor: '#0a0a0a',
                borderColor: (webModel?.color || '#00D4FF') + '55',
              }}
            >
              <div
                className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-3xl mb-4"
                style={{ backgroundColor: (webModel?.color || '#00D4FF') + '22' }}
              >
                {webModel?.emoji || '✨'}
              </div>
              <h2 className="text-xl font-bold text-white mb-1">
                {webModel?.name || 'ChatGPT'}
              </h2>
              <p className="text-xs text-zinc-500 mb-5">
                Opens {webModel?.name || 'ChatGPT'} in an in-app browser. Sign in
                once — your session is remembered.
              </p>
              <button
                onClick={() => openWebModel(webModelId)}
                className="w-full py-3.5 rounded-2xl text-sm font-bold text-black active:scale-95 transition-all flex items-center justify-center gap-2"
                style={{
                  backgroundColor:
                    (webModel?.color || '#00D4FF') === '#000000'
                      ? '#ffffff'
                      : (webModel?.color || '#00D4FF'),
                }}
              >
                <Globe className="h-4 w-4" />
                Open {webModel?.name || 'ChatGPT'}
              </button>
              <button
                onClick={() => setWebPickerOpen(true)}
                className="w-full mt-3 py-2.5 rounded-2xl text-xs font-semibold text-zinc-300 border border-zinc-800 hover:bg-zinc-900 active:scale-95 transition-all"
              >
                Change model
              </button>
            </motion.div>
          </div>
        )}
      </div>

      {/* Chat history drawer */}
      <AnimatePresence>
        {historyOpen && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex">
            <motion.div
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 240 }}
              className="w-72 max-w-[80%] bg-zinc-950 border-r border-zinc-900 flex flex-col"
            >
              <div className="p-4 border-b border-zinc-900 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Chat history</h3>
                <button
                  onClick={() => setHistoryOpen(false)}
                  className="p-1.5 rounded-full bg-zinc-900 text-zinc-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <button
                onClick={async () => {
                  await handleNewChat();
                  setHistoryOpen(false);
                }}
                className="m-3 py-2.5 rounded-xl bg-[#00D4FF] text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" /> New chat
              </button>

              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
                {threads.length === 0 && (
                  <p className="text-[11px] text-zinc-600 text-center py-6">No chats yet.</p>
                )}
                {threads.map((t) => {
                  const selected = t.id === activeThreadId;
                  return (
                    <div
                      key={t.id}
                      className={`group flex items-center gap-2 p-2.5 rounded-xl border transition-all ${
                        selected
                          ? 'bg-zinc-900 border-zinc-700'
                          : 'bg-zinc-950 border-zinc-900 hover:bg-zinc-900/60'
                      }`}
                    >
                      <button
                        onClick={() => openThread(t.id)}
                        className="flex-1 text-left min-w-0"
                      >
                        <p className="text-xs font-semibold text-white truncate">{t.title}</p>
                        <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                          {new Date(t.updatedAt).toLocaleString()}
                        </p>
                      </button>
                      <button
                        onClick={() => removeThread(t.id)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-950/20 shrink-0"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
            <div className="flex-1" onClick={() => setHistoryOpen(false)} />
          </div>
        )}
      </AnimatePresence>

      {/* Provider picker */}
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
                  <p className="text-xs text-zinc-400 mb-3">No provider enabled yet.</p>
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

      {/* Web model picker */}
      <AnimatePresence>
        {webPickerOpen && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-5 relative max-h-[80vh] overflow-y-auto"
            >
              <button
                onClick={() => setWebPickerOpen(false)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>

              <h3 className="text-base font-bold text-white mb-1">Choose web AI</h3>
              <p className="text-[11px] text-zinc-500 mb-4">
                Sign in once per site; the session is remembered in the app browser.
              </p>

              <div className="space-y-2">
                {AI_MODELS.map((m) => {
                  const selected = m.id === webModelId;
                  return (
                    <button
                      key={m.id}
                      onClick={() => openWebModel(m.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all active:scale-[0.98] ${
                        selected ? 'bg-zinc-900 border-zinc-700' : 'bg-zinc-950 border-zinc-900 hover:bg-zinc-900/60'
                      }`}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-xl shrink-0"
                        style={{
                          backgroundColor:
                            m.color === '#000000' ? '#18181b' : m.color + '22',
                        }}
                      >
                        {m.emoji}
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{m.name}</p>
                        <p className="text-[10px] text-zinc-500 truncate font-mono">
                          {new URL(m.url).hostname}
                        </p>
                      </div>
                      {selected && <span className="text-[#00D4FF] text-xs font-bold">✓</span>}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
