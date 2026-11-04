'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles } from 'lucide-react';
import {
  getRefineConfig,
  saveRefineConfig,
  clearRefineConfig,
  isRefineConfigured,
  RefineConfig,
} from '@/lib/refine/config';
import { testRefineConfig } from '@/lib/refine/client';
import { useBackHandler } from '@/lib/use-back-handler';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function RefineSettingsModal({ open, onClose }: Props) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useBackHandler(open, onClose);

  useEffect(() => {
    if (!open) return;
    const cfg = getRefineConfig();
    setUrl(cfg.url);
    setKey(cfg.key);
    setModel(cfg.model);
    setMsg(null);
  }, [open]);

  const currentCfg = (): RefineConfig => ({
    url: url.trim(),
    key: key.trim(),
    model: model.trim(),
  });

  const handleSave = () => {
    const cfg = currentCfg();
    if (!isRefineConfigured(cfg)) {
      setMsg({ kind: 'err', text: 'URL and Model are required.' });
      return;
    }
    saveRefineConfig(cfg);
    setMsg({ kind: 'ok', text: 'Saved.' });
  };

  const handleTest = async () => {
    const cfg = currentCfg();
    if (!isRefineConfigured(cfg)) {
      setMsg({ kind: 'err', text: 'URL and Model are required.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await testRefineConfig(cfg);
    setBusy(false);
    if (res.ok) setMsg({ kind: 'ok', text: 'Connection OK.' });
    else setMsg({ kind: 'err', text: res.error || 'Test failed.' });
  };

  const handleClear = () => {
    clearRefineConfig();
    setUrl('');
    setKey('');
    setModel('');
    setMsg({ kind: 'ok', text: 'Cleared.' });
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative max-h-[90vh] overflow-y-auto"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-[#00D4FF]" />
              <h3 className="text-base font-bold font-display text-white">
                AI Refine Endpoint
              </h3>
            </div>

            <p className="text-[11px] text-zinc-500 mb-4 leading-relaxed">
              OpenAI-compatible chat endpoint used by the Refine button in
              chats. Works with OpenAI, Groq, OpenRouter, Ollama, LM Studio,
              llama.cpp, or any local server exposing
              <code className="mx-1 text-zinc-400">/v1/chat/completions</code>.
            </p>

            {msg && (
              <p
                className={`text-xs mb-3 ${
                  msg.kind === 'ok' ? 'text-[#10b981]' : 'text-[#FF006E]'
                }`}
              >
                {msg.text}
              </p>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono block mb-1">
                  Base URL
                </label>
                <input
                  type="url"
                  placeholder="https://api.openai.com or http://192.168.1.10:11434"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#00D4FF]"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono block mb-1">
                  API Key (optional for local)
                </label>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#00D4FF]"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono block mb-1">
                  Model
                </label>
                <input
                  type="text"
                  placeholder="gpt-4o-mini / llama3.1:8b / mistral"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={handleSave}
                className="flex-1 bg-[#00D4FF] hover:bg-[#00B2D6] text-black font-semibold text-xs py-2.5 rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleTest}
                disabled={busy}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 text-white font-semibold text-xs py-2.5 rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                {busy ? 'Testing…' : 'Test'}
              </button>
            </div>

            <button
              type="button"
              onClick={handleClear}
              className="w-full mt-2 text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-300 py-1.5 cursor-pointer"
            >
              Clear
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
