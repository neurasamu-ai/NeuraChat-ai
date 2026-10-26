'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { motion } from 'motion/react';
import { Fingerprint, Delete, ShieldCheck } from 'lucide-react';

interface Props {
  mode: 'setup' | 'unlock';
  savedPattern?: number[]; // for unlock mode
  onSuccess: (pattern: number[]) => void;
  onCancel: () => void;
}

export default function AppLockScreen({ mode, savedPattern, onSuccess, onCancel }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [error, setError] = useState('');
  const [confirmMode, setConfirmMode] = useState(false); // for setup: first entry then confirm
  const [firstPattern, setFirstPattern] = useState<number[]>([]);
  const [bioAvailable, setBioAvailable] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load biometric availability
  useEffect(() => {
    (async () => {
      try {
        const res = await BiometricAuth.checkBiometry();
        setBioAvailable(res.isAvailable);
        if (mode === 'unlock' && res.isAvailable) {
          triggerBiometric();
        }
      } catch (e) {
        // ignore
      }
    })();
  }, [mode]);

  const triggerBiometric = async () => {
    try {
      await BiometricAuth.authenticate({
        reason: 'Unlock NeuraChat',
        cancelTitle: 'Cancel',
        allowDeviceCredential: true,
        iosFallbackTitle: 'Use passcode',
        androidTitle: 'NeuraChat Locked',
        androidSubtitle: 'Unlock with biometrics',
      });
      // Success
      onSuccess(savedPattern || []);
    } catch (e) {
      // User cancelled or failed — let them use pattern
    }
  };

  // --- Pattern logic ---
  const getDotIndex = (clientX: number, clientY: number) => {
    if (!containerRef.current) return -1;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    // 3x3 grid
    const col = Math.floor((x / rect.width) * 3);
    const row = Math.floor((y / rect.height) * 3);
    if (col < 0 || col > 2 || row < 0 || row > 2) return -1;
    return row * 3 + col;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setError('');
    setIsDrawing(true);
    setSelected([]);
    const idx = getDotIndex(e.clientX, e.clientY);
    if (idx !== -1) setSelected([idx]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    const idx = getDotIndex(e.clientX, e.clientY);
    if (idx !== -1 && !selected.includes(idx)) {
      setSelected((prev) => [...prev, idx]);
    }
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (selected.length < 3) {
      setError('Connect at least 3 dots');
      setSelected([]);
      return;
    }

    if (mode === 'unlock') {
      const isMatch =
        savedPattern &&
        savedPattern.length === selected.length &&
        savedPattern.every((v, i) => v === selected[i]);
      if (isMatch) {
        onSuccess(selected);
      } else {
        setError('Incorrect pattern. Try again.');
        setSelected([]);
      }
    } else {
      // setup mode
      if (!confirmMode) {
        setFirstPattern(selected);
        setConfirmMode(true);
        setSelected([]);
      } else {
        const isMatch =
          firstPattern.length === selected.length &&
          firstPattern.every((v, i) => v === selected[i]);
        if (isMatch) {
          onSuccess(selected);
        } else {
          setError('Patterns do not match. Start over.');
          setConfirmMode(false);
          setFirstPattern([]);
          setSelected([]);
        }
      }
    }
  };

  const removeLast = () => {
    setSelected((prev) => prev.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 bg-zinc-950 z-[200] flex flex-col items-center justify-center p-6 select-none">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#00D4FF]/10 border border-[#00D4FF]/30 flex items-center justify-center">
          <ShieldCheck className="w-8 h-8 text-[#00D4FF]" />
        </div>
        <h1 className="text-white font-bold text-lg">
          {mode === 'setup'
            ? confirmMode
              ? 'Confirm Pattern'
              : 'Draw Pattern'
            : 'NeuraChat Locked'}
        </h1>
        <p className="text-zinc-400 text-xs mt-1">
          {mode === 'setup'
            ? confirmMode
              ? 'Draw the same pattern again'
              : 'Connect at least 3 dots'
            : 'Draw your pattern or use biometrics'}
        </p>
      </div>

      {/* Pattern Grid */}
      <div
        ref={containerRef}
        className="relative w-64 h-64 touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
          {selected.slice(0, -1).map((dot, i) => {
            const next = selected[i + 1];
            const x1 = (dot % 3) * 33.33 + 16.66;
            const y1 = Math.floor(dot / 3) * 33.33 + 16.66;
            const x2 = (next % 3) * 33.33 + 16.66;
            const y2 = Math.floor(next / 3) * 33.33 + 16.66;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#00D4FF"
                strokeWidth="3"
                strokeLinecap="round"
              />
            );
          })}
        </svg>
        <div className="grid grid-cols-3 grid-rows-3 w-full h-full">
          {Array.from({ length: 9 }).map((_, i) => {
            const isSelected = selected.includes(i);
            return (
              <div key={i} className="flex items-center justify-center">
                <div
                  className={`w-6 h-6 rounded-full transition-all duration-150 ${
                    isSelected
                      ? 'bg-[#00D4FF] scale-125 shadow-[0_0_15px_rgba(0,212,255,0.6)]'
                      : 'bg-zinc-800 border border-zinc-700'
                  }`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-red-400 text-xs mt-6 font-bold"
        >
          {error}
        </motion.p>
      )}

      {/* Controls */}
      <div className="mt-8 flex items-center gap-6">
        <button
          onClick={removeLast}
          disabled={selected.length === 0}
          className="p-3 rounded-full bg-zinc-900 text-zinc-400 disabled:opacity-30 hover:text-white transition-colors"
        >
          <Delete className="w-5 h-5" />
        </button>

        {bioAvailable && mode === 'unlock' && (
          <button
            onClick={triggerBiometric}
            className="p-3 rounded-full bg-[#00D4FF]/10 border border-[#00D4FF]/30 text-[#00D4FF] hover:bg-[#00D4FF]/20 transition-colors"
          >
            <Fingerprint className="w-6 h-6" />
          </button>
        )}

        <button
          onClick={onCancel}
          className="text-zinc-500 text-xs font-bold uppercase tracking-wider hover:text-white px-4 py-3"
        >
          {mode === 'setup' ? 'Cancel' : 'Exit'}
        </button>
      </div>
    </div>
  );
}
