import React, { useState } from 'react';
import { useClerk } from '@clerk/clerk-react';
import { apiFetch } from '../lib/api';

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-light mb-2 px-1">{title}</h3>
      <div className="card divide-y divide-border">{children}</div>
    </div>
  );
}

function Row({ label, value, action }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <div className="min-w-0">
        <div className="text-[11px] text-light">{label}</div>
        <div className="text-[14px] font-medium text-dark truncate">{value || '—'}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function timeSince(dateStr) {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const INAPP_ALERTS_KEY = 'calvin_inapp_alerts';

export function getInAppAlertsEnabled() {
  return localStorage.getItem(INAPP_ALERTS_KEY) !== 'false';
}

export default function SettingsView({ householdInfo, integrations }) {
  const { signOut } = useClerk();
  const [copied, setCopied]           = useState(false);
  const [connecting, setConnecting]   = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [leaving, setLeaving]         = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [inAppAlerts, setInAppAlerts] = useState(getInAppAlertsEnabled);

  function toggleInAppAlerts() {
    const next = !inAppAlerts;
    setInAppAlerts(next);
    localStorage.setItem(INAPP_ALERTS_KEY, String(next));
  }

  const partner      = householdInfo?.partner;
  const otherPartner = householdInfo?.other_partner;
  const inviteCode   = householdInfo?.household?.invite_code;

  const myIntegration = integrations?.find(
    (i) => i.partner_id === partner?.id && i.provider === 'google' && i.is_active
  );
  const partnerIntegration = otherPartner
    ? integrations?.find((i) => i.partner_id === otherPartner.id && i.provider === 'google' && i.is_active)
    : null;

  async function handleReconnect() {
    setConnecting(true);
    try {
      const { url } = await apiFetch('/api/google/connect');
      window.location.href = url;
    } catch {
      setConnecting(false);
    }
  }

  async function handleDisconnectGoogle() {
    if (disconnecting) return;
    setDisconnecting(true);
    try {
      await apiFetch('/api/integrations/google', { method: 'DELETE' });
      window.location.reload();
    } catch {
      setDisconnecting(false);
    }
  }

  async function handleLeaveHousehold() {
    if (leaving) return;
    setLeaving(true);
    try {
      await apiFetch('/api/household/leave', { method: 'DELETE' });
      window.location.href = '/';
    } catch {
      setLeaving(false);
      setLeaveConfirm(false);
    }
  }

  function copyInvite() {
    const link = `${window.location.origin}?invite=${inviteCode}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-6 space-y-6">
      <Section title="Your profile">
        <Row label="Name" value={partner?.display_name} />
        <Row label="Phone" value={partner?.phone} />
        {myIntegration && <Row label="Google account" value={myIntegration.account_email} />}
      </Section>

      <Section title="Google Calendar & Gmail">
        {myIntegration ? (
          <>
            <Row
              label="Connected"
              value={`${myIntegration.account_email} · synced ${timeSince(myIntegration.last_synced_at)}`}
              action={
                <button
                  onClick={handleReconnect}
                  disabled={connecting}
                  className="text-[12px] font-semibold text-blurple hover:opacity-75 disabled:opacity-50"
                >
                  {connecting ? 'Redirecting…' : 'Reconnect'}
                </button>
              }
            />
            <div className="px-4 py-3">
              <button
                onClick={handleDisconnectGoogle}
                disabled={disconnecting}
                className="text-[13px] font-medium text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
              >
                {disconnecting ? 'Disconnecting…' : 'Disconnect Google account'}
              </button>
            </div>
          </>
        ) : (
          <Row
            label="Not connected"
            value="Connect to power briefings and calendar"
            action={
              <button
                onClick={handleReconnect}
                disabled={connecting}
                className="btn-primary text-[12px] py-1.5 px-3 disabled:opacity-50"
              >
                {connecting ? '…' : 'Connect'}
              </button>
            }
          />
        )}
      </Section>

      <Section title="Notifications">
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-dark">In-app alerts</div>
            <div className="text-[11px] text-light">Show a popup when a new high or medium alert is detected</div>
          </div>
          <button
            onClick={toggleInAppAlerts}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${
              inAppAlerts ? 'bg-blurple' : 'bg-gray-200'
            }`}
            role="switch"
            aria-checked={inAppAlerts}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 mt-0.5 ${
              inAppAlerts ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </Section>

      {otherPartner && (
        <Section title="Partner">
          <Row label="Name" value={otherPartner.display_name} />
          <Row
            label="Google"
            value={partnerIntegration ? `Connected · ${partnerIntegration.account_email}` : 'Not connected'}
          />
        </Section>
      )}

      {inviteCode && (
        <Section title="Household invite">
          <Row
            label="Invite code"
            value={inviteCode}
            action={
              <button
                onClick={copyInvite}
                className="text-[12px] font-semibold text-blurple hover:opacity-75"
              >
                {copied ? 'Copied!' : 'Copy link'}
              </button>
            }
          />
        </Section>
      )}

      <Section title="Household">
        {!leaveConfirm ? (
          <div className="px-4 py-3">
            <button
              onClick={() => setLeaveConfirm(true)}
              className="text-[13px] font-medium text-red-500 hover:text-red-600 transition-colors"
            >
              Leave household
            </button>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-3">
            <p className="text-[13px] text-dark font-medium">Are you sure? This will disconnect your Google account and remove you from the household.</p>
            <div className="flex gap-3">
              <button
                onClick={handleLeaveHousehold}
                disabled={leaving}
                className="text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 px-4 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                {leaving ? 'Leaving…' : 'Yes, leave'}
              </button>
              <button
                onClick={() => setLeaveConfirm(false)}
                className="text-[13px] font-medium text-mid hover:text-dark transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Account">
        <div className="px-4 py-3">
          <button
            onClick={() => signOut({ redirectUrl: '/' })}
            className="text-[14px] font-medium text-red-500 hover:text-red-600 transition-colors"
          >
            Sign out
          </button>
        </div>
      </Section>
    </div>
  );
}
