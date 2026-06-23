import React, { useEffect, useState } from 'react';
import {
  CalendarClock, ArrowLeftRight, CircleDashed, Hourglass,
  Workflow, CircleAlert, CalendarX, Megaphone, CalendarDays,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

const CANONICAL = {
  upcoming_commitments: { label: 'Upcoming commitments', Icon: CalendarClock },
  unshared_context:     { label: 'Unshared context',     Icon: ArrowLeftRight },
  coverage_gaps:        { label: 'Coverage gaps',         Icon: CircleDashed },
  expiring_items:       { label: 'Expiring items',        Icon: Hourglass },
  hidden_dependencies:  { label: 'Hidden dependencies',   Icon: Workflow },
  action_needed:        { label: 'Action needed',         Icon: CircleAlert },
  event_cancellations:  { label: 'Event cancellations',   Icon: CalendarX },
  heads_up:             { label: 'Heads-up',              Icon: Megaphone },
  schedule_conflicts:   { label: 'Schedule conflicts',    Icon: CalendarDays },
};

const SLUG_TO_CANONICAL = {
  upcoming_commitment:  'upcoming_commitments',
  dropped_commitment:   'upcoming_commitments',
  unshared_context:     'unshared_context',
  asymmetric_context:   'unshared_context',
  coverage_gap:         'coverage_gaps',
  expiring_item:        'expiring_items',
  invisible_dependency: 'hidden_dependencies',
  action_needed:        'action_needed',
  event_auto_cancelled: 'event_cancellations',
  heads_up:             'heads_up',
  schedule_conflict:    'schedule_conflicts',
};

function mergeByType(byType = {}) {
  const merged = {};
  for (const [slug, count] of Object.entries(byType)) {
    const key = SLUG_TO_CANONICAL[slug] ?? slug;
    merged[key] = (merged[key] || 0) + count;
  }
  return merged;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function InsightsView() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/briefing/stats')
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-light text-sm">
        Loading insights…
      </div>
    );
  }

  if (!stats) return null;

  const merged = mergeByType(stats.by_type);
  const total = stats.created_30d || Object.values(merged).reduce((s, n) => s + n, 0);
  const sortedTypes = Object.entries(merged).sort(([, a], [, b]) => b - a);
  const maxCount = sortedTypes[0]?.[1] ?? 1;

  return (
    <div>
      {/* Mobile header */}
      <header className="md:hidden sticky top-0 z-20 bg-cw-sidebar px-4 py-3">
        <h1 className="text-[17px] font-bold text-white">Insights</h1>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-4 pb-6 space-y-6">
      {/* Desktop header */}
      <header className="hidden md:block">
        <h1 className="text-[28px] font-bold text-cw-fg mt-1">Insights</h1>
        <p className="text-[15px] text-cw-muted mt-2 leading-relaxed max-w-xl">Alert trends, resolution rates, and common gap categories from the last 30 days.</p>
      </header>

      <div>
        <h2 className="text-[16px] font-bold text-dark mb-3">Overview · last 30 days</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-3xl bg-white ring-1 ring-border p-4 flex flex-col gap-1">
            <div className="text-3xl font-bold text-red-500">{stats.active}</div>
            <div className="text-[13px] font-semibold text-dark">Active</div>
            <div className="text-[11px] text-light">open issues</div>
          </div>
          <div className="rounded-3xl bg-white ring-1 ring-border p-4 flex flex-col gap-1">
            <div className="text-3xl font-bold text-dark">{stats.resolved_30d}</div>
            <div className="text-[13px] font-semibold text-dark">Resolved</div>
            <div className="text-[11px] text-light">closed</div>
          </div>
          <div className="rounded-3xl bg-white ring-1 ring-border p-4 flex flex-col gap-1">
            <div className={`text-3xl font-bold ${stats.resolution_rate >= 60 ? 'text-green-600' : 'text-amber-600'}`}>
              {stats.resolution_rate}%
            </div>
            <div className="text-[13px] font-semibold text-dark">Resolution</div>
            <div className="text-[11px] text-light">of {total} found</div>
          </div>
        </div>
      </div>

      {sortedTypes.length > 0 && (
        <div>
          <h2 className="text-[16px] font-bold text-dark mb-3">Common gap categories</h2>
          <div className="card p-4 space-y-3">
            {sortedTypes.map(([key, count]) => {
              const meta = CANONICAL[key] || { label: key, Icon: CircleDashed };
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const barWidth = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-2 text-[13px] font-medium text-dark">
                      <meta.Icon size={16} className="text-light shrink-0" aria-hidden="true" />
                      {meta.label}
                    </span>
                    <span className="text-[12px] text-light tabular-nums">{count} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blurple rounded-full transition-all"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {stats.recent_resolved?.length > 0 && (
        <div>
          <h2 className="text-[16px] font-bold text-dark mb-3">Recently resolved</h2>
          <div className="space-y-2">
            {stats.recent_resolved.map((a) => {
              const canonicalKey = SLUG_TO_CANONICAL[a.type] ?? a.type;
              const meta = CANONICAL[canonicalKey];
              return (
                <div key={a.id} className="card px-4 py-3 flex items-start gap-3">
                  <span className="text-green-500 text-lg shrink-0">✓</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-dark leading-snug truncate">{a.title}</p>
                    <p className="text-[11px] text-light mt-0.5">
                      {meta?.label || canonicalKey} · resolved {timeAgo(a.updated_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {stats.dismissed_30d > 0 && (
        <p className="text-[12px] text-light text-center">
          {stats.dismissed_30d} issue{stats.dismissed_30d !== 1 ? 's' : ''} dismissed in the last 30 days
        </p>
      )}
      </div>
    </div>
  );
}
