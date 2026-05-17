import React from 'react';
import EmojiAvatar from './EmojiAvatar';

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
  if (mins < 60) return `Synced ${mins}m ago`;
  return `Synced ${Math.floor(mins / 60)}h ago`;
}

export default function PartnerStatus({ partners, integrations, onChangeEmoji }) {
  const getIntegration = (partnerId) =>
    integrations?.find((i) => i.partner_id === partnerId && i.provider === 'google');

  return (
    <div className="bg-white border-b border-border px-4 py-2 flex items-center gap-4">
      {partners.map((partner, idx) => {
        const intg = getIntegration(partner.id);
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
                {partner.display_name || `Partner ${idx === 0 ? 'A' : 'B'}`}
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
  );
}
