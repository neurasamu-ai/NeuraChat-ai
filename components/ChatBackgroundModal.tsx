'use client';

import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Check, Image as ImageIcon, Trash2, ZoomIn, Move } from 'lucide-react';
import { ChatBackground } from '@/lib/db';

interface Props {
  open: boolean;
  current?: ChatBackground;
  onCancel: () => void;
  onSave: (bg: ChatBackground | null) => void;
}

// Read a File as a base64 data URL.
function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ChatBackgroundModal({
  open,
  current,
  onCancel,
  onSave,
}: Props) {
  const [image, setImage] = useState<string>(current?.image || '');
  const [opacity, setOpacity] = useState<number>(current?.opacity ?? 40);
  const [zoom, setZoom] = useState<number>(current?.zoom ?? 1);
  const [panX, setPanX] = useState<number>(current?.panX ?? 0);
  const [panY, setPanY] = useState<number>(current?.panY ?? 0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFile(file);
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      setImage(base64);
      // Reset adjustments whenever a new image is chosen.
      setZoom(1);
      setPanX(0);
      setPanY(0);
    } catch (err) {
      console.error('image pick failed', err);
    }
    e.target.value = '';
  };

  const handleRemove = () => {
    onSave(null);
  };

  const handleSave = () => {
    if (!image) {
      onSave(null);
      return;
    }
    onSave({ image, opacity, zoom, panX, panY });
  };

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black z-[120] flex flex-col select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900">
        <button
          onClick={onCancel}
          className="p-2 -ml-2 rounded-full text-zinc-300 hover:text-white active:scale-90 transition-all"
        >
          <X className="h-5 w-5" />
        </button>
        <p className="text-sm font-semibold text-white">Chat Background</p>
        <button
          onClick={handleSave}
          className="p-2 -mr-2 rounded-full text-[#00D4FF] hover:text-white active:scale-90 transition-all"
        >
          <Check className="h-5 w-5" />
        </button>
      </div>

      {/* Preview */}
      <div className="relative flex-1 bg-zinc-950 overflow-hidden">
        {image ? (
          <>
            {/* The image layer with zoom + pan + opacity */}
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url(data:image/jpeg;base64,${image})`,
                opacity: opacity / 100,
                transform: `scale(${zoom}) translate(${panX}%, ${panY}%)`,
                transition: 'transform 0.05s linear',
              }}
            />
            {/* Sample bubbles so the user sees how text will read */}
            <div className="absolute inset-0 p-4 flex flex-col gap-3 pointer-events-none">
              <div className="self-start max-w-[70%] bg-zinc-900/95 border border-zinc-800 text-zinc-100 px-3 py-2 rounded-2xl rounded-tl-sm text-xs">
                Hey, how does the background look?
              </div>
              <div className="self-end max-w-[70%] bg-[#cbfe00] text-zinc-950 px-3 py-2 rounded-2xl rounded-tr-sm text-xs">
                Looks good on the yellow bubble
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-16 h-16 rounded-3xl bg-zinc-900 flex items-center justify-center mb-4">
              <ImageIcon className="h-7 w-7 text-zinc-500" />
            </div>
            <p className="text-sm text-zinc-300 font-semibold">No background yet</p>
            <p className="text-xs text-zinc-500 mt-1 max-w-[240px] leading-snug">
              Pick a photo from your gallery to use behind the messages.
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-5 py-4 bg-zinc-950 border-t border-zinc-900 space-y-4">
        {/* Pick / Replace */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold uppercase tracking-wider active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          <ImageIcon className="h-4 w-4" />
          {image ? 'Replace image' : 'Pick image'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePick}
          className="hidden"
        />

        {image && (
          <>
            {/* Opacity */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 w-16 shrink-0">
                Opacity
              </span>
              <input
                type="range"
                min={5}
                max={100}
                step={1}
                value={opacity}
                onChange={(e) => setOpacity(parseInt(e.target.value, 10))}
                className="flex-1 accent-[#00D4FF]"
              />
              <span className="text-[10px] font-mono text-zinc-400 w-10 text-right">
                {opacity}%
              </span>
            </div>

            {/* Zoom */}
            <div className="flex items-center gap-3">
              <ZoomIn className="h-4 w-4 text-zinc-500 shrink-0" />
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-1 accent-[#00D4FF]"
              />
              <span className="text-[10px] font-mono text-zinc-400 w-10 text-right">
                {zoom.toFixed(2)}×
              </span>
            </div>

            {/* Pan X */}
            <div className="flex items-center gap-3">
              <Move className="h-4 w-4 text-zinc-500 shrink-0" />
              <input
                type="range"
                min={-100}
                max={100}
                step={1}
                value={panX}
                onChange={(e) => setPanX(parseInt(e.target.value, 10))}
                className="flex-1 accent-[#00D4FF]"
              />
              <span className="text-[10px] font-mono text-zinc-400 w-10 text-right">
                {panX}
              </span>
            </div>

            {/* Pan Y */}
            <div className="flex items-center gap-3">
              <Move className="h-4 w-4 text-zinc-500 shrink-0 rotate-90" />
              <input
                type="range"
                min={-100}
                max={100}
                step={1}
                value={panY}
                onChange={(e) => setPanY(parseInt(e.target.value, 10))}
                className="flex-1 accent-[#00D4FF]"
              />
              <span className="text-[10px] font-mono text-zinc-400 w-10 text-right">
                {panY}
              </span>
            </div>

            <button
              onClick={handleRemove}
              className="w-full py-2.5 rounded-2xl bg-red-500/10 text-red-400 text-xs font-bold uppercase tracking-wider active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Remove background
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}
