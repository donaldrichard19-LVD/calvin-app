import React from 'react';
import EmojiAvatar from './EmojiAvatar';
import { apiFetch } from '../lib/api';

function getStatusColor(integration) {
  if (!integration || !integration.is_active) return 'bg-gray-300';
  if (!integration.last_synced_at) return 'bg-amber-400';
  const age = Date.now() - new Date(integration.last_synced_at).getTime();
  return age < 3600000 ? 'bg-green-500' : 'bg-amber-400';
}

function getStatusTooltip(integration) {
  if (!integration || !integration.is_active) return 'Not connected';
  if (!integration.last_synced_at) return 'Connected, never synced';
  const age = Date.now() - new Date(integration.last_synced_at).getTime();
  const mins = Math.floor(age / 60000);
  if (mins < 60) return `Last synced ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `Last synced ${hrs}h ago`;
}

const VIEW_OPTIONS = [
  { value: 'insights', label: 'Insights', icon: '💡' },
  { value: 'calendar', label: 'Calendar', icon: '📅' },
  { value: 'both',     label: 'Both',     icon: '⊞'  },
];

export default function PartnerStatus({ partners, integrations, onRefresh, view, onViewChange, onChangeEmoji, onInvite, showInvite }) {
  const [spinning, setSpinning] = React.useState(false);

  async function handleRefresh() {
    setSpinning(true);
    try {
      await apiFetch('/api/household/analyze', { method: 'POST' });
      if (onRefresh) onRefresh();
    } catch {}
    setTimeout(() => setSpinning(false), 3000);
  }

  const getPartnerIntegration = (partnerId) =>
    integrations?.find((i) => i.partner_id === partnerId && i.provider === 'google');

  return (
    <div className="flex items-center gap-3 bg-white border-b border-border px-4 py-2 flex-wrap gap-y-2">
      {/* Partner avatars */}
      <div className="flex items-center gap-3">
        {partners.map((partner, idx) => {
          const intg = getPartnerIntegration(partner.id);
          return (
            <div key={partner.id} className="flex items-center gap-2">
              <EmojiAvatar
                emoji={partner.emoji}
                isA={idx === 0}
                name={partner.display_name}
                onChangeEmoji={(e) => onChangeEmoji?.(partner.id, e)}
              />
              <div>
                <div className="text-[13px] font-semibold text-dark leading-none">
                  {partner.display_name || 'Partner ' + (idx === 0 ? 'A' : 'B')}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`w-2 h-2 rounded-full ${getStatusColor(intg)}`} title={getStatusTooltip(intg)} />
                  <span className="text-[11px] text-light">{getStatusTooltip(intg)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* View toggle */}
      {onViewChange && (
        <div className="flex items-center bg-gray-100 rounded-full p-0.5 gap-0.5">
          {VIEW_OPTIONS.map(({ value, label, icon }) => (
            <button
              key={value}
              onClick={() => onViewChange(value)}
              className={`flex items-center gap-1 text-[12px] font-semibold px-3 py-1 rounded-full transition-all ${
                view === value
                  ? 'bg-white text-dark shadow-sm'
                  : 'text-mid hover:text-dark'
              }`}
            >
              <span>{icon}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Invite */}
      {showInvite && (
        <button
          onClick={onInvite}
          className="ml-auto flex items-center gap-1.5 text-[12px] font-semibold text-blurple hover:opacity-80 transition-opacity"
          title="Invite your partner"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">Invite partner</span>
        </button>
      )}

      {/* Refresh */}
      <button
        onClick={handleRefresh}
        className={`${showInvite ? '' : 'ml-auto'} text-mid hover:text-dark transition-colors`}
        title="Run analysis now"
      >
        <svg className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  );
}
