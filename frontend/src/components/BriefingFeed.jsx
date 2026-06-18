import React from 'react';
import AlertCard from './AlertCard';

export default function BriefingFeed({ alerts, meta, partnerA, partnerB, onDismiss, onSnooze, onResolve, onChat, onTackle, sidebar = false }) {
  return (
    <div className={`flex flex-col ${sidebar ? 'h-full' : ''}`}>
      <div className={`${sidebar ? 'flex-1 overflow-y-auto' : ''} px-4 pb-4 pt-4 space-y-3`}>
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="text-3xl mb-2">✓</div>
            <div className="text-mid text-sm">You're covered. No gaps detected.</div>
            {meta?.last_analysis_at && (
              <div className="text-light text-[11px] mt-1">
                Last checked {new Date(meta.last_analysis_at).toLocaleTimeString()}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => (
              <AlertCard key={a.id} alert={a} partnerA={partnerA} partnerB={partnerB}
                onDismiss={onDismiss} onSnooze={onSnooze} onResolve={onResolve} onChat={onChat}
                onTackle={onTackle} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
