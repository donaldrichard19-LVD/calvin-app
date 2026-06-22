import React from 'react';
import { Activity, Brain, BarChart3, Settings } from 'lucide-react';
import EmojiAvatar from './EmojiAvatar';

const TABS = [
  { id: 'pulse',    label: 'Pulse',    Icon: Activity    },
  { id: 'context',  label: 'Context',  Icon: Brain       },
  { id: 'insights', label: 'Insights', Icon: BarChart3   },
  { id: 'settings', label: 'Settings', Icon: Settings    },
];

export default function BottomNav({ active, onChange, onSync, spinning, partner, onChangeEmoji }) {
  return (
    <>
      {/* Desktop: left sidebar */}
      <nav aria-label="Primary" className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-blurple z-40 flex-col">
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
          {TABS.map(({ id, label, Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                onClick={() => onChange(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-colors text-left ${
                  isActive
                    ? 'bg-white text-blurple shadow-sm'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={20} aria-hidden="true" className="shrink-0" />
                <span className="text-[13px] font-semibold">{label}</span>
              </button>
            );
          })}
        </div>

        {/* User avatar — bottom of desktop sidebar */}
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
          {TABS.map(({ id, label, Icon }) => {
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
                  <Icon size={20} aria-hidden="true" />
                </div>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
