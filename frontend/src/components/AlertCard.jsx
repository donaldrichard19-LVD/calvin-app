import React, { useState } from 'react';

const TYPE_META = {
  schedule_conflict:    { icon: '🗓️', label: 'Schedule Conflict' },
  coverage_gap:         { icon: '🕳️', label: 'Coverage Gap' },
  dropped_commitment:   { icon: '📧', label: 'Upcoming Commitment' },
  invisible_dependency: { icon: '🔗', label: 'Invisible Dependency' },
  expiring_item:        { icon: '⏰', label: 'Expiring Soon' },
  asymmetric_context:   { icon: '📨', label: 'Heads Up' },
  event_auto_cancelled: { icon: '✅', label: 'Auto-Cancelled' },
  event_cancel_confirm: { icon: '🗑️', label: 'Cancel Event?' },
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

function parseSummaryLines(summary) {
  if (!summary) return [];
  const byNewline = summary.split('\n').map(s => s.trim()).filter(Boolean);
  if (byNewline.length > 1) return byNewline;
  // Fall back to splitting on '. ' for sentence-style summaries
  const bySentence = summary.split(/\.\s+/).map(s => s.trim()).filter(Boolean);
  if (bySentence.length > 1) return bySentence.map(s => s.endsWith('.') ? s : s + '.');
  return [summary];
}

export default function AlertCard({ alert, partnerA, partnerB, onDismiss, onSnooze, onResolve, onChat, onUndo, onCancelEvent }) {
  const [expanded, setExpanded] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [acting, setActing] = useState(false);

  const meta = TYPE_META[alert.type] || { icon: '•', label: alert.type };
  const isAutoCancelled = alert.type === 'event_auto_cancelled';
  const isCancelConfirm = alert.type === 'event_cancel_confirm';

  const summaryLines = parseSummaryLines(alert.summary);
  const PREVIEW_COUNT = 3;
  const visibleLines = expanded ? summaryLines : summaryLines.slice(0, PREVIEW_COUNT);
  const hasMore = summaryLines.length > PREVIEW_COUNT;

  function handleResolve() {
    if (resolving) return;
    setResolving(true);
    setTimeout(() => {
      setFadingOut(true);
      setTimeout(() => onResolve(alert.id), 250);
    }, 700);
  }

  async function handleUndo() {
    if (acting) return;
    setActing(true);
    try {
      await onUndo(alert.source_data?.event_id, alert.id);
    } finally {
      setActing(false);
    }
  }

  async function handleCancelEvent() {
    if (acting) return;
    setActing(true);
    try {
      await onCancelEvent(alert.id);
    } finally {
      setActing(false);
    }
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${fadingOut ? 'card-fade-out' : ''}`}
      style={{
        background: '#FFF5F5',
        padding: '32px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)',
      }}
    >
      {/* Green resolve overlay */}
      {resolving && (
        <div className="absolute inset-0 bg-green-50 flex items-center justify-center z-10 rounded-2xl">
          <div className="check-pop">
            <svg className="w-16 h-16 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      )}

      {/* Header: badge + timestamp */}
      <div className="flex items-center justify-between mb-4">
        <span
          className="text-[11px] font-semibold uppercase tracking-wider rounded-full px-3 py-1"
          style={{ color: '#E8352A', border: '1.5px solid #E8352A' }}
        >
          {meta.icon} {meta.label}
        </span>
        <span className="text-[11px] shrink-0" style={{ color: '#B0B0B0' }}>
          {timeAgo(alert.created_at)}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-[20px] font-bold text-black leading-snug mb-4">{alert.title}</h3>

      {/* Bulleted summary */}
      <ul className="space-y-2 mb-2">
        {visibleLines.map((line, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed" style={{ color: '#717171' }}>
            <span
              className="shrink-0 rounded-full mt-[6px]"
              style={{ width: 6, height: 6, background: '#B0B0B0', display: 'inline-block' }}
            />
            {line}
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[12px] text-blurple hover:underline mb-4"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {/* Suggested Next Step box */}
      {alert.action_hint && (
        <div
          className="rounded-xl p-4 mt-4 mb-2"
          style={{
            background: 'linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 100%)',
            border: '1.5px solid #A5B4FC',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[11px] flex items-center justify-center w-5 h-5 rounded-full shrink-0"
              style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
            >
              ✨
            </span>
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: '#4338CA' }}
            >
              Suggested Next Step
            </span>
          </div>
          <p className="text-[13px] mb-3 leading-relaxed" style={{ color: '#4F46E5' }}>
            {alert.action_hint}
          </p>
          <button
            onClick={() => onChat(alert)}
            className="text-[12px] font-semibold rounded-full px-4 py-1.5 transition-colors hover:bg-indigo-100"
            style={{ color: '#4F46E5', border: '1.5px solid #818CF8', background: 'transparent' }}
          >
            → Take this action
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 mt-2 border-t border-black/5">
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
          {isAutoCancelled ? (
            <>
              <button
                onClick={handleUndo}
                disabled={acting}
                className="text-[12px] font-semibold text-amber border border-amber rounded-full px-3 py-1 hover:bg-amber/10 transition-colors disabled:opacity-50"
              >
                {acting ? '...' : 'Undo'}
              </button>
              <button
                onClick={() => onDismiss(alert.id)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-light hover:text-mid hover:bg-gray-100 transition-colors"
                title="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          ) : isCancelConfirm ? (
            <>
              <button
                onClick={handleCancelEvent}
                disabled={acting}
                className="text-[12px] font-semibold text-red-600 border border-red-400 rounded-full px-3 py-1 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {acting ? '...' : 'Cancel it'}
              </button>
              <button
                onClick={() => onDismiss(alert.id)}
                className="text-[12px] font-semibold text-mid border border-border rounded-full px-3 py-1 hover:bg-gray-50 transition-colors"
              >
                Keep it
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onChat(alert)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-blurple hover:bg-blurpleLight transition-colors"
                title="Ask follow-up"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </button>
              <button
                onClick={handleResolve}
                disabled={resolving}
                className="w-8 h-8 flex items-center justify-center rounded-full text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                title="Resolve"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                onClick={() => onDismiss(alert.id)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-light hover:text-mid hover:bg-gray-100 transition-colors"
                title="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
