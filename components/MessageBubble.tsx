'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Check, CheckCheck } from 'lucide-react';
import { Message } from '@/lib/db';

interface MessageBubbleProps {
  msg: Message;
  isSelected: boolean;
  contactName: string;
  contactAvatar?: string;
  userName: string;
  userAvatar?: string;
  onRetry: (msg: Message) => void;
  onPressStart: (msg: Message, x?: number, y?: number) => void;
  onPressEnd: () => void;
  onMove: (x: number, y: number) => void;
  onClick: (msg: Message) => void;
}

// Two-letter initials fallback (e.g. "Jazz4G" -> "JA").
function initialsOf(input: string): string {
  const src = (input || '').trim();
  if (!src) return '?';
  const parts = src.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return src.substring(0, Math.min(2, src.length)).toUpperCase();
}

// Formats "02:46 PM · Oct 10" for the header row inside the bubble.
function formatDateTime(ts: number): string {
  try {
    const d = new Date(ts);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString([], { day: '2-digit', month: 'short' });
    return `${time} · ${date}`;
  } catch {
    return '';
  }
}

function Avatar({ src, name, size = 22 }: { src?: string; name: string; size?: number }) {
  const [failed, setFailed] = React.useState(false);
  const showImage = !!src && !failed;
  return (
    <div
      className="rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-zinc-700/60 border border-white/10"
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
          loading="lazy"
        />
      ) : (
        <span
          className="font-bold text-zinc-200 leading-none"
          style={{ fontSize: Math.round(size * 0.42) }}
        >
          {initialsOf(name)}
        </span>
      )}
    </div>
  );
}

function MessageBubbleInner({
  msg,
  isSelected,
  contactName,
  contactAvatar,
  userName,
  userAvatar,
  onRetry,
  onPressStart,
  onPressEnd,
  onMove,
  onClick,
}: MessageBubbleProps) {
  const isUser = msg.sender === 'user';
  const headerName = isUser ? userName : contactName || 'Unknown';
  const headerAvatar = isUser ? userAvatar : contactAvatar;
  const dateTime = formatDateTime(msg.timestamp);

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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`flex select-none cursor-pointer ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`p-2 px-2.5 rounded-2xl relative transition-all duration-200 flex flex-col ${
          isUser
            ? 'max-w-[80%] bg-[#cbfe00] text-zinc-950 rounded-tr-sm'
            : 'max-w-[82%] bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-tl-sm'
        } ${isSelected ? 'ring-2.5 ring-yellow-400 scale-[0.97] shadow-[0_0_15px_rgba(234,179,8,0.5)]' : ''}`}
      >
        {/* Header INSIDE bubble: avatar + name + date/time */}
        <div className="flex items-center gap-1.5 mb-1">
          {isUser ? (
            <>
              <span
                className="text-[9px] font-mono whitespace-nowrap"
                style={{ color: 'rgba(24,24,27,0.55)' }}
              >
                {dateTime}
              </span>
              <div className="flex-1" />
              <span className="text-[10px] font-semibold text-zinc-800 truncate max-w-[120px]">
                {headerName}
              </span>
              <Avatar src={headerAvatar} name={headerName} size={20} />
            </>
          ) : (
            <>
              <Avatar src={headerAvatar} name={headerName} size={20} />
              <span className="text-[10px] font-semibold text-zinc-200 truncate max-w-[120px]">
                {headerName}
              </span>
              <div className="flex-1" />
              <span className="text-[9px] font-mono text-zinc-500 whitespace-nowrap">
                {dateTime}
              </span>
            </>
          )}
        </div>

        {/* Body */}
        {msg.image && (
          <div className="mb-1.5 rounded-lg overflow-hidden border border-black/10">
            <img
              src={msg.image}
              alt="Shared asset"
              className="max-h-40 w-full object-cover"
              loading="lazy"
            />
          </div>
        )}

        {msg.text && (
          <p className="text-sm leading-snug font-sans break-words whitespace-pre-wrap">
            {msg.text}
          </p>
        )}

        {/* Status (outgoing only) */}
        {isUser && (
          <div className="flex justify-end mt-0.5">
            {msg.status === 'sending' ? (
              <div className="relative h-3.5 w-3.5" aria-label="Sending">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="absolute inset-0 animate-spin"
                    style={{
                      animationDuration: '1.1s',
                      animationDelay: `-${((i * 1.1) / 3).toFixed(2)}s`,
                    }}
                  >
                    <span className="absolute left-1/2 top-0 w-[3px] h-[3px] -translate-x-1/2 rounded-full bg-zinc-800" />
                  </span>
                ))}
              </div>
            ) : msg.status === 'failed' ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(msg);
                }}
                className="text-[10px] font-bold text-red-700 underline-offset-2 hover:underline"
              >
                Retry
              </button>
            ) : msg.status === 'read' ? (
              <CheckCheck className="h-3 w-3 text-emerald-700 font-bold opacity-80" />
            ) : (
              <Check className="h-3 w-3 text-zinc-700 opacity-80" />
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

const MessageBubble = React.memo(MessageBubbleInner, (prev, next) => {
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.contactName !== next.contactName) return false;
  if (prev.contactAvatar !== next.contactAvatar) return false;
  if (prev.userName !== next.userName) return false;
  if (prev.userAvatar !== next.userAvatar) return false;
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
