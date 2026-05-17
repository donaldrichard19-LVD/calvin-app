import React, { useState, useRef, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import EmojiAvatar from './EmojiAvatar';

function HouseIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function SyncIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function PlusIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function StatusDot({ intg }) {
  if (!intg || !intg.is_active) return <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />;
  return <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />;
}

export default function Header({ householdInfo, integrations, onRefresh, onInvite, showInvite, partner, onChangeEmoji }) {
  const [open, setOpen]       = useState(false);
  const [spinning, setSpinning] = useState(false);
  const dropRef = useRef(null);

  useEffect(() => {
    function onMouseDown(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  async function handleSync() {
    setOpen(false);
    setSpinning(true);
    try {
      await apiFetch('/api/analyze/trigger', { method: 'POST' });
      await new Promise((r) => setTimeout(r, 12000));
      onRefresh?.();
    } catch {}
    setSpinning(false);
  }

  const partner      = householdInfo?.partner;
  const otherPartner = householdInfo?.other_partner;
  const household    = householdInfo?.household;

  const myIntg      = integrations?.find((i) => i.partner_id === partner?.id && i.provider === 'google');
  const partnerIntg = otherPartner
    ? integrations?.find((i) => i.partner_id === otherPartner.id && i.provider === 'google')
    : null;

  return (
    <header className="h-14 bg-white border-b border-border flex items-center px-4 shrink-0 relative">
      {/* House icon — left */}
      <div ref={dropRef} className="relative z-50">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Household menu"
        >
          <HouseIcon className={`w-5 h-5 ${open ? 'text-blurple' : 'text-dark'}`} />
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-2xl shadow-card-hover border border-border overflow-hidden">
            {/* Household name */}
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[13px] font-bold text-dark truncate">
                {household?.name || 'Your Household'}
              </p>
            </div>

            {/* Account connections */}
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[10px] font-bold uppercase tracking-wider text-light mb-2">
                Account Connections
              </p>
              <div className="space-y-2">
                {[
                  { p: partner,      intg: myIntg,      tag: 'You' },
                  { p: otherPartner, intg: partnerIntg, tag: 'Partner' },
                ].filter((x) => x.p).map(({ p, intg, tag }) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusDot intg={intg} />
                      <span className="text-[13px] font-medium text-dark">{p.display_name}</span>
                      <span className="text-[11px] text-light">{tag}</span>
                    </div>
                    <span className={`text-[11px] font-semibold ${intg?.is_active ? 'text-green-600' : 'text-light'}`}>
                      {intg?.is_active ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Add user account */}
            {showInvite && (
              <button
                onClick={() => { setOpen(false); onInvite?.(); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-border text-left"
              >
                <PlusIcon className="w-4 h-4 text-blurple shrink-0" />
                <span className="text-[13px] font-medium text-dark">Add user account</span>
              </button>
            )}

            {/* Sync */}
            <button
              onClick={handleSync}
              disabled={spinning}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
            >
              <SyncIcon className={`w-4 h-4 text-dark shrink-0 ${spinning ? 'animate-spin' : ''}`} />
              <span className="text-[13px] font-medium text-dark">{spinning ? 'Syncing…' : 'Sync'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Calvin — centered */}
      <span className="absolute left-1/2 -translate-x-1/2 text-dark font-bold text-lg tracking-tight pointer-events-none">
        Calvin
      </span>

      {/* Current user — right */}
      {partner && (
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[13px] font-semibold text-dark hidden sm:inline">{partner.display_name}</span>
          <EmojiAvatar
            emoji={partner.emoji}
            isA
            name={partner.display_name}
            onChangeEmoji={(e) => onChangeEmoji?.(partner.id, e)}
            alignRight
          />
        </div>
      )}
    </header>
  );
}
