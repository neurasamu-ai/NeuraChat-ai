'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { PROVIDERS, getProvider } from '@/lib/ai/providers';
import {
  getProviderSettings, getKeys, updateProviderSettings,
  setKeyForProvider, clearKeyForProvider, getKeyForProvider,
} from '@/lib/ai/keystore';
import { ProviderKey, ProviderSettings } from '@/lib/ai/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

// Shared AI Providers modal used from both Settings and AI Chat.
// Dark, minimal, and self-contained: state reloads from IndexedDB every
// time it opens, and any edit is written immediately.
export default function AiProvidersModal({ open, onClose }: Props) {
  const [aiSettings, setAiSettings] = useState<ProviderSettings[]>([]);
  const [aiKeys, setAiKeys] = useState<ProviderKey[]>([]);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editApiKey, setEditApiKey] = useState('');
  const [aiMessage, setAiMessage] = useState('');

  const vibrate = () => {
    if (typeof window !== 'undefined' && navigator.vibrate) navigator.vibrate(25);
  };

  const loadAiState = async () => {
    try {
      const [settings, keys] = await Promise.all([getProviderSettings(), getKeys()]);
      setAiSettings(settings);
      setAiKeys(keys);
    } catch (e) {
      console.error('[AiProvidersModal] load failed', e);
    }
  };

  useEffect(() => {
    if (!open) return;
    loadAiState();
  }, [open]);

  const toggleProvider = async (providerId: string) => {
    vibrate();
    const cur = aiSettings.find((s) => s.providerId === providerId);
    await updateProviderSettings(providerId, { enabled: !cur?.enabled });
    await loadAiState();
  };

  const openProviderEditor = async (providerId: string) => {
    vibrate();
    const def = getProvider(providerId);
    const cur = aiSettings.find((s) => s.providerId === providerId);
    const existingKey = await getKeyForProvider(providerId);
    setEditBaseUrl(cur?.baseUrl || def?.defaultBaseUrl || '');
    setEditModel(cur?.model || '');
    setEditApiKey(existingKey?.key || '');
    setEditingProvider(providerId);
    setAiMessage('');
  };

  const saveProviderEdits = async () => {
    if (!editingProvider) return;
    vibrate();
    setAiMessage('');
    try {
      await updateProviderSettings(editingProvider, {
        baseUrl: editBaseUrl.trim() || undefined,
        model: editModel.trim() || undefined,
      });
      if (editApiKey.trim()) {
        await setKeyForProvider(editingProvider, editApiKey.trim());
      } else {
        await clearKeyForProvider(editingProvider);
      }
      // Close the editor AND the modal so the user lands back on the chat.
      setEditingProvider(null);
      onClose();
    } catch (e: any) {
      setAiMessage('Save failed: ' + (e?.message || 'unknown'));
    }
  };

  const def = editingProvider ? getProvider(editingProvider) : undefined;
  const canSaveProvider = !!editingProvider
    && editBaseUrl.trim().length > 0
    && editModel.trim().length > 0
    && (editApiKey.trim().length > 0 || !def?.requiresKey);

  const handleClose = () => {
    setEditingProvider(null);
    setAiMessage('');
    onClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <>
        {!editingProvider && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[100] flex items-end sm:items-center justify-center p-3 sm:p-6 select-none">
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0, scale: 0.97 }}
              transition={{ type: 'spring', damping: 24, stiffness: 260 }}
              className="w-full max-w-md bg-zinc-950 border border-zinc-800/80 rounded-3xl relative max-h-[88vh] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="px-5 pt-5 pb-3 border-b border-zinc-900">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-white">AI Providers</h3>
                    <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
                      Add providers you use. Cloud needs a key, local can skip it.
                    </p>
                  </div>
                  <button
                    onClick={handleClose}
                    className="p-1.5 rounded-full bg-zinc-900 text-zinc-400 hover:text-white active:scale-90 transition-all"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
                {PROVIDERS.map((p) => {
                  const setting = aiSettings.find((x) => x.providerId === p.id);
                  const enabled = !!setting?.enabled;
                  const keyCount = aiKeys.filter((k) => k.providerId === p.id).length;
                  const hasModel = !!setting?.model;
                  const configured = keyCount > 0 || !p.requiresKey;
                  return (
                    <div
                      key={p.id}
                      className={`rounded-2xl border transition-all overflow-hidden ${
                        enabled
                          ? 'bg-[#00D4FF]/5 border-[#00D4FF]/40'
                          : 'bg-zinc-900/40 border-zinc-800/70'
                      }`}
                    >
                      <div className="flex items-center gap-3 p-3">
                        {/* Left indicator */}
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            enabled ? 'bg-[#00D4FF]/15' : 'bg-zinc-900'
                          }`}
                        >
                          <span
                            className={`text-xs font-bold ${
                              enabled ? 'text-[#00D4FF]' : 'text-zinc-500'
                            }`}
                          >
                            {p.name.slice(0, 2).toUpperCase()}
                          </span>
                        </div>

                        {/* Name + status */}
                        <button
                          onClick={() => openProviderEditor(p.id)}
                          className="flex-1 min-w-0 text-left active:opacity-70 transition-opacity"
                        >
                          <p className={`text-sm font-semibold truncate ${enabled ? 'text-white' : 'text-zinc-300'}`}>
                            {p.name}
                          </p>
                          <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                            {p.requiresKey
                              ? keyCount > 0
                                ? `${keyCount} key${keyCount === 1 ? '' : 's'}${hasModel ? ` · ${setting?.model}` : ''}`
                                : 'No key yet'
                              : hasModel
                                ? `Local · ${setting?.model}`
                                : 'Local endpoint'}
                          </p>
                        </button>

                        {/* Add / Remove */}
                        <button
                          onClick={() => toggleProvider(p.id)}
                          className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider active:scale-95 transition-all shrink-0 ${
                            enabled
                              ? 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                              : configured
                                ? 'bg-[#00D4FF] text-black'
                                : 'bg-[#00D4FF]/20 text-[#00D4FF]'
                          }`}
                        >
                          {enabled ? 'Remove' : 'Add'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-zinc-900">
                <button
                  onClick={handleClose}
                  className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs py-3 rounded-2xl transition-colors"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {editingProvider && (
          <div className="fixed inset-0 bg-black/88 backdrop-blur-md z-[110] flex items-end sm:items-center justify-center p-3 sm:p-6 select-none">
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 260 }}
              className="w-full max-w-md bg-zinc-950 border border-zinc-800/80 rounded-3xl relative max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="px-5 pt-5 pb-3 border-b border-zinc-900">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {def?.name || editingProvider}
                    </h3>
                    {def?.description && (
                      <p className="text-[11px] text-zinc-500 mt-0.5">{def.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setEditingProvider(null)}
                    className="p-1.5 rounded-full bg-zinc-900 text-zinc-400 hover:text-white active:scale-90 transition-all"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold block mb-1.5">
                    Base URL
                  </label>
                  <input
                    type="text"
                    value={editBaseUrl}
                    onChange={(e) => setEditBaseUrl(e.target.value)}
                    placeholder={
                      editingProvider === 'custom-openai'
                        ? 'http://192.168.1.5:1234/v1'
                        : (def?.defaultBaseUrl || 'https://api.example.com/v1')
                    }
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-3.5 py-3 text-xs text-white font-mono focus:outline-none focus:border-[#00D4FF] transition-colors"
                  />
                  {editingProvider === 'custom-openai' && (
                    <p className="text-[10px] text-zinc-600 mt-1.5 leading-snug">
                      LM Studio / Ollama / llama.cpp — host:port of the machine
                      running the model.
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold block mb-1.5">
                    Model
                  </label>
                  <input
                    type="text"
                    value={editModel}
                    onChange={(e) => setEditModel(e.target.value)}
                    placeholder={def?.defaultModelHint || 'model-id'}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-3.5 py-3 text-xs text-white font-mono focus:outline-none focus:border-[#00D4FF] transition-colors"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold block mb-1.5">
                    API key {def?.requiresKey ? '' : '(optional)'}
                  </label>
                  <input
                    type="password"
                    value={editApiKey}
                    onChange={(e) => setEditApiKey(e.target.value)}
                    placeholder={
                      def?.requiresKey ? 'sk-…' : 'Leave blank for local'
                    }
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-3.5 py-3 text-xs text-white font-mono focus:outline-none focus:border-[#00D4FF] transition-colors"
                  />
                </div>

                {aiMessage && (
                  <p className="text-[11px] text-red-400 bg-red-500/5 border border-red-500/20 rounded-2xl p-3 leading-snug">
                    {aiMessage}
                  </p>
                )}
              </div>

              <div className="px-5 py-4 border-t border-zinc-900">
                <button
                  onClick={saveProviderEdits}
                  disabled={!canSaveProvider}
                  className="w-full py-3.5 rounded-2xl bg-[#00D4FF] text-black font-bold text-xs uppercase tracking-wider active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Save
                </button>
                {!canSaveProvider && (
                  <p className="text-[10px] text-zinc-500 text-center mt-2">
                    {def?.requiresKey
                      ? 'Base URL, model, and API key required.'
                      : 'Base URL and model required.'}
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </>
    </AnimatePresence>
  );
}
