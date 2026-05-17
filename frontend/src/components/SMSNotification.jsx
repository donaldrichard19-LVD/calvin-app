import React, { useEffect, useRef } from 'react';

const DISMISS_MS = 9000;

const SEVERITY_STYLES = {
  high:   { bar: 'bg-red-500',   badge: 'bg-red-100 text-red-700',   label: 'High priority' },
  medium: { bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700', label: 'Medium priority' },
  low:    { bar: 'bg-blue-500',  badge: 'bg-blue-100 text-blue-700',  label: 'Low priority' },
};

export default function SMSNotification({ alert, onDismiss }) {
  const barRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(onDismiss, DISMISS_MS);
    if (barRef.current) {
      barRef.current.style.animation = `progressDrain ${DISMISS_MS}ms linear forwards`;
    }
    return () => clearTimeout(t);
  }, [onDismiss]);

  if (!alert) return null;

  const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.low;

  return (
    <div className="fixed bottom-20 right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] sms-enter">
      <div className="bg-white rounded-2xl shadow-card-hover border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-border">
          <div className="w-7 h-7 rounded-full bg-blurple flex items-center justify-center text-white text-[13px] font-bold shrink-0">
            C
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-dark leading-none">New Alert</div>
            <div className="text-[11px] text-light mt-0.5">Calvin · just now</div>
          </div>
          <button onClick={onDismiss} className="text-light hover:text-mid text-lg leading-none">×</button>
        </div>

        <div className="px-4 py-3">
          <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-2 ${style.badge}`}>
            {style.label}
          </span>
          <p className="text-[13px] font-semibold text-dark leading-snug mb-1">{alert.title}</p>
          <p className="text-[12px] text-mid leading-relaxed line-clamp-2">{alert.summary}</p>
          {alert.action_hint && (
            <p className="text-[11px] text-blurple font-medium mt-1.5">→ {alert.action_hint}</p>
          )}
        </div>

        <div className="h-0.5 bg-gray-100">
          <div ref={barRef} className={`h-full ${style.bar}`} style={{ width: '100%' }} />
        </div>
      </div>
    </div>
  );
}
