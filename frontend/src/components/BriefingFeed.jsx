import React, { useState } from 'react';
import AlertCard from './AlertCard';

const FILTERS = ['All', 'High', 'Medium', 'Low'];

export default function BriefingFeed({ alerts, meta, partnerA, partnerB, onDismiss, onSnooze, onResolve, onChat, sidebar = false }) {
  const [activeFilter, setActiveFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState(null);

  const filtered = alerts.filter((a) => {
    if (activeFilter !== 'All' && a.severity !== activeFilter.toLowerCase()) return false;
    if (typeFilter && a.type !== typeFilter) return false;
    return true;
  });

  const high   = filtered.filter((a) => a.severity === 'high');
  const medium = filtered.filter((a) => a.severity === 'medium');
  const low    = filtered.filter((a) => a.severity === 'low');

  return (
    <div className={`flex flex-col ${sidebar ? 'h-full' : ''}`}>
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-[16px] font-bold text-dark">Briefing</h2>
        </div>

        <div className="flex gap-1 flex-wrap">
          {[
            { label: 'All',    count: meta?.total,        active: 'bg-blurple text-white',  dot: null },
            { label: 'High',   count: meta?.high_count,   active: 'bg-red-500 text-white',  dot: 'bg-red-500'   },
            { label: 'Medium', count: meta?.medium_count, active: 'bg-amber text-white', dot: 'bg-amber' },
            { label: 'Low',    count: meta?.low_count,    active: 'bg-blue text-white',  dot: 'bg-blue'  },
          ].map(({ label, count, active, dot }) => {
            const isActive = activeFilter === label && !typeFilter;
            return (
              <button
                key={label}
                onClick={() => { setActiveFilter(activeFilter === label ? 'All' : label); setTypeFilter(null); }}
                className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full transition-colors ${
                  isActive ? active : 'bg-white text-mid border border-border hover:bg-gray-50'
                }`}
              >
                {dot && !isActive && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
                {label}
                {count > 0 && (
                  <span className={`text-[10px] font-bold px-1 py-0.5 rounded-full leading-none ${
                    isActive ? 'bg-white/30 text-white' : 'bg-gray-100 text-mid'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`${sidebar ? 'flex-1 overflow-y-auto' : ''} px-4 pb-4 space-y-3`}>
        {filtered.length === 0 ? (
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
          <>
            {high.length > 0 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-red-500 mb-2">High priority</div>
                <div className="space-y-2">
                  {high.map((a) => (
                    <AlertCard key={a.id} alert={a} partnerA={partnerA} partnerB={partnerB}
                      onDismiss={onDismiss} onSnooze={onSnooze} onResolve={onResolve} onChat={onChat} />
                  ))}
                </div>
              </div>
            )}
            {medium.length > 0 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber mb-2">Medium Priority</div>
                <div className="space-y-2">
                  {medium.map((a) => (
                    <AlertCard key={a.id} alert={a} partnerA={partnerA} partnerB={partnerB}
                      onDismiss={onDismiss} onSnooze={onSnooze} onResolve={onResolve} onChat={onChat} />
                  ))}
                </div>
              </div>
            )}
            {low.length > 0 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-blue mb-2">Low Priority</div>
                <div className="space-y-2">
                  {low.map((a) => (
                    <AlertCard key={a.id} alert={a} partnerA={partnerA} partnerB={partnerB}
                      onDismiss={onDismiss} onSnooze={onSnooze} onResolve={onResolve} onChat={onChat} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
