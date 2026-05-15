import React, { useEffect, useRef } from 'react';

const DISMISS_MS = 9000;

export default function SMSNotification({ alert, partners = [], onDismiss }) {
  const barRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(onDismiss, DISMISS_MS);
    if (barRef.current) {
      barRef.current.style.animation = `progressDrain ${DISMISS_MS}ms linear forwards`;
    }
    return () => clearTimeout(t);
  }, [onDismiss]);

  if (!alert) return null;

  const TYPE_LABELS = {
    schedule_conflict:    'Schedule conflict',
    coverage_gap:         'Coverage gap',
    dropped_commitment:   'Dropped commitment',
    invisible_dependency: 'Invisible dependency',
    expiring_item:        'Expiring item',
    asymmetric_context:   'Heads up',
  };

  const shortLabel = TYPE_LABELS[alert.type] || 'Alert';
  const message = `⚠️ HIGH: ${alert.title}\n${alert.summary?.slice(0, 120)}${alert.summary?.length > 120 ? '…' : ''}\n→ Review now: calvin.app/dashboard`;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] sms-enter">
      <div className="bg-white rounded-2xl shadow-card-hover border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-border">
          <div className="w-7 h-7 rounded-full bg-blurple flex items-center justify-center text-white text-[13px] font-bold shrink-0">
            C
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-dark leading-none">Calvin</div>
            <div className="text-[11px] text-light mt-0.5">SMS alert sent to household</div>
          </div>
          <button onClick={onDismiss} className="text-light hover:text-mid text-lg leading-none">×</button>
        </div>

        {/* Recipients */}
        {partners.length > 0 && (
          <div className="px-4 pt-3 pb-1 flex gap-3 flex-wrap">
            {partners.map((p) => p && (
              <div key={p.id} className="flex items-center gap-1.5 text-[11px]">
                <span className="w-4 h-4 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-[9px] font-bold">✓</span>
                <span className="text-dark font-medium">{p.display_name}</span>
                {p.phone && <span className="text-light">{p.phone}</span>}
              </div>
            ))}
          </div>
        )}

        {/* SMS bubble */}
        <div className="px-4 pb-3 pt-2">
          <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2.5">
            <p className="text-[12px] text-dark leading-relaxed whitespace-pre-line">{message}</p>
          </div>
          <div className="text-[10px] text-light mt-1 ml-1">{shortLabel} · just now</div>
        </div>

        {/* Auto-dismiss bar */}
        <div className="h-0.5 bg-gray-100">
          <div ref={barRef} className="h-full bg-blurple" style={{ width: '100%' }} />
        </div>
      </div>
    </div>
  );
}
