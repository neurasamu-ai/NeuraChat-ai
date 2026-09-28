'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Pause, Play, User, Grid3x3, Circle, Square, X } from 'lucide-react';
import { sendSms, isSmsPluginAvailable } from '@/lib/sms-plugin';
import { useCallTheme } from '@/lib/use-call-theme';
import { snoozeCallNative } from '@/lib/telecom-plugin';
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
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingPath, setRecordingPath] = useState<string>('');
  const theme = useCallTheme();
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
  const SNOOZE_OPTIONS = [5, 10, 15, 20, 25, 30];

  const handleSnooze = async (minutes: number) => {
    setSnoozeOpen(false);
    const target = call.number || '';

    // Register the snooze window first so any further call from this
    // number is auto-rejected by CallService until it expires.
    if (target) {
      try {
        await snoozeCallNative(target, minutes);
        console.log(`snoozed ${target} for ${minutes} min`);
      } catch (e) {
        console.error('snoozeCallNative failed', e);
      }
    }

    // Reject the current incoming call.
    try {
      await endCall();
    } catch (e) {
      console.error('snooze endCall failed', e);
    }

    // Send the auto-reply SMS.
    try {
      if (target && isSmsPluginAvailable()) {
        const message = `I'm busy right now. Please call back in ${minutes} minutes.`;
        await sendSms(target, message);
        console.log('snooze SMS sent to', target);
      }
    } catch (e) {
      console.error('snooze SMS failed', e);
    }
  };

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
          className="fixed inset-0 z-[100] flex flex-col justify-between overflow-hidden"
          style={{ background: theme.bg }}
        >
          {/* Glow background (theme-driven, slow blink) */}
          <div
            className="absolute -top-32 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full blur-3xl pointer-events-none call-theme-blink"
            style={{ background: theme.glowTop }}
          />
          <div
            className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full blur-3xl pointer-events-none call-theme-blink"
            style={{ background: theme.glowBottom, animationDelay: '1.75s' }}
          />

          {/* Top bar */}
          <div className="relative pt-10 pb-4 flex flex-col items-center text-center px-6">
            <p
              className="text-[10px] uppercase tracking-[0.25em] font-mono mb-6"
              style={{ color: theme.labelColor }}
            >
              {call.state === 'ACTIVE' ? 'In call' : 'NeuraChat Call'}
            </p>

            {/* Avatar with slow-blink halo */}
            <div className="relative mb-5">
              <div
                className="absolute -inset-2 rounded-full blur-xl call-theme-blink"
                style={{ background: theme.haloColor }}
              />
              <div
                className="relative w-24 h-24 rounded-full flex items-center justify-center font-bold text-3xl overflow-hidden"
                style={{
                  background: theme.avatarBg,
                  border: `2px solid ${theme.avatarBorder}`,
                  color: theme.avatarText,
                  boxShadow: `0 0 24px ${theme.avatarShadow}`,
                }}
              >
                {initial || <User className="h-8 w-8" />}
              </div>
            </div>

            <h2
              className="text-2xl font-bold font-display tracking-tight truncate max-w-full"
              style={{ color: theme.nameColor }}
            >
              {displayName}
            </h2>
            {call.name && call.number && call.name !== call.number && (
              <p className="text-xs font-mono mt-1" style={{ color: theme.numberColor }}>{call.number}</p>
            )}

            <p
              className="mt-3 text-sm font-semibold call-theme-blink"
              style={{
                color: theme.statusColor,
                textShadow: `0 0 10px ${theme.statusGlow}`,
              }}
            >
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
                      className="mb-2 rounded-2xl border backdrop-blur-md p-3 flex items-center justify-between gap-3"
                      style={{
                        borderColor: theme.ctrlBorder,
                        background: theme.ctrlBg,
                      }}
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
                            className="px-3 h-9 rounded-full text-xs font-bold active:scale-95"
                            style={{
                              background: theme.ctrlActiveBorder,
                              color: '#000',
                            }}
                          >
                            Swap
                          </button>
                        )}
                        {isActive && !c.active && (
                          <button
                            onClick={async () => {
                              await swapToCall(c.id);
                            }}
                            className="px-3 h-9 rounded-full text-xs font-bold active:scale-95"
                            style={{
                              background: theme.ctrlActiveBorder,
                              color: '#000',
                            }}
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
                className="flex flex-col items-center gap-1 py-3 rounded-2xl border transition-all active:scale-95"
                style={{
                  background: call.muted ? theme.ctrlActiveBg : theme.ctrlBg,
                  borderColor: call.muted ? theme.ctrlActiveBorder : theme.ctrlBorder,
                  color: call.muted ? theme.ctrlActiveBorder : theme.ctrlText,
                }}
              >
                {call.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                <span className="text-[9px] font-medium">Mute</span>
              </button>

              <button
                onClick={() => { toggleSpeaker(!call.speakerOn); setCall({ ...call, speakerOn: !call.speakerOn }); }}
                className="flex flex-col items-center gap-1 py-3 rounded-2xl border transition-all active:scale-95"
                style={{
                  background: call.speakerOn ? theme.ctrlActiveBg : theme.ctrlBg,
                  borderColor: call.speakerOn ? theme.ctrlActiveBorder : theme.ctrlBorder,
                  color: call.speakerOn ? theme.ctrlActiveBorder : theme.ctrlText,
                }}
              >
                {call.speakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                <span className="text-[9px] font-medium">Speaker</span>
              </button>

              <button
                onClick={() => { toggleHold(!call.held); setCall({ ...call, held: !call.held }); }}
                disabled={call.state !== 'ACTIVE' && call.state !== 'HOLDING'}
                className="flex flex-col items-center gap-1 py-3 rounded-2xl border transition-all active:scale-95 disabled:opacity-40"
                style={{
                  background: call.held ? theme.ctrlActiveBg : theme.ctrlBg,
                  borderColor: call.held ? theme.ctrlActiveBorder : theme.ctrlBorder,
                  color: call.held ? theme.ctrlActiveBorder : theme.ctrlText,
                }}
              >
                {call.held ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                <span className="text-[9px] font-medium">{call.held ? 'Resume' : 'Hold'}</span>
              </button>

              <button
                onClick={() => setNumpadOpen(true)}
                disabled={call.state !== 'ACTIVE'}
                className="flex flex-col items-center gap-1 py-3 rounded-2xl border transition-all active:scale-95 disabled:opacity-40"
                style={{
                  background: theme.ctrlBg,
                  borderColor: theme.ctrlBorder,
                  color: theme.ctrlText,
                }}
              >
                <Grid3x3 className="h-5 w-5" />
                <span className="text-[9px] font-medium">Keypad</span>
              </button>

              <button
                onClick={handleToggleRecord}
                disabled={call.state !== 'ACTIVE'}
                className="flex flex-col items-center gap-1 py-3 rounded-2xl border transition-all active:scale-95 disabled:opacity-40"
                style={
                  recording
                    ? {
                        background: 'rgba(220,38,38,0.2)',
                        borderColor: 'rgba(220,38,38,0.6)',
                        color: '#f87171',
                      }
                    : {
                        background: theme.ctrlBg,
                        borderColor: theme.ctrlBorder,
                        color: theme.ctrlText,
                      }
                }
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
                    className="w-16 h-16 rounded-full text-white flex items-center justify-center active:scale-95 transition-all"
                    style={{
                      background: theme.endBg,
                      boxShadow: `0 0 20px ${theme.endShadow}`,
                    }}
                    aria-label="Decline"
                  >
                    <PhoneOff className="h-7 w-7" />
                  </button>

                  <button
                    onClick={() => setSnoozeOpen(true)}
                    className="w-16 h-16 rounded-full flex items-center justify-center active:scale-95 transition-all flex-col"
                    style={{
                      background: theme.snoozeBg,
                      color: theme.snoozeText,
                      boxShadow: `0 0 15px rgba(255,255,255,0.15)`,
                    }}
                    aria-label="Snooze"
                  >
                    <Pause className="h-5 w-5" />
                    <span className="text-[8px] font-bold mt-0.5">SNOOZE</span>
                  </button>

                  <button
                    onClick={async () => { await acceptCall(); }}
                    className="w-16 h-16 rounded-full flex items-center justify-center active:scale-95 transition-all"
                    style={{
                      background: theme.acceptBg,
                      color: theme.acceptBg === '#d4af37' ? '#000' : '#000',
                      boxShadow: `0 0 20px ${theme.acceptShadow}`,
                    }}
                    aria-label="Accept"
                  >
                    <Phone className="h-7 w-7" />
                  </button>
                </>
              ) : (
                <button
                  onClick={async () => { await endCall(); setCall(IDLE); }}
                  className="w-20 h-20 rounded-full text-white flex items-center justify-center active:scale-95 transition-all"
                  style={{
                    background: theme.endBg,
                    boxShadow: `0 0 25px ${theme.endShadow}`,
                  }}
                  aria-label="End call"
                >
                  <PhoneOff className="h-8 w-8" />
                </button>
              )}
            </div>
          </div>

          {/* SNOOZE PICKER MODAL */}
          <AnimatePresence>
            {snoozeOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/85 backdrop-blur-md flex items-end z-20"
              >
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 26, stiffness: 240 }}
                  className="w-full max-w-md mx-auto border-t rounded-t-3xl p-5 pb-8"
                  style={{
                    background: theme.avatarBg,
                    borderColor: theme.ctrlBorder,
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-base font-bold text-white">Snooze call</h3>
                      <p className="text-[11px] text-zinc-500">
                        Reject and send a "call back in X min" SMS
                      </p>
                    </div>
                    <button
                      onClick={() => setSnoozeOpen(false)}
                      className="p-1.5 rounded-full bg-zinc-900 text-zinc-400 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {SNOOZE_OPTIONS.map((m) => (
                      <button
                        key={m}
                        onClick={() => handleSnooze(m)}
                        className="py-3 rounded-xl border font-bold text-sm active:scale-95 transition-all"
                        style={{
                          background: theme.ctrlBg,
                          borderColor: theme.ctrlBorder,
                          color: theme.ctrlText,
                        }}
                      >
                        {m} min
                      </button>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Numpad overlay */}
          <AnimatePresence>
            {numpadOpen && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute inset-0 bg-black/10 backdrop-blur-[2px] flex flex-col z-10"
              >
                <div className="flex items-center justify-between px-6 pt-8 pb-2 backdrop-blur-md rounded-b-2xl"
                  style={{ background: 'rgba(0,0,0,0.4)' }}>
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
                      className="w-16 h-16 rounded-full border active:scale-90 transition-all flex flex-col items-center justify-center backdrop-blur-sm"
                      style={{
                        background: theme.ctrlBg,
                        borderColor: theme.ctrlBorder,
                      }}
                    >
                      <span className="text-xl font-black font-mono leading-none"
                        style={{ color: theme.ctrlText }}>
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
