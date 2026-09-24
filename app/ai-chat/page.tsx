'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ChevronDown, X, ExternalLink, Shield } from 'lucide-react';
import Header from '@/components/Header';
import {
  AI_MODELS,
  AiModel,
  getPreferredAiModelId,
  setPreferredAiModelId,
  getAiModel,
  openAiWebView,
  isAiWebViewAvailable,
} from '@/lib/ai-webview';
import { useBackHandler } from '@/lib/use-back-handler';

export default function AiChatPage() {
  const router = useRouter();
  const [modelId, setModelId] = useState<string>('chatgpt');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    setModelId(getPreferredAiModelId());
  }, []);

  const model = getAiModel(modelId) || AI_MODELS[0];

  const openModel = async (m: AiModel) => {
    setOpening(true);
    try {
      await openAiWebView(m.url, m.name, m.id);
    } catch (e) {
      console.error('openAiWebView failed', e);
    } finally {
      setTimeout(() => setOpening(false), 800);
    }
  };

  const pickModel = (m: AiModel) => {
    setPreferredAiModelId(m.id);
    setModelId(m.id);
    setPickerOpen(false);
  };

  useBackHandler(pickerOpen, () => setPickerOpen(false));

  return (
    <>
      <Header
        title=""
        onBack={() => router.back()}
        rightAction={
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider"
            style={{
              backgroundColor: '#18181b',
              color: model.color === '#000000' ? '#ffffff' : model.color,
              border: `1px solid ${model.color === '#000000' ? '#ffffff33' : model.color + '66'}`,
            }}
          >
            <span>{model.emoji}</span>
            <span>{model.name}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
        }
      />

      <main className="flex-1 flex flex-col items-center justify-center px-6 -mt-8">
        {/* Big model card */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-sm rounded-3xl border p-6 text-center"
          style={{
            backgroundColor: '#0a0a0a',
            borderColor: model.color === '#000000' ? '#333' : model.color + '55',
          }}
        >
          <div
            className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-3xl mb-4"
            style={{ backgroundColor: model.color === '#000000' ? '#18181b' : model.color + '22' }}
          >
            {model.emoji}
          </div>
          <h2 className="text-xl font-bold text-white mb-1">{model.name}</h2>
          <p className="text-xs text-zinc-500 mb-5">
            Opens the official {model.name} website in a private in-app browser.
            Your login is remembered.
          </p>

          <button
            onClick={() => openModel(model)}
            disabled={opening}
            className="w-full py-3.5 rounded-2xl text-sm font-bold text-black active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: model.color === '#000000' ? '#ffffff' : model.color }}
          >
            <Sparkles className="h-4 w-4" />
            {opening ? 'Opening…' : `Open ${model.name}`}
          </button>

          <button
            onClick={() => setPickerOpen(true)}
            className="w-full mt-3 py-2.5 rounded-2xl text-xs font-semibold text-zinc-300 border border-zinc-800 hover:bg-zinc-900 active:scale-95 transition-all"
          >
            Change model
          </button>
        </motion.div>

        {/* Info strip */}
        <div className="mt-6 flex items-start gap-2 max-w-sm text-[10px] text-zinc-500 leading-relaxed">
          <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <p>
            The web session runs in its own window. Cookies persist so you only sign
            in once per model. Downloads from the page are saved to your device.
          </p>
        </div>
      </main>

      {/* Model picker modal */}
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
                Switching here changes the model for every future open. Each one
                keeps its own login session.
              </p>

              <div className="space-y-2">
                {AI_MODELS.map((m) => {
                  const selected = m.id === modelId;
                  return (
                    <button
                      key={m.id}
                      onClick={() => pickModel(m)}
                      className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all active:scale-[0.98] ${
                        selected
                          ? 'bg-zinc-900 border-zinc-700'
                          : 'bg-zinc-950 border-zinc-900 hover:bg-zinc-900/60'
                      }`}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                        style={{
                          backgroundColor:
                            m.color === '#000000' ? '#18181b' : m.color + '22',
                        }}
                      >
                        {m.emoji}
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {m.name}
                        </p>
                        <p className="text-[10px] text-zinc-500 truncate font-mono">
                          {new URL(m.url).hostname}
                        </p>
                      </div>
                      {selected && (
                        <span className="text-[#00D4FF] text-xs font-bold">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {!isAiWebViewAvailable() && (
                <div className="mt-4 flex items-start gap-2 text-[10px] text-yellow-500/80">
                  <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <p>
                    Native WebView plugin not available here — will open in a new
                    tab instead.
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
