'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Pause, Play, User, Grid3x3, Circle, Square, X } from 'lucide-react';
import {
  getCurrentCall,
  addCallStateListener,
  endCall,
  acceptCall,
  toggleMute,
  toggleSpeaker,
  toggleHold,
  isTelecomPluginAvailable,
  playDtmf,
  startCallRecording,
  stopCallRecording,
  isCallRecording,
  CallState,
  CallSnapshot,
  addCallsChangedListener,
  answerCallById,
  endCallById,
  swapToCall,
} from '@/lib/telecom-plugin';

const IDLE: CallState = {
  state: 'IDLE', number: '', name: '', incoming: false,
  muted: false, speakerOn: false, held: false, startedAt: 0, hasCall: false,
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function ActiveCallScreen() {
  const [call, setCall] = useState<CallState>(IDLE);
  const [elapsed, setElapsed] = useState(0);
  const [numpadOpen, setNumpadOpen] = useState(false);
  const [numpadInput, setNumpadInput] = useState('');
  const [allCalls, setAllCalls] = useState<CallSnapshot[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordingPath, setRecordingPath] = useState<string>('');
  const listenerRef = useRef<{ remove: () => void } | null>(null);
  const listenerCallsRef = useRef<{ remove: () => void } | null>(null);

  // Subscribe to native call state
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isTelecomPluginAvailable()) return;

    let cancelled = false;

    const start = async () => {
      await new Promise((r) => setTimeout(r, 600));
      if (cancelled) return;

      // Fetch current state (in case a call is already active)
      try {
        const s = await getCurrentCall();
        if (!cancelled) setCall(s);
      } catch {}
      try {
        const rec = await isCallRecording();
        if (!cancelled) setRecording(rec);
      } catch {}

      // Subscribe to changes
      listenerRef.current = await addCallStateListener((data) => {
        setCall(data);
      });

      // Subscribe to the multi-call snapshot for call waiting UI.
      try {
        listenerCallsRef.current = await addCallsChangedListener((calls) => {
          setAllCalls(calls);
        });
      } catch (e) {
        console.error('callsChanged sub failed', e);
      }
    };

    start();

    return () => {
      cancelled = true;
      if (listenerRef.current && listenerRef.current.remove) {
        try { listenerRef.current.remove(); } catch {}
      }
      if (listenerCallsRef.current && listenerCallsRef.current.remove) {
        try { listenerCallsRef.current.remove(); } catch {}
      }
    };
  }, []);

  // Call timer
  useEffect(() => {
    if (call.state !== 'ACTIVE' || !call.startedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - call.startedAt) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [call.state, call.startedAt]);

  // clear input when the pad closes
  const handleDtmf = async (digit: string) => {
    try {
      setNumpadInput((prev) => prev + digit);
      await playDtmf(digit);
    } catch (e) {
      console.error(e);
    }
  };

  const handleEraseDigit = async () => {
    setNumpadInput((prev) => prev.slice(0, -1));
  };

  const handleToggleRecord = async () => {
    if (recording) {
      const res = await stopCallRecording();
      setRecording(false);
      if (res.path) {
        setRecordingPath(res.path);
        console.log('Recording saved:', res.path);
      }
    } else {
      const res = await startCallRecording();
      if (res.ok) {
        setRecording(true);
      } else {
        console.error('Record failed:', res.error);
      }
    }
  };

  const visible = call.state !== 'IDLE' && call.state !== 'DISCONNECTED' && call.hasCall !== false;
  const displayName = call.name && call.name.length > 0 ? call.name : (call.number || 'Unknown');
  const initial = displayName.slice(0, 2).toUpperCase();

  const statusLabel = (() => {
    switch (call.state) {
      case 'RINGING': return call.incoming ? 'Incoming call' : 'Ringing';
      case 'DIALING': return 'Calling…';
      case 'CONNECTING': return 'Connecting…';
      case 'ACTIVE': return formatDuration(elapsed);
      case 'HOLDING': return 'On hold';
      case 'SELECT_PHONE_ACCOUNT': return 'Choose SIM';
      default: return '';
    }
  })();

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: 'spring', damping: 24, stiffness: 220 }}
          className="fixed inset-0 z-[100] bg-black flex flex-col justify-between overflow-hidden"
        >
          {/* Glow background */}
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full bg-[#00D4FF]/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full bg-[#FF006E]/20 blur-3xl pointer-events-none" />

          {/* Top bar */}
          <div className="relative pt-10 pb-4 flex flex-col items-center text-center px-6">
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono mb-6">
              {call.state === 'ACTIVE' ? 'In call' : 'NeuraChat Call'}
            </p>

            {/* Avatar with pulse */}
            <div className="relative mb-5">
              <div className="absolute inset-0 rounded-full bg-[#00D4FF]/25 animate-ping" />
              <div className="relative w-24 h-24 rounded-full bg-zinc-900 border-2 border-[#00D4FF] flex items-center justify-center text-[#00D4FF] font-bold text-3xl overflow-hidden">
                {initial || <User className="h-8 w-8" />}
              </div>
            </div>

            <h2 className="text-2xl font-bold text-white font-display tracking-tight truncate max-w-full">
              {displayName}
            </h2>
            {call.name && call.number && call.name !== call.number && (
              <p className="text-xs text-zinc-500 font-mono mt-1">{call.number}</p>
            )}

            <p className="mt-3 text-sm font-semibold text-[#00D4FF] animate-pulse">
              {statusLabel}
            </p>
          </div>

          {/* Call waiting card — appears when a second call is present */}
          {allCalls.length > 1 && (
            <div className="relative px-6 mt-2">
              {allCalls
                .filter((c) => c.state !== 'DISCONNECTED')
                .map((c) => {
                  const isRinging = c.state === 'RINGING';
                  const isHeld = c.state === 'HOLDING';
                  const isActive = c.state === 'ACTIVE';
                  return (
                    <div
                      key={c.id}
                      className="mb-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 backdrop-blur-md p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono">
                          {isRinging ? 'Incoming' : isHeld ? 'On hold' : isActive ? 'Active' : c.state}
                        </p>
                        <p className="text-sm font-bold text-white truncate">
                          {c.name || c.number || 'Unknown'}
                        </p>
                        {c.name && c.number && c.name !== c.number && (
                          <p className="text-[10px] text-zinc-500 font-mono truncate">{c.number}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isRinging && (
                          <>
                            <button
                              onClick={async () => {
                                await endCallById(c.id);
                              }}
                              className="w-10 h-10 rounded-full bg-red-600/90 text-white flex items-center justify-center active:scale-95"
                              aria-label="Decline"
                            >
                              <PhoneOff className="h-4 w-4" />
                            </button>
                            <button
                              onClick={async () => {
                                await answerCallById(c.id);
                              }}
                              className="w-10 h-10 rounded-full bg-emerald-500 text-black flex items-center justify-center active:scale-95"
                              aria-label="Answer"
                            >
                              <Phone className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {isHeld && (
                          <button
                            onClick={async () => {
                              await swapToCall(c.id);
                            }}
                            className="px-3 h-9 rounded-full bg-[#00D4FF] text-black text-xs font-bold active:scale-95"
                          >
                            Swap
                          </button>
                        )}
                        {isActive && !c.active && (
                          <button
                            onClick={async () => {
                              await swapToCall(c.id);
                            }}
                            className="px-3 h-9 rounded-full bg-[#00D4FF] text-black text-xs font-bold active:scale-95"
                          >
                            Resume
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Controls */}
          <div className="relative px-6 pb-10">
            {/* Secondary controls row */}
            <div className="grid grid-cols-5 gap-2.5 mb-6">
              <button
                onClick={() => { toggleMute(!call.muted); setCall({ ...call, muted: !call.muted }); }}
                className={`flex flex-col items-center gap-1 py-3 rounded-2xl border transition-all active:scale-95 ${
                  call.muted
                    ? 'bg-[#00D4FF]/15 border-[#00D4FF]/50 text-[#00D4FF]'
                    : 'bg-zinc-900/70 border-zinc-800 text-zinc-300'
                }`}
              >
                {call.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                <span className="text-[9px] font-medium">Mute</span>
              </button>

              <button
                onClick={() => { toggleSpeaker(!call.speakerOn); setCall({ ...call, speakerOn: !call.speakerOn }); }}
                className={`flex flex-col items-center gap-1 py-3 rounded-2xl border transition-all active:scale-95 ${
                  call.speakerOn
                    ? 'bg-[#00D4FF]/15 border-[#00D4FF]/50 text-[#00D4FF]'
                    : 'bg-zinc-900/70 border-zinc-800 text-zinc-300'
                }`}
              >
                {call.speakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                <span className="text-[9px] font-medium">Speaker</span>
              </button>

              <button
                onClick={() => { toggleHold(!call.held); setCall({ ...call, held: !call.held }); }}
                disabled={call.state !== 'ACTIVE' && call.state !== 'HOLDING'}
                className={`flex flex-col items-center gap-1 py-3 rounded-2xl border transition-all active:scale-95 disabled:opacity-40 ${
                  call.held
                    ? 'bg-[#FF006E]/15 border-[#FF006E]/50 text-[#FF006E]'
                    : 'bg-zinc-900/70 border-zinc-800 text-zinc-300'
                }`}
              >
                {call.held ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                <span className="text-[9px] font-medium">{call.held ? 'Resume' : 'Hold'}</span>
              </button>

              <button
                onClick={() => setNumpadOpen(true)}
                disabled={call.state !== 'ACTIVE'}
                className="flex flex-col items-center gap-1 py-3 rounded-2xl border bg-zinc-900/70 border-zinc-800 text-zinc-300 transition-all active:scale-95 disabled:opacity-40"
              >
                <Grid3x3 className="h-5 w-5" />
                <span className="text-[9px] font-medium">Keypad</span>
              </button>

              <button
                onClick={handleToggleRecord}
                disabled={call.state !== 'ACTIVE'}
                className={`flex flex-col items-center gap-1 py-3 rounded-2xl border transition-all active:scale-95 disabled:opacity-40 ${
                  recording
                    ? 'bg-red-600/20 border-red-600/60 text-red-400 animate-pulse'
                    : 'bg-zinc-900/70 border-zinc-800 text-zinc-300'
                }`}
              >
                {recording ? <Square className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                <span className="text-[9px] font-medium">{recording ? 'Stop' : 'Record'}</span>
              </button>
            </div>



            {/* Primary action row */}
            <div className="flex items-center justify-center gap-8">
              {/* Incoming: Decline + Accept */}
              {call.incoming && call.state === 'RINGING' ? (
                <>
                  <button
                    onClick={async () => { await endCall(); setCall(IDLE); }}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.5)] active:scale-95 transition-all"
                    aria-label="Decline"
                  >
                    <PhoneOff className="h-7 w-7" />
                  </button>

                  <button
                    onClick={async () => { await acceptCall(); }}
                    className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.5)] active:scale-95 transition-all"
                    aria-label="Accept"
                  >
                    <Phone className="h-7 w-7" />
                  </button>
                </>
              ) : (
                <button
                  onClick={async () => { await endCall(); setCall(IDLE); }}
                  className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-[0_0_25px_rgba(220,38,38,0.5)] active:scale-95 transition-all"
                  aria-label="End call"
                >
                  <PhoneOff className="h-8 w-8" />
                </button>
              )}
            </div>
          </div>

          {/* Numpad overlay */}
          <AnimatePresence>
            {numpadOpen && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute inset-0 bg-black/10 backdrop-blur-[2px] flex flex-col z-10"
              >
                <div className="flex items-center justify-between px-6 pt-8 pb-2 bg-black/40 backdrop-blur-md rounded-b-2xl">
                  <div className="text-white">
                    <p className="text-xs text-zinc-500 font-mono">
                      {displayName}
                    </p>
                    <p className="text-lg font-bold text-[#00D4FF] font-mono tracking-wider">
                      {statusLabel}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setNumpadOpen(false);
                      setNumpadInput('');
                    }}
                    className="p-2 rounded-full bg-zinc-900 text-zinc-400 hover:text-white active:scale-95"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Numpad display: shows digits the user has typed on this
                    keypad (DTMF). Erase removes the last one. */}
                <div className="mt-6 px-6 flex items-center justify-center gap-3">
                  <div className="flex-1 max-w-[240px] h-12 rounded-xl bg-zinc-900/80 border border-zinc-700/60 flex items-center justify-center backdrop-blur-sm">
                    <span className="text-2xl font-black font-mono text-white tracking-tight">
                      {numpadInput || ' '}
                    </span>
                  </div>
                  <button
                    onClick={handleEraseDigit}
                    disabled={!numpadInput}
                    className="w-12 h-12 rounded-xl bg-zinc-900/80 border border-zinc-700/60 flex items-center justify-center text-zinc-200 active:scale-95 disabled:opacity-40 backdrop-blur-sm"
                    aria-label="Erase"
                  >
                    {/* Erase-backspace glyph */}
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                      <line x1="18" y1="9" x2="12" y2="15" />
                      <line x1="12" y1="9" x2="18" y2="15" />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-y-1 gap-x-1 px-4 py-2 place-items-center max-w-xs mx-auto w-full mt-auto">
                  {[
                    { c: '1', s: '' },
                    { c: '2', s: 'ABC' },
                    { c: '3', s: 'DEF' },
                    { c: '4', s: 'GHI' },
                    { c: '5', s: 'JKL' },
                    { c: '6', s: 'MNO' },
                    { c: '7', s: 'PQRS' },
                    { c: '8', s: 'TUV' },
                    { c: '9', s: 'WXYZ' },
                    { c: '*', s: '' },
                    { c: '0', s: '+' },
                    { c: '#', s: '' },
                  ].map((k) => (
                    <button
                      key={k.c}
                      onPointerDown={() => handleDtmf(k.c)}
                      className="w-16 h-16 rounded-full bg-zinc-900/85 border border-zinc-700/60 hover:bg-zinc-800/90 active:scale-90 transition-all flex flex-col items-center justify-center backdrop-blur-sm"
                    >
                      <span className="text-xl font-black text-white font-mono leading-none">
                        {k.c}
                      </span>
                      {k.s && (
                        <span className="text-[8px] text-zinc-400 tracking-wide mt-0.5 leading-none">
                          {k.s}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="px-6 pt-2 pb-4">
                  <button
                    onClick={() => {
                      setNumpadOpen(false);
                      setNumpadInput('');
                    }}
                    className="w-full py-3 rounded-2xl bg-zinc-900/90 text-zinc-200 font-semibold text-xs active:scale-95 transition-all backdrop-blur-sm"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
