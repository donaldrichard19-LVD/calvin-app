import React from 'react';
import EmojiAvatar from './EmojiAvatar';

const TABS = [
  {
    id: 'briefings',
    label: 'Pulse',
    icon: (active) => (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12h4l2 4 4-10 2 10 2-4h6" />
      </svg>
    ),
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: (active) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'insights',
    label: 'Insights',
    icon: (active) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (active) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function BottomNav({ active, onChange, onSync, spinning, partner, onChangeEmoji }) {
  return (
    <>
      {/* Desktop: left sidebar — blurple */}
      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-52 bg-blurple z-40 flex-col">
        {/* Calvin wordmark — click triggers sync */}
        <button
          onClick={onSync}
          disabled={spinning}
          className="px-5 pt-6 pb-3 text-left group disabled:opacity-70"
          title="Sync Calvin"
        >
          <span className={`text-[17px] font-bold text-white tracking-tight transition-opacity ${spinning ? 'opacity-60' : 'group-hover:opacity-80'}`}>
            {spinning ? 'Syncing…' : 'Calvin'}
          </span>
        </button>

        {/* Nav items */}
        <div className="flex-1 px-3 mt-2 space-y-0.5">
          {TABS.map(({ id, label, icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                onClick={() => onChange(id)}
                className={`group flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-colors text-left ${
                  isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className="shrink-0 transition-transform duration-100 ease-out group-active:scale-75">
                  {icon(isActive)}
                </div>
                <span className="text-[13px] font-semibold">{label}</span>
              </button>
            );
          })}
        </div>

        {/* User avatar — bottom */}
        {partner && (
          <div className="px-4 py-4 border-t border-white/20 flex items-center gap-2.5">
            <EmojiAvatar
              emoji={partner.emoji}
              isA
              name={partner.display_name}
              onChangeEmoji={(e) => onChangeEmoji?.(partner.id, e)}
            />
            <span className="text-[13px] font-medium text-white truncate">{partner.display_name}</span>
          </div>
        )}
      </nav>

      {/* Mobile: floating pill nav */}
      <nav className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md rounded-full shadow-xl border border-border px-2 py-2">
          {TABS.map(({ id, label, icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                onClick={() => onChange(id)}
                title={label}
                className={`group flex items-center justify-center w-12 h-12 rounded-full transition-all duration-150 ${
                  isActive ? 'bg-blurple text-white shadow-md' : 'text-light hover:text-mid hover:bg-gray-100'
                }`}
              >
                <div className="transition-transform duration-100 ease-out group-active:scale-75">
                  {icon(isActive)}
                </div>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
