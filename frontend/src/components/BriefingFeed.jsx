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
          {meta?.total > 0 && (
            <span className="bg-blurple text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
              {meta.total}
            </span>
          )}
          <div className="flex items-center gap-1 ml-auto text-[11px]">
            {meta?.high_count > 0 && (
              <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">🔴 {meta.high_count}</span>
            )}
            {meta?.medium_count > 0 && (
              <span className="bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-semibold">🟡 {meta.medium_count}</span>
            )}
            {meta?.low_count > 0 && (
              <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold">🔵 {meta.low_count}</span>
            )}
          </div>
        </div>

        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => { setActiveFilter(f); setTypeFilter(null); }}
              className={`text-[11px] font-semibold px-3 py-1 rounded-full transition-colors ${
                activeFilter === f && !typeFilter
                  ? 'bg-blurple text-white'
                  : 'bg-white text-mid border border-border hover:bg-gray-50'
              }`}
            >
              {f}
            </button>
          ))}
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
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-500 mb-2">This week</div>
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
                <div className="text-[11px] font-bold uppercase tracking-wider text-blue-400 mb-2">FYI</div>
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
