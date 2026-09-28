'use client';

import { motion, AnimatePresence } from 'motion/react';
import { Phone, X } from 'lucide-react';
import { CallAccount } from '@/lib/telecom-plugin';

interface CallSimPickerProps {
  isOpen: boolean;
  accounts: CallAccount[];
  remember: boolean;
  onRememberChange: (v: boolean) => void;
  onPick: (accountId: string) => void;
  onCancel: () => void;
}

// Modal shown when more than one SIM is available and the user has not
// remembered a preference. Used by Profile and Contacts, matching the
// behaviour of chat-detail and the Calls dialer.
export default function CallSimPicker({
  isOpen,
  accounts,
  remember,
  onRememberChange,
  onPick,
  onCancel,
}: CallSimPickerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative"
          >
            <button
              onClick={onCancel}
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
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => onPick(acc.id)}
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
                checked={remember}
                onChange={(e) => onRememberChange(e.target.checked)}
                className="accent-[#10b981]"
              />
              Remember my choice
            </label>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
