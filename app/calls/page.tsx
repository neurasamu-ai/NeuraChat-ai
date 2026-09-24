'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Video,
  Plus,
  Search,
  X,
  Delete,
  Trash2,
  PhoneOff,
  MessageSquare
} from 'lucide-react';
import {
  getCallLogs,
  saveCallLog,
  deleteCallLog,
  getContacts,
  Contact,
  CallLog
} from '@/lib/db';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { generateId, getCurrentTimestamp, getRandomCallDuration } from '@/lib/utils';
import { useBackHandler } from '@/lib/use-back-handler';
import { dispatchCall, placeCall, setPreferredCallSimId, CallAccount } from '@/lib/telecom-plugin';
import { normalizePhone, phonesMatch } from '@/lib/phone';

export default function CallsPage() {
  const router = useRouter();
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'incoming' | 'outgoing' | 'missed'>('all');

  // Dynamic caller name lookup from contacts database
  const resolveCallerName = (phone: string, fallbackName: string) => {
    const found = contacts.find(c => phonesMatch(c.phone, phone));
    if (found) return found.name;
    return fallbackName !== 'Unknown' ? fallbackName : phone;
  };

  // Dialer dialog states
  const [isDialerOpen, setIsDialerOpen] = useState(false);
  const [dialNumber, setDialNumber] = useState('');
  const [callSimPickerOpen, setCallSimPickerOpen] = useState(false);
  const [callAccounts, setCallAccounts] = useState<CallAccount[]>([]);
  const [pendingCallNumber, setPendingCallNumber] = useState<string>('');
  const [rememberCallSim, setRememberCallSim] = useState(true);

  const longPressTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isLongPressActiveRef = React.useRef(false);
  const backspaceTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const backspaceLongPressRef = React.useRef(false);
  const numberInputRef = React.useRef<HTMLInputElement | null>(null);

  const startPress = (char: string) => {
    isLongPressActiveRef.current = false;
    if (char === '0') {
      longPressTimerRef.current = setTimeout(() => {
        isLongPressActiveRef.current = true;
        triggerVibration();
        setDialNumber(prev => prev + '+');
      }, 600);
    }
  };

  const endPress = (char: string) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Derived resolved contact
  const resolvedContact = React.useMemo(() => {
    if (!dialNumber) return null;
    return contacts.find(c => phonesMatch(c.phone, dialNumber)) || null;
  }, [dialNumber, contacts]);

  // Real-time matched contacts list based on dialed digits subsequence/sequence
  const matchedContacts = React.useMemo(() => {
    if (!dialNumber) return [];
    const query = normalizePhone(dialNumber);
    if (!query) return [];
    const rawDigits = dialNumber.replace(/\D/g, '');
    return contacts.filter(c => {
      const normalized = normalizePhone(c.phone);
      if (!normalized) return false;
      return normalized.includes(query) || normalized.includes(rawDigits);
    });
  }, [dialNumber, contacts]);

  const loadCallsAndContacts = async () => {
    try {
      const logs = await getCallLogs();
      const storedContacts = await getContacts();
      setCallLogs(logs);
      setContacts(storedContacts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      loadCallsAndContacts();
    }, 0);
    return () => clearTimeout(handle);
  }, []);



  const triggerVibration = () => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(30);
    }
  };

  // Numpad key pressure handlers
  const handleNumPress = (char: string) => {
    triggerVibration();
    const input = numberInputRef.current;
    if (input) {
      const start = input.selectionStart ?? dialNumber.length;
      const end = input.selectionEnd ?? dialNumber.length;
      const next = dialNumber.slice(0, start) + char + dialNumber.slice(end);
      setDialNumber(next);
      // Move cursor to just after the inserted char
      requestAnimationFrame(() => {
        const pos = start + char.length;
        try { input.setSelectionRange(pos, pos); } catch {}
      });
    } else {
      setDialNumber(prev => prev + char);
    }
  };

  const handleBackspace = () => {
    triggerVibration();
    const input = numberInputRef.current;
    if (input) {
      const start = input.selectionStart ?? dialNumber.length;
      const end = input.selectionEnd ?? dialNumber.length;
      let next = dialNumber;
      let cursor = start;
      if (start !== end) {
        // remove selection
        next = dialNumber.slice(0, start) + dialNumber.slice(end);
        cursor = start;
      } else if (start > 0) {
        // remove char before cursor
        next = dialNumber.slice(0, start - 1) + dialNumber.slice(end);
        cursor = start - 1;
      } else {
        return;
      }
      setDialNumber(next);
      requestAnimationFrame(() => {
        try { input.setSelectionRange(cursor, cursor); } catch {}
      });
    } else {
      setDialNumber(prev => prev.slice(0, -1));
    }
  };

  // Dial Trigger via window.location.href = tel:NUMBER
  const handleDialCall = async (customNum?: string) => {
    const finalNumber = customNum || dialNumber;
    if (!finalNumber) return;

    triggerVibration();
    
    // Save to IndexedDB Call Log
    const callerName = resolvedContact ? resolvedContact.name : 'Unknown';
    const newLog: CallLog = {
      id: generateId('call'),
      name: callerName,
      phone: finalNumber,
      type: 'outgoing',
      timestamp: getCurrentTimestamp(),
      duration: getRandomCallDuration()
    };

    await saveCallLog(newLog);
    setIsDialerOpen(false);
    setDialNumber('');
    loadCallsAndContacts();

    // Route to native call. With 2+ SIMs, show the SIM picker.
    try {
      const result = await dispatchCall(finalNumber);
      if (result.action === 'pick') {
        setCallAccounts(result.accounts);
        setPendingCallNumber(finalNumber);
        setCallSimPickerOpen(true);
      } else if (!result.success) {
        console.error('Call failed:', result.error);
      }
    } catch (err) {
      console.error('Call routing failed:', err);
    }
  };

  const handlePickCallSim = async (accountId: string) => {
    triggerVibration();
    if (rememberCallSim) setPreferredCallSimId(accountId);
    const number = pendingCallNumber;
    setCallSimPickerOpen(false);
    setPendingCallNumber('');
    if (number) {
      const res = await placeCall(number, accountId);
      if (!res.success) {
        console.error('Call failed:', res.error);
      }
    }
  };

  const handleDeleteLog = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerVibration();
    await deleteCallLog(id);
    loadCallsAndContacts();
  };

  // Safe duration formatter
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCallIcon = (type: CallLog['type']) => {
    switch (type) {
      case 'incoming':
        return <PhoneIncoming className="h-4 w-4 text-emerald-400 font-bold" />;
      case 'outgoing':
        return <PhoneOutgoing className="h-4 w-4 text-[#00D4FF]" />;
      case 'missed':
        return <PhoneMissed className="h-4 w-4 text-[#FF006E]" />;
    }
  };

  // ---- Back-button integration ----
  useBackHandler(isDialerOpen, () => setIsDialerOpen(false));
  useBackHandler(callSimPickerOpen, () => setCallSimPickerOpen(false));

  const filteredLogs = callLogs.filter(log => {
    if (activeFilter === 'all') return true;
    return log.type === activeFilter;
  });

  return (
    <>
      <Header title="Calls" />

      {/* Main Container */}
      <main className="flex-1 p-4 overflow-y-auto" id="calls-main-container">
        
        {/* Filter Tab Row */}
        <div className="flex bg-zinc-900 border border-zinc-900 rounded-xl p-1 mb-4 select-none" id="calls-filter-tabs">
          {(['all', 'incoming', 'outgoing', 'missed'] as const).map(filter => (
            <button
              key={filter}
              onClick={() => {
                triggerVibration();
                setActiveFilter(filter);
              }}
              className={`flex-1 font-display text-[11px] font-semibold tracking-wider uppercase py-2 rounded-lg transition-all cursor-pointer ${
                activeFilter === filter
                  ? 'bg-zinc-800 text-white shadow'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3" id="calls-skeleton">
            {[1, 2].map((n) => (
              <div key={n} className="flex gap-4 p-3 bg-zinc-950 border border-zinc-900 rounded-xl animate-pulse">
                <div className="w-10 h-10 bg-zinc-850 rounded-full" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 bg-zinc-850 rounded w-1/4" />
                  <div className="h-3 bg-zinc-850 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-20 text-center select-none" id="calls-empty-state">
            <div className="w-16 h-16 bg-gradient-to-tr from-[#FF006E]/10 to-[#00D4FF]/10 rounded-full border border-zinc-805 flex items-center justify-center mb-4">
              <PhoneOff className="h-8 w-8 text-zinc-600" />
            </div>
            <p className="text-zinc-400 font-semibold text-sm font-display mb-1">
              No calling history
            </p>
            <p className="text-zinc-600 text-xs px-10 leading-normal">
              Tap the (+) dialer key below to route your first network cellular pulse call.
            </p>
          </div>
        ) : (
          /* Call Logs Feed List */
          <div className="space-y-2.5" id="calls-list">
            <AnimatePresence>
              {filteredLogs.map((log) => {
                const displayName = resolveCallerName(log.phone, log.name);
                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-900 hover:border-zinc-805 transition-all select-none"
                  >
                    <div className="flex items-center gap-3">
                      {/* Circle Avatar with initials fallback */}
                      <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 font-bold text-xs uppercase shadow-inner">
                        {displayName.slice(0, 2)}
                      </div>

                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-white font-sans truncate pr-2">
                          {displayName}
                        </h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {getCallIcon(log.type)}
                        <span className="text-[10px] text-zinc-500 font-mono truncate">
                          {formatTime(log.timestamp)} • {formatDuration(log.duration)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Native callback Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDialCall(log.phone)}
                      className="p-2 bg-zinc-900 hover:bg-zinc-850 hover:text-[#00D4FF] text-zinc-400 rounded-lg transition-all cursor-pointer active:scale-90"
                      title="Audio Call"
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDialCall(log.phone)}
                      className="p-2 bg-zinc-900 hover:bg-zinc-850 hover:text-[#FF006E] text-zinc-400 rounded-lg transition-all cursor-pointer active:scale-90"
                      title="Video Call"
                    >
                      <Video className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteLog(log.id, e)}
                      className="p-2 bg-zinc-900 hover:bg-zinc-850 hover:text-red-400 text-zinc-500 rounded-lg transition-all cursor-pointer"
                      title="Remove Log"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* DIALER DIALOG OPEN FAB */}
        

        {/* DIALER FULL OVERLAY SHEET */}
        <AnimatePresence>
          {isDialerOpen && (
            <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-end justify-center select-none">
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="w-full max-w-md bg-zinc-950 border-t border-zinc-900 rounded-t-3xl p-6 pb-8 flex flex-col items-center"
                id="dialer-sheet-container"
              >
                {/* Close Button top right */}
                <button
                  onClick={() => setIsDialerOpen(false)}
                  className="absolute top-4 right-4 p-1.5 rounded-full bg-zinc-905 text-zinc-500 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>

                {/* Match List Area (Red Circle space) */}
                <div className="w-full max-w-[280px] min-h-[4rem] mb-4 flex flex-col items-center justify-center">
                  {dialNumber ? (
                    matchedContacts.length > 0 ? (
                      <div className="w-full max-h-24 overflow-y-auto space-y-1.5 no-scrollbar bg-zinc-900/40 p-1 rounded-xl border border-zinc-800/40 transition-all">
                        {matchedContacts.map(contact => (
                          <div
                            key={contact.id}
                            onClick={() => {
                              triggerVibration();
                              setDialNumber(contact.phone);
                            }}
                            className="flex items-center justify-between p-2 rounded-lg bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 cursor-pointer active:scale-[0.99] transition-all"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6.5 h-6.5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[#00D4FF] font-bold text-[10px] uppercase">
                                {contact.name.slice(0, 2)}
                              </div>
                              <div className="text-left min-w-0">
                                <p className="text-[11px] font-bold text-white truncate leading-tight">{contact.name}</p>
                                <p className="text-[9px] font-mono text-zinc-400 truncate leading-tight">{contact.phone}</p>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDialCall(contact.phone);
                              }}
                              className="p-1 px-2.5 rounded bg-[#10b981]/20 hover:bg-[#10b981]/30 text-[#10b981] text-[9px] font-bold tracking-wide active:scale-95 transition-all"
                            >
                              Call
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={() => {
                          triggerVibration();
                          router.push(`/contacts?add=true&phone=${encodeURIComponent(dialNumber)}`);
                        }}
                        className="text-xs font-semibold text-[#00D4FF] bg-[#00D4FF]/10 border border-[#00D4FF]/20 px-3.5 py-2 rounded-full flex items-center gap-1.5 hover:bg-[#00D4FF]/20 active:scale-95 transition-all cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Create New Contact
                      </motion.button>
                    )
                  ) : (
                    <span className="text-[10px] text-zinc-600 font-mono italic">Enter digits to search database...</span>
                  )}
                </div>

                {/* Dialer Header: Number Display Area */}
                <div className="w-full text-center mb-3 mt-2 relative px-8 flex flex-col items-center justify-center min-h-[3rem]">
                  <div className="flex items-center justify-center w-full relative min-h-[2.5rem] px-10">
                    <input
                      ref={numberInputRef}
                      type="text"
                      inputMode="none"
                      value={dialNumber}
                      onChange={(e) => {
                        // Allow only digits, plus, star, hash; keep cursor at end on manual change
                        const cleaned = e.target.value.replace(/[^\d+*#]/g, '');
                        setDialNumber(cleaned);
                      }}
                      placeholder=" "
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full bg-transparent text-2xl font-bold font-mono text-white tracking-widest text-center outline-none caret-[#00D4FF] px-10"
                    />

                    {dialNumber && (
                      <button
                        onClick={() => {
                          // If long press already cleared, skip single delete
                          if (backspaceLongPressRef.current) {
                            backspaceLongPressRef.current = false;
                            return;
                          }
                          handleBackspace();
                        }}
                        onPointerDown={() => {
                          backspaceLongPressRef.current = false;
                          if (backspaceTimerRef.current) clearTimeout(backspaceTimerRef.current);
                          backspaceTimerRef.current = setTimeout(() => {
                            backspaceLongPressRef.current = true;
                            triggerVibration();
                            setDialNumber('');
                          }, 600);
                        }}
                        onPointerUp={() => {
                          if (backspaceTimerRef.current) {
                            clearTimeout(backspaceTimerRef.current);
                            backspaceTimerRef.current = null;
                          }
                        }}
                        onPointerLeave={() => {
                          if (backspaceTimerRef.current) {
                            clearTimeout(backspaceTimerRef.current);
                            backspaceTimerRef.current = null;
                          }
                        }}
                        className="absolute right-2 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer active:scale-90"
                        title="Backspace (long press to clear)"
                      >
                        <Delete className="h-7 w-7" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Numpad Keypad grid */}
                <div className="grid grid-cols-3 gap-y-4 gap-x-6 w-full max-w-[280px] mb-6">
                  {[
                    { char: '1', sub: ' ' }, { char: '2', sub: 'ABC' }, { char: '3', sub: 'DEF' },
                    { char: '4', sub: 'GHI' }, { char: '5', sub: 'JKL' }, { char: '6', sub: 'MNO' },
                    { char: '7', sub: 'PQRS' }, { char: '8', sub: 'TUV' }, { char: '9', sub: 'WXYZ' },
                    { char: '*', sub: ' ' }, { char: '0', sub: '+' }, { char: '#', sub: ' ' }
                  ].map((keyItem) => (
                    <button
                      key={keyItem.char}
                      onPointerDown={() => startPress(keyItem.char)}
                      onPointerUp={() => endPress(keyItem.char)}
                      onPointerLeave={() => endPress(keyItem.char)}
                      onPointerCancel={() => endPress(keyItem.char)}
                      onClick={() => {
                        if (keyItem.char === '0' && isLongPressActiveRef.current) {
                          return;
                        }
                        handleNumPress(keyItem.char);
                      }}
                      className="flex flex-col items-center justify-center w-16 h-16 rounded-full bg-zinc-900 border border-zinc-805 hover:bg-zinc-850 active:scale-90 transition-all cursor-pointer relative select-none touch-none"
                    >
                      <span className="text-lg font-bold font-mono text-white leading-none">{keyItem.char}</span>
                      {keyItem.sub.trim() && (
                        <span className="text-[8px] text-zinc-500 font-sans tracking-wide mt-0.5 uppercase leading-none">{keyItem.sub}</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Actions Row: SMS and Call */}
                <div className="flex items-center gap-6 justify-center w-full">
                  {/* SMS Button (Only active when number is entered) */}
                  <button
                    type="button"
                    disabled={!dialNumber}
                    onClick={() => {
                      triggerVibration();
                      const num = dialNumber.replace(/\s+/g, '');
                      if (!num) return;
                      setIsDialerOpen(false);
                      setDialNumber('');
                      router.push(`/chat-detail?phone=${encodeURIComponent(num)}&name=${encodeURIComponent(num)}`);
                    }}
                    className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-[#00D4FF] disabled:opacity-40 flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                    title="Send SMS"
                  >
                    <MessageSquare className="h-5 w-5" />
                  </button>

                  {/* Green Call Trigger Button */}
                  <button
                    type="button"
                    onClick={() => handleDialCall()}
                    disabled={!dialNumber}
                    className="w-16 h-16 rounded-full bg-[#10b981] hover:bg-[#059669] text-black shadow-[0_0_15px_rgba(16,185,129,0.4)] disabled:opacity-40 flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                    title="Call Phone intent"
                  >
                    <Phone className="h-6 w-6 stroke-[2.5]" />
                  </button>
                </div>

              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>

      {/* CALL SIM PICKER MODAL */}
      <AnimatePresence>
        {callSimPickerOpen && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative"
            >
              <button
                onClick={() => {
                  setCallSimPickerOpen(false);
                  setPendingCallNumber('');
                }}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>

              <h3 className="text-base font-bold font-display text-white mb-1">
                Call with
              </h3>
              <p className="text-xs text-zinc-500 mb-4">
                Choose which SIM to place this call from.
              </p>

              <div className="space-y-2">
                {callAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => handlePickCallSim(acc.id)}
                    className="w-full bg-zinc-900 border border-zinc-800 hover:border-[#10b981]/40 hover:bg-zinc-850 rounded-xl p-3 flex items-center justify-between transition-all cursor-pointer active:scale-[0.98]"
                  >
                    <div className="text-left">
                      <p className="text-xs font-semibold text-white">{acc.label}</p>
                      {acc.accountId && (
                        <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                          {acc.accountId}
                        </p>
                      )}
                    </div>
                    <Phone className="h-4 w-4 text-[#10b981]" />
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 mt-4 text-[11px] text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberCallSim}
                  onChange={(e) => setRememberCallSim(e.target.checked)}
                  className="accent-[#10b981]"
                />
                Remember my choice
              </label>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <button
          onClick={() => {
            triggerVibration();
            setIsDialerOpen(true);
          }}
          className="absolute bottom-24 right-5 w-14 h-14 bg-gradient-to-tr from-[#FF006E] to-[#b3004d] text-white rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(255,0,110,0.4)] hover:shadow-[0_0_20px_rgba(255,0,110,0.6)] cursor-pointer hover:scale-105 active:scale-95 transition-all z-40"
          aria-label="Open Dialer"
          id="open-dialer-fab"
        >
          <PhoneCall className="h-5 w-5" />
        </button>

      <BottomNav currentTab="calls" />
    </>
  );
}
