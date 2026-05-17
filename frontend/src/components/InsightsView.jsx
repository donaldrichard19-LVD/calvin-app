import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

const TYPE_META = {
  schedule_conflict:    { label: 'Schedule conflicts', icon: '🗓️' },
  coverage_gap:         { label: 'Coverage gaps',      icon: '🕳️' },
  dropped_commitment:   { label: 'Dropped commitments',icon: '📧' },
  invisible_dependency: { label: 'Hidden dependencies',icon: '🔗' },
  expiring_item:        { label: 'Expiring items',     icon: '⏰' },
  asymmetric_context:   { label: 'Asymmetric context', icon: '📨' },
};

function StatCard({ label, value, sub, color = 'text-dark' }) {
  return (
    <div className="card p-4 flex flex-col gap-1">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-[13px] font-semibold text-dark">{label}</div>
      {sub && <div className="text-[11px] text-light">{sub}</div>}
    </div>
  );
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

  const totalByType = Object.values(stats.by_type || {}).reduce((s, n) => s + n, 0);
  const sortedTypes = Object.entries(stats.by_type || {})
    .sort(([, a], [, b]) => b - a);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-6 space-y-6">
      <div>
        <h2 className="text-[16px] font-bold text-dark mb-3">Overview · last 30 days</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Active" value={stats.active} sub="open issues" color="text-red-500" />
          <StatCard label="Resolved" value={stats.resolved_30d} sub="closed" color="text-green-600" />
          <StatCard
            label="Resolution"
            value={`${stats.resolution_rate}%`}
            sub={`of ${stats.created_30d} found`}
            color={stats.resolution_rate >= 60 ? 'text-green-600' : 'text-amber-600'}
          />
        </div>
      </div>

      {sortedTypes.length > 0 && (
        <div>
          <h2 className="text-[16px] font-bold text-dark mb-3">Common gap categories</h2>
          <div className="card p-4 space-y-3">
            {sortedTypes.map(([type, count]) => {
              const meta = TYPE_META[type] || { label: type, icon: '•' };
              const pct = totalByType > 0 ? Math.round((count / totalByType) * 100) : 0;
              return (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-medium text-dark">
                      {meta.icon} {meta.label}
                    </span>
                    <span className="text-[12px] text-light">{count} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blurple rounded-full transition-all"
                      style={{ width: `${pct}%` }}
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
            {stats.recent_resolved.map((a) => (
              <div key={a.id} className="card px-4 py-3 flex items-start gap-3">
                <span className="text-green-500 text-lg shrink-0">✓</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-dark leading-snug truncate">{a.title}</p>
                  <p className="text-[11px] text-light mt-0.5">
                    {TYPE_META[a.type]?.label || a.type} · resolved {timeAgo(a.updated_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.dismissed_30d > 0 && (
        <p className="text-[12px] text-light text-center">
          {stats.dismissed_30d} issue{stats.dismissed_30d !== 1 ? 's' : ''} dismissed in the last 30 days
        </p>
      )}
    </div>
  );
}
