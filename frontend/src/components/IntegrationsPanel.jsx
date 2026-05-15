import React from 'react';
import { apiFetch } from '../lib/api';

export default function IntegrationsPanel({ integrations, onConnect, onRefresh }) {
  async function handleDisconnect(provider) {
    try {
      await apiFetch(`/api/integrations/${provider}`, { method: 'DELETE' });
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Failed to disconnect: ' + err.message);
    }
  }

  const google = integrations?.find((i) => i.provider === 'google' && i.is_active);

  return (
    <div className="card p-4">
      <h3 className="text-[16px] font-bold text-dark mb-3">Integrations</h3>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center">
            <svg viewBox="0 0 48 48" className="w-6 h-6">
              <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9L37 9.6C33.4 6.4 28.9 4.5 24 4.5 12.7 4.5 3.5 13.7 3.5 25S12.7 45.5 24 45.5 44.5 36.3 44.5 25c0-1.7-.2-3.4-.9-5z"/>
            </svg>
          </div>
          <div>
            <div className="text-[13px] font-semibold text-dark">Google Calendar + Gmail</div>
            {google ? (
              <div className="text-[11px] text-green-600">{google.account_email}</div>
            ) : (
              <div className="text-[11px] text-mid">Not connected</div>
            )}
          </div>
        </div>

        {google ? (
          <button
            onClick={() => handleDisconnect('google')}
            className="text-[12px] text-mid hover:text-red-500 transition-colors"
          >
            Disconnect
          </button>
        ) : (
          <button onClick={onConnect} className="btn-primary text-sm">
            Connect
          </button>
        )}
      </div>
    </div>
  );
}
