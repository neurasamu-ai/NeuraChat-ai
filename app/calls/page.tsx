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
  PhoneOff
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
import { generateId, getCurrentTimestamp, getRandomCallDuration, triggerDial } from '@/lib/utils';

export default function CallsPage() {
  const router = useRouter();
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'incoming' | 'outgoing' | 'missed'>('all');

  // Dialer dialog states
  const [isDialerOpen, setIsDialerOpen] = useState(false);
  const [dialNumber, setDialNumber] = useState('');

  const longPressTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isLongPressActiveRef = React.useRef(false);

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
    return contacts.find(c =>
      c.phone.replace(/\D/g, '').endsWith(dialNumber.replace(/\D/g, '')) ||
      dialNumber.replace(/\D/g, '').endsWith(c.phone.replace(/\D/g, ''))
    ) || null;
  }, [dialNumber, contacts]);

  // Real-time matched contacts list based on dialed digits subsequence/sequence
  const matchedContacts = React.useMemo(() => {
    if (!dialNumber) return [];
    const query = dialNumber.replace(/\D/g, '');
    if (!query) return [];
    return contacts.filter(c => {
      const normalizedPhone = c.phone.replace(/\D/g, '');
      return normalizedPhone.includes(query);
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
    setDialNumber(prev => prev + char);
  };

  const handleBackspace = () => {
    triggerVibration();
    setDialNumber(prev => prev.slice(0, -1));
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

    // Route to native dial call
    try {
      triggerDial(finalNumber);
    } catch (err) {
      console.error('Call routing failed:', err);
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
              {filteredLogs.map((log) => (
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
                      {log.name.slice(0, 2)}
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-white font-sans truncate pr-2">
                        {log.name}
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
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* DIALER DIALOG OPEN FAB */}
        <button
          onClick={() => {
            triggerVibration();
            setIsDialerOpen(true);
          }}
          className="fixed bottom-24 right-5 w-14 h-14 bg-gradient-to-tr from-[#FF006E] to-[#b3004d] text-white rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(255,0,110,0.4)] hover:shadow-[0_0_20px_rgba(255,0,110,0.6)] cursor-pointer hover:scale-105 active:scale-95 transition-all z-40"
          aria-label="Open Dialer"
          id="open-dialer-fab"
        >
          <PhoneCall className="h-5 w-5" />
        </button>

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

                {/* Dialer Header: Number Display Area */}
                <div className="w-full text-center mb-3 mt-2 relative px-8 flex flex-col items-center justify-center min-h-[3rem]">
                  <div className="flex items-center justify-center w-full relative min-h-[2.5rem] px-10">
                    <span className="text-2xl font-bold font-mono text-white tracking-widest break-all select-all">
                      {dialNumber || ' '}
                    </span>

                    {dialNumber && (
                      <button
                        onClick={handleBackspace}
                        className="absolute right-2 p-1 rounded text-zinc-500 hover:text-white transition-colors cursor-pointer active:scale-90"
                        title="Backspace"
                      >
                        <Delete className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>

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

              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>

      <BottomNav currentTab="calls" />
    </>
  );
}
