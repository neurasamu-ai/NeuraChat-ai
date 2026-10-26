'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MoreVertical, Trash2, User, X } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  isChatDetail?: boolean;
  backHref?: string;
  rightAction?: React.ReactNode;
  onBack?: () => void;
  onTitleClick?: () => void;
  avatar?: string;
}

export default function Header({
  title,
  subtitle,
  isChatDetail = false,
  backHref,
  rightAction,
  onBack,
  onTitleClick,
  avatar,
}: HeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  if (isChatDetail) {
    return (
      <header
        className="sticky top-2 left-2 right-2 mx-auto max-w-md h-16 bg-gradient-to-r from-[#cbfe00] via-[#e6ff00] to-[#b3ed00] text-zinc-900 flex items-center px-2 justify-between z-40 select-none shadow-xl rounded-3xl border border-white/20 backdrop-blur-md"
        id="app-header-chat"
      >
        <div className="flex items-center gap-2">
          <button
            onClick={handleBack}
            className="p-1.5 rounded-full hover:bg-black/10 active:scale-90 transition-all cursor-pointer text-zinc-900"
            aria-label="Back"
            id="header-back-button"
          >
            <ArrowLeft className="h-5 w-5 stroke-[3]" />
          </button>

          {/* Profile Photo */}
          {avatar ? (
            <img src={avatar} alt={title} className="w-9 h-9 rounded-full object-cover border-2 border-zinc-900/10 shadow-sm" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-zinc-900/10 flex items-center justify-center text-zinc-800 font-bold text-sm shadow-sm">
              {title.charAt(0).toUpperCase()}
            </div>
          )}

          <div
            className={`flex flex-col ${onTitleClick ? 'cursor-pointer active:opacity-70' : ''}`}
            onClick={onTitleClick}
          >
            <h1 className="font-bold text-[15px] tracking-tight font-display text-zinc-900 leading-tight">
              {title}
            </h1>
            {subtitle ? (
              <span className="text-[10px] text-zinc-700 font-semibold font-sans">
                {subtitle}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {rightAction ? rightAction : <div className="w-5" />}
        </div>
      </header>
    );
  }

  // DEFAULT HEADER FOR STANDARD PAGES
  // On root tabs (no back navigation), show the live NeuraChat brand.
  const isRootTab = !backHref && !onBack;

  return (
    <header
      className="sticky top-0 left-0 right-0 h-16 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-900 text-white flex items-center px-4 justify-between z-40 select-none"
      id="app-header-default"
    >
      <div className="w-10 flex justify-start">
        {!isRootTab ? (
          <button
            onClick={handleBack}
            className="p-2 -ml-2 rounded-full hover:bg-zinc-900 active:scale-90 transition-all cursor-pointer"
            aria-label="Back"
            id="header-back-button-standard"
          >
            <ArrowLeft className="h-5 w-5 text-zinc-400" />
          </button>
        ) : null}
      </div>

      <div className="flex-1 flex justify-center text-center">
        {isRootTab ? (
          <span className="neura-brand text-2xl" aria-label="NeuraChat">
            <span className="neura-blue">Neura</span>
            <span className="neura-pink">Chat</span>
          </span>
        ) : (
          <h1 className="font-bold text-lg tracking-tight font-display text-white drop-shadow-[0_0_8px_rgba(0,212,255,0.4)]">
            {title}
          </h1>
        )}
      </div>

      <div className="w-10 flex justify-end">
        {rightAction ? (
          rightAction
        ) : (
          <div className="w-5" /> // spacer
        )}
      </div>
    </header>
  );
}
