'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Check, CheckCheck } from 'lucide-react';
import { Message } from '@/lib/db';

interface MessageBubbleProps {
  msg: Message;
  isSelected: boolean;
  onRetry: (msg: Message) => void;
  onPressStart: (msg: Message, x?: number, y?: number) => void;
  onPressEnd: () => void;
  onMove: (x: number, y: number) => void;
  onClick: (msg: Message) => void;
}

function MessageBubbleInner({
  msg,
  isSelected,
  onRetry,
  onPressStart,
  onPressEnd,
  onMove,
  onClick,
}: MessageBubbleProps) {
  const isUser = msg.sender === 'user';

  return (
    <motion.div
      onPointerDown={(e) => onPressStart(msg, e.clientX, e.clientY)}
      onPointerUp={onPressEnd}
      onPointerCancel={onPressEnd}
      onTouchStart={(e) => {
        const t = e.touches[0];
        onPressStart(msg, t?.clientX, t?.clientY);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        if (t) onMove(t.clientX, t.clientY);
      }}
      onTouchEnd={onPressEnd}
      onClick={() => onClick(msg)}
      initial={{ opacity: 0, x: isUser ? 25 : -25, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} select-none cursor-pointer`}
    >
      <div
        className={`p-2.5 px-3 rounded-xl relative transition-all duration-200 flex flex-col justify-between ${
          isUser
            ? 'max-w-[44%] bg-[#cbfe00] text-zinc-950 rounded-tr-none'
            : 'max-w-[70%] bg-zinc-900 border border-zinc-805 text-zinc-100 rounded-tl-none'
        } ${isSelected ? 'ring-2.5 ring-yellow-400 scale-[0.97] shadow-[0_0_15px_rgba(234,179,8,0.5)]' : ''}`}
      >
        <div className="flex justify-end items-center mb-1 select-none opacity-60 text-[9px] font-mono leading-none">
          <span className={isUser ? 'text-zinc-800 font-semibold' : 'text-zinc-400'}>
            {new Date(msg.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        {msg.image && (
          <div className="mb-2 rounded-lg overflow-hidden border border-black/10">
            <img
              src={msg.image}
              alt="Shared asset"
              className="max-h-40 w-full object-cover"
              loading="lazy"
            />
          </div>
        )}

        {msg.text && (
          <p className="text-xs leading-relaxed font-sans break-words whitespace-pre-wrap font-medium">
            {msg.text}
          </p>
        )}

        {isUser && (
          <div className="flex justify-end mt-0.5">
            {msg.status === 'failed' ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(msg);
                }}
                className="text-[10px] font-bold text-red-600 underline-offset-2 hover:underline"
              >
                Retry
              </button>
            ) : msg.status === 'read' ? (
              <CheckCheck className="h-3 w-3 text-emerald-700 font-bold opacity-80" />
            ) : (
              <Check className="h-3 w-3 text-zinc-650 opacity-80" />
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Custom comparator: only re-render when the message content or its
// selection status actually changes. Function props are intentionally
// ignored because they are recreated on every parent render.
const MessageBubble = React.memo(MessageBubbleInner, (prev, next) => {
  if (prev.isSelected !== next.isSelected) return false;
  const a = prev.msg;
  const b = next.msg;
  if (a.id !== b.id) return false;
  if (a.status !== b.status) return false;
  if (a.text !== b.text) return false;
  if (a.image !== b.image) return false;
  if (a.timestamp !== b.timestamp) return false;
  return true;
});

export default MessageBubble;
