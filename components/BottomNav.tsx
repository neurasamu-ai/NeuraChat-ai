'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare, Phone, Users, Settings as SettingsIcon } from 'lucide-react';
import { motion } from 'motion/react';

interface BottomNavProps {
  currentTab?: 'chats' | 'calls' | 'contacts' | 'settings';
}

export default function BottomNav({ currentTab }: BottomNavProps) {
  const pathname = usePathname();

  // Determine active tab based on prop or pathname
  const activeTab = currentTab || (
    pathname.startsWith('/chats') ? 'chats' :
    pathname.startsWith('/calls') ? 'calls' :
    pathname.startsWith('/contacts') ? 'contacts' :
    pathname.startsWith('/settings') ? 'settings' : 'chats'
  );

  const tabs = [
    { id: 'chats' as const, label: 'Chats', href: '/chats', icon: MessageSquare, accent: '#00D4FF' },
    { id: 'calls' as const, label: 'Calls', href: '/calls', icon: Phone, accent: '#FF006E' },
    { id: 'contacts' as const, label: 'Contacts', href: '/contacts', icon: Users, accent: '#00D4FF' },
    { id: 'settings' as const, label: 'Settings', href: '/settings', icon: SettingsIcon, accent: '#FF006E' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto h-20 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-900 flex justify-around items-center px-4 z-40 select-none pb-safe">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <Link
            key={tab.id}
            href={tab.href}
            className="flex flex-col items-center justify-center flex-1 py-2 relative transition-all duration-200 tap-active"
            id={`nav-tab-${tab.id}`}
          >
            {/* Visual Indicator Glow */}
            {isActive && (
              <motion.div
                layoutId="activeTabIndicator"
                className="absolute inset-0 rounded-xl bg-zinc-900/60 -z-10"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}

            <div className="relative">
              <Icon
                className={`h-5 w-5 transition-all duration-300 ${
                  isActive
                    ? tab.id === 'calls' || tab.id === 'settings'
                      ? 'text-[#FF006E]'
                      : 'text-[#00D4FF]'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                style={{
                  filter: isActive
                    ? `drop-shadow(0 0 8px ${tab.accent}80)`
                    : 'none',
                }}
              />
              
              {/* Fake notification dot/badge could go here for chats - but we keep it literal */}
            </div>

            <span
              className={`text-[10px] font-medium mt-1 font-sans transition-colors duration-200 ${
                isActive ? 'text-zinc-200 font-semibold' : 'text-zinc-500'
              }`}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
