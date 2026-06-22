import React, { useState, useEffect } from 'react';
import { useClerk } from '@clerk/clerk-react';
import { apiFetch } from '../lib/api';
import EmojiAvatar from './EmojiAvatar';


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

export default function SettingsView({ householdInfo, integrations, partnerEmoji, onChangeEmoji }) {
  const { signOut } = useClerk();
  const [copied, setCopied]           = useState(false);
  const [connecting, setConnecting]   = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [leaving, setLeaving]         = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [inAppAlerts, setInAppAlerts] = useState(getInAppAlertsEnabled);
  const [mcpInfo, setMcpInfo]         = useState(null);
  const [mcpCopied, setMcpCopied]     = useState(false);
  const [gptSpecCopied, setGptSpecCopied] = useState(false);
  const [gptKeyCopied, setGptKeyCopied]   = useState(false);
  const [digestSaving, setDigestSaving] = useState(false);
  const [connections, setConnections]  = useState(null);
  const [revoking, setRevoking]        = useState(false);

  useEffect(() => {
    apiFetch('/api/household/mcp-info').then(setMcpInfo).catch(() => {});
    apiFetch('/api/household/connections').then(setConnections).catch(() => {});
  }, []);

  function copyMcpUrl() {
    if (!mcpInfo?.mcp_url) return;
    navigator.clipboard.writeText(mcpInfo.mcp_url).then(() => {
      setMcpCopied(true);
      setTimeout(() => setMcpCopied(false), 2000);
    });
  }

  const gptSpecUrl = mcpInfo?.mcp_url
    ? mcpInfo.mcp_url.replace(/\/mcp\/[^/]+$/, '') + '/api/gpt/openapi.json'
    : null;
  const gptApiKey = mcpInfo?.mcp_url ? mcpInfo.mcp_url.split('/').pop() : null;

  function copyGptSpec() {
    if (!gptSpecUrl) return;
    navigator.clipboard.writeText(gptSpecUrl).then(() => {
      setGptSpecCopied(true);
      setTimeout(() => setGptSpecCopied(false), 2000);
    });
  }

  function copyGptKey() {
    if (!gptApiKey) return;
    navigator.clipboard.writeText(gptApiKey).then(() => {
      setGptKeyCopied(true);
      setTimeout(() => setGptKeyCopied(false), 2000);
    });
  }

  async function handleRevoke() {
    if (revoking) return;
    setRevoking(true);
    try {
      const { mcp_url } = await apiFetch('/api/household/connections/revoke', { method: 'POST' });
      setMcpInfo((prev) => ({ ...prev, mcp_url }));
      setConnections({ claude: { status: 'never', last_seen_at: null }, chatgpt: { status: 'never', last_seen_at: null } });
    } catch {}
    setRevoking(false);
  }

  async function updateDigest(updates) {
    setDigestSaving(true);
    try {
      await apiFetch('/api/household/notifications', { method: 'PATCH', body: JSON.stringify(updates) });
      setMcpInfo((prev) => ({ ...prev, ...updates }));
    } catch {}
    setDigestSaving(false);
  }

  function toggleInAppAlerts() {
    const next = !inAppAlerts;
    setInAppAlerts(next);
    localStorage.setItem(INAPP_ALERTS_KEY, String(next));
  }

  const partner      = householdInfo?.partner;
  const otherPartner = householdInfo?.other_partner;
  const inviteCode   = householdInfo?.household?.invite_code;

  const MAX_GOOGLE_ACCOUNTS = 3;

  // A partner can now have multiple active Google accounts (up to the cap) —
  // collect ALL of them rather than a single match so each can be rendered
  // as its own row.
  const myIntegrations = (integrations || []).filter(
    (i) => i.partner_id === partner?.id && i.provider === 'google' && i.is_active
  );
  const partnerIntegrations = otherPartner
    ? (integrations || []).filter((i) => i.partner_id === otherPartner.id && i.provider === 'google' && i.is_active)
    : [];

  // Kept for the few places that only care about "is this person connected at all".
  const myIntegration = myIntegrations[0] || null;
  const partnerIntegration = partnerIntegrations[0] || null;

  const myGoogleCount = myIntegrations.length;
  const atGoogleCap = myGoogleCount >= MAX_GOOGLE_ACCOUNTS;

  async function handleReconnect() {
    setConnecting(true);
    try {
      const { url } = await apiFetch('/api/google/connect');
      window.location.href = url;
    } catch {
      setConnecting(false);
    }
  }

  async function handleAddAnotherGoogleAccount() {
    if (atGoogleCap) return;
    setConnecting(true);
    try {
      const { url } = await apiFetch('/api/google/connect?mode=add');
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
    const link = window.location.origin;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div>
      {/* Mobile header */}
      <header className="md:hidden sticky top-0 z-20 bg-cw-sidebar px-4 py-3 flex items-center justify-between">
        <h1 className="text-[17px] font-bold text-white">Settings</h1>
        {partner && onChangeEmoji && (
          <EmojiAvatar
            emoji={partnerEmoji || '😊'}
            isA
            name={partner.display_name}
            onChangeEmoji={onChangeEmoji}
            alignRight
          />
        )}
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-4 pb-6 space-y-6 relative">
      {/* Desktop header */}
      <header className="hidden md:block">
        <span className="text-[11px] font-bold uppercase tracking-wider text-cw-muted">Settings</span>
        <h1 className="text-[28px] font-bold text-cw-fg mt-1">Account & preferences</h1>
        <p className="text-[15px] text-cw-muted mt-2 leading-relaxed max-w-xl">Manage your profile, integrations, notifications, and connected apps.</p>
      </header>

      <Section title="Your profile">
        <Row label="Name" value={partner?.display_name} />
        <Row label="Phone" value={partner?.phone} />
        {myIntegration && <Row label="Google account" value={myIntegration.account_email} />}
      </Section>

      <Section title="Account connections">
        {[
          { p: partner, intg: myIntegration, tag: 'You' },
          otherPartner ? { p: otherPartner, intg: partnerIntegration, tag: 'Partner' } : null,
        ].filter(Boolean).map(({ p, intg, tag }) => (
          <div key={p.id} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${intg?.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-[14px] font-medium text-dark">{p.display_name}</span>
              <span className="text-[11px] text-light">{tag}</span>
            </div>
            <span className={`text-[12px] font-semibold ${intg?.is_active ? 'text-green-600' : 'text-light'}`}>
              {intg?.is_active ? 'Connected' : 'Not connected'}
            </span>
          </div>
        ))}
        {!otherPartner && (
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[13px] text-light">No partner connected yet</span>
            {inviteCode && (
              <button
                onClick={copyInvite}
                className="text-[12px] font-semibold text-blurple hover:opacity-75"
              >
                {copied ? 'Copied!' : 'Invite partner'}
              </button>
            )}
          </div>
        )}
      </Section>

      <Section title="Google Calendar & Gmail">
        {myIntegrations.length > 0 ? (
          <>
            {myIntegrations.map((intg) => (
              <Row
                key={intg.id}
                label="Connected"
                value={`${intg.account_email} · synced ${timeSince(intg.last_synced_at)}`}
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
            ))}

            <div className="px-4 py-3 space-y-2">
              {atGoogleCap ? (
                <p className="text-[12px] text-light">
                  You've reached the maximum of 3 connected accounts.
                </p>
              ) : (
                <button
                  onClick={handleAddAnotherGoogleAccount}
                  disabled={connecting}
                  className="text-[13px] font-semibold text-blurple hover:opacity-75 disabled:opacity-50"
                >
                  {connecting ? 'Redirecting…' : `+ Add another Gmail account (${myGoogleCount}/${MAX_GOOGLE_ACCOUNTS})`}
                </button>
              )}
            </div>

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

      <Section title="Connected Apps">
        <div className="px-4 py-3 space-y-4">

          {/* Active connections */}
          <div>
            <div className="text-[11px] text-light mb-2">Active connections</div>
            <div className="space-y-2">
              {[
                { key: 'claude', label: 'Claude', subtitle: 'Claude Cowork / Claude Code' },
              ].map(({ key, label, subtitle }) => {
                const conn = connections?.[key];
                const statusColor = !conn || conn.status === 'never' ? 'bg-gray-300'
                  : conn.status === 'live' ? 'bg-green-500'
                  : conn.status === 'recent' ? 'bg-yellow-400'
                  : 'bg-gray-300';
                const statusText = !conn ? '—'
                  : conn.status === 'never' ? 'Never connected'
                  : conn.status === 'live' ? 'Live'
                  : conn.status === 'recent' ? `Last seen ${timeSince(conn.last_seen_at)}`
                  : `Inactive · last seen ${timeSince(conn.last_seen_at)}`;
                return (
                  <div key={key} className="flex items-center gap-3 py-1">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-dark">{label}</div>
                      <div className="text-[11px] text-light">{subtitle}</div>
                    </div>
                    <div className="text-[11px] text-mid shrink-0">{statusText}</div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={handleRevoke}
              disabled={revoking}
              className="mt-3 text-[12px] font-semibold text-red-500 hover:opacity-75 disabled:opacity-40 transition-opacity"
            >
              {revoking ? 'Revoking…' : 'Revoke all access'}
            </button>
            <p className="text-[11px] text-light mt-1 leading-relaxed">
              Revoking generates a new connector URL, immediately disconnecting all active sessions. Re-share the new URL to reconnect.
            </p>
          </div>

          {/* Claude connector URL */}
          <div className="border-t border-border pt-4">
            <div className="text-[11px] text-light mb-1.5">Claude connector URL</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 text-[12px] font-mono bg-gray-50 border border-border rounded-lg px-3 py-2 truncate text-mid">
                {mcpInfo?.mcp_url || 'Loading…'}
              </div>
              <button
                onClick={copyMcpUrl}
                disabled={!mcpInfo}
                className="text-[12px] font-semibold text-blurple hover:opacity-75 shrink-0 disabled:opacity-40"
              >
                {mcpCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-[11px] text-light mt-1.5 leading-relaxed">
              Paste URL into Claude: Settings → Customize → Connectors to Add Custom Connector, Name the Connector and Paste URL to give Claude access to your Calvin briefings, shared calendar and household context.
            </p>
          </div>


          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-[14px] font-medium text-dark">Email digest</div>
                <div className="text-[11px] text-light">Receive a briefing from hello@calvinai.co</div>
              </div>
              <button
                onClick={() => updateDigest({ digest_email_enabled: !mcpInfo?.digest_email_enabled })}
                disabled={!mcpInfo || digestSaving}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                  mcpInfo?.digest_email_enabled ? 'bg-blurple' : 'bg-gray-200'
                }`}
                role="switch"
                aria-checked={mcpInfo?.digest_email_enabled}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 mt-0.5 ${
                  mcpInfo?.digest_email_enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
            {mcpInfo?.digest_email_enabled && (
              <div className="flex gap-2 mt-2">
                {['daily', 'weekly'].map((freq) => (
                  <button
                    key={freq}
                    onClick={() => updateDigest({ digest_email_frequency: freq })}
                    disabled={digestSaving}
                    className={`text-[12px] font-semibold px-3 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                      mcpInfo?.digest_email_frequency === freq
                        ? 'bg-blurple text-white border-blurple'
                        : 'text-mid border-border hover:border-blurple hover:text-blurple'
                    }`}
                  >
                    {freq.charAt(0).toUpperCase() + freq.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
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

      <Section title="Invite friends">
        <Row
          label="Share Calvin"
          value="Invite friends to try Calvin"
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
    </div>
  );
}
