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

// Shared AI Providers modal used from both Settings and AI Chat. Keeps
// state local and reloads from IndexedDB every time it opens.
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

  const toggleProviderEnabled = async (providerId: string) => {
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
      setAiMessage('Saved');
      await loadAiState();
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
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-6 select-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-5 relative max-h-[85vh] overflow-y-auto"
            >
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>

              <h3 className="text-base font-bold text-white mb-1">AI Providers</h3>
              <p className="text-[11px] text-zinc-500 mb-4 leading-relaxed">
                Turn on the providers you use. Add an API key for cloud
                providers, or leave it blank for a local / custom endpoint.
              </p>

              <div className="space-y-2">
                {PROVIDERS.map((p) => {
                  const setting = aiSettings.find((x) => x.providerId === p.id);
                  const enabled = !!setting?.enabled;
                  const keyCount = aiKeys.filter((k) => k.providerId === p.id).length;
                  return (
                    <div
                      key={p.id}
                      className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white truncate">
                            {p.name}
                          </p>
                          <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                            {p.requiresKey
                              ? `${keyCount} key${keyCount === 1 ? '' : 's'}`
                              : 'No key required'}
                            {setting?.model ? ` · ${setting.model}` : ''}
                          </p>
                        </div>
                        <button
                          onClick={() => toggleProviderEnabled(p.id)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider active:scale-95 ${
                            enabled
                              ? 'bg-[#00D4FF]/20 text-[#00D4FF]'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {enabled ? 'On' : 'Off'}
                        </button>
                      </div>
                      <button
                        onClick={() => openProviderEditor(p.id)}
                        className="w-full mt-2 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 text-[10px] font-bold uppercase tracking-wider active:scale-95"
                      >
                        Manage keys & model
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={handleClose}
                className="w-full bg-zinc-900 text-zinc-300 font-semibold text-xs py-2.5 rounded-xl mt-5 cursor-pointer"
              >
                Done
              </button>
            </motion.div>
          </div>
        )}

        {editingProvider && (
          <div className="fixed inset-0 bg-black/92 backdrop-blur-md z-[110] flex items-center justify-center p-6 select-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-5 relative max-h-[88vh] overflow-y-auto"
            >
              <button
                onClick={() => setEditingProvider(null)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>

              <h3 className="text-base font-bold text-white mb-1">
                {def?.name || editingProvider}
              </h3>
              {def?.description && (
                <p className="text-[10px] text-zinc-500 mb-4">{def.description}</p>
              )}

              <div className="mb-3">
                <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-mono font-bold block mb-1">
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
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#00D4FF]"
                />
                {editingProvider === 'custom-openai' && (
                  <p className="text-[9px] text-zinc-600 mt-1 leading-snug">
                    For LM Studio / Ollama / llama.cpp, use the host:port of
                    the machine running the model. Add /v1 if the server
                    exposes an OpenAI-compatible API.
                  </p>
                )}
              </div>

              <div className="mb-3">
                <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-mono font-bold block mb-1">
                  Model name
                </label>
                <input
                  type="text"
                  value={editModel}
                  onChange={(e) => setEditModel(e.target.value)}
                  placeholder={def?.defaultModelHint || 'model-id (type anything)'}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#00D4FF]"
                />
              </div>

              <div className="mb-4">
                <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-mono font-bold block mb-1">
                  API key {def?.requiresKey ? '' : '(optional)'}
                </label>
                <input
                  type="password"
                  value={editApiKey}
                  onChange={(e) => setEditApiKey(e.target.value)}
                  placeholder={
                    def?.requiresKey
                      ? 'sk-… (stored locally)'
                      : 'Leave blank for local / custom endpoints'
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#00D4FF]"
                />
              </div>

              <button
                onClick={saveProviderEdits}
                disabled={!canSaveProvider}
                className="w-full py-2.5 rounded-xl bg-[#00D4FF] text-black font-bold text-xs uppercase tracking-wider active:scale-97 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save
              </button>

              {!canSaveProvider && (
                <p className="text-[10px] text-zinc-500 text-center mt-2">
                  {def?.requiresKey
                    ? 'Base URL, model, and API key are required.'
                    : 'Base URL and model are required.'}
                </p>
              )}

              {aiMessage && (
                <p className="text-[11px] text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 mt-3 leading-snug">
                  {aiMessage}
                </p>
              )}
            </motion.div>
          </div>
        )}
      </>
    </AnimatePresence>
  );
}
