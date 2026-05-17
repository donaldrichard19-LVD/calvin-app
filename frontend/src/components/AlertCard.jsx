import React, { useState } from 'react';

const TYPE_META = {
  schedule_conflict:    { icon: '🗓️', label: 'Schedule Conflict' },
  coverage_gap:         { icon: '🕳️', label: 'Coverage Gap' },
  dropped_commitment:   { icon: '📧', label: 'Dropped Commitment' },
  invisible_dependency: { icon: '🔗', label: 'Invisible Dependency' },
  expiring_item:        { icon: '⏰', label: 'Expiring Soon' },
  asymmetric_context:   { icon: '📨', label: 'Heads Up' },
};

const SEVERITY_COLORS = {
  high: 'text-red-600',
  medium: 'text-amber-600',
  low: 'text-blue-600',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function PartnerChip({ partner, isA }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[16px] border-2 bg-white ${
        isA ? 'border-coral' : 'border-dark'
      }`}
      title={partner?.display_name || 'Unknown'}
    >
      {partner?.emoji || partner?.display_name?.[0] || '?'}
    </span>
  );
}

export default function AlertCard({ alert, partnerA, partnerB, onDismiss, onSnooze, onResolve, onChat }) {
  const [expanded, setExpanded] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);

  const meta = TYPE_META[alert.type] || { icon: '•', label: alert.type };
  const cardClass = { high: 'alert-card-high', medium: 'alert-card-medium', low: 'alert-card-low' }[alert.severity] || 'alert-card-low';

  function handleResolve() {
    if (resolving) return;
    setResolving(true);
    setTimeout(() => {
      setFadingOut(true);
      setTimeout(() => onResolve(alert.id), 250);
    }, 700);
  }

  return (
    <div className={`card ${cardClass} p-4 relative overflow-hidden ${fadingOut ? 'card-fade-out' : ''}`}>
      {/* Green resolve overlay */}
      {resolving && (
        <div className="absolute inset-0 bg-green-50 flex items-center justify-center z-10 rounded-[12px]">
          <div className="check-pop">
            <svg className="w-16 h-16 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-mid bg-white border border-border rounded-full px-2 py-0.5">
            {meta.icon} {meta.label}
          </span>
          <span className={`text-[11px] font-semibold uppercase tracking-wider ${SEVERITY_COLORS[alert.severity]}`}>
            {alert.severity}
          </span>
        </div>
        <span className="text-[11px] text-light shrink-0">{timeAgo(alert.created_at)}</span>
      </div>

      <h3 className="text-[15px] font-semibold text-dark leading-snug mb-1">{alert.title}</h3>

      <p className={`text-[13px] text-mid leading-relaxed mb-2 ${!expanded ? 'line-clamp-3' : ''}`}>
        {alert.summary}
      </p>
      {alert.summary?.length > 180 && (
        <button onClick={() => setExpanded(!expanded)} className="text-[12px] text-blurple hover:underline mb-2">
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {alert.action_hint && (
        <p className="text-[13px] font-medium italic text-coral mb-3">→ {alert.action_hint}</p>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-black/5 mt-1">
        <div className="flex items-center gap-1">
          {(alert.relevant_to || []).map((r) => (
            <PartnerChip
              key={r}
              partner={r === 'partnerA' ? partnerA : partnerB}
              isA={r === 'partnerA'}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onChat(alert)}
            className="text-[12px] font-semibold text-blurple border border-blurple rounded-full px-3 py-1 hover:bg-blurpleLight transition-colors"
          >
            Ask follow-up
          </button>
          <button
            onClick={handleResolve}
            disabled={resolving}
            className="text-[12px] font-semibold text-green-700 border border-green-600 rounded-full px-3 py-1 hover:bg-green-50 transition-colors disabled:opacity-50"
          >
            Resolve
          </button>
          <button
            onClick={() => onDismiss(alert.id)}
            className="text-[12px] text-light hover:text-mid transition-colors px-1"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
