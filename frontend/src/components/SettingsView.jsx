import React, { useState, useEffect } from 'react';
import { useClerk } from '@clerk/clerk-react';
import { apiFetch } from '../lib/api';

const ROLES = ['child', 'pet', 'grandparent', 'parent', 'sibling', 'other'];
function newMember() {
  return { id: crypto.randomUUID(), name: '', role: 'child', age: '', notes: '' };
}

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
  const [mcpInfo, setMcpInfo]         = useState(null);
  const [mcpCopied, setMcpCopied]     = useState(false);
  const [gptSpecCopied, setGptSpecCopied] = useState(false);
  const [gptKeyCopied, setGptKeyCopied]   = useState(false);
  const [digestSaving, setDigestSaving] = useState(false);

  const [context, setContext]         = useState({ members: [], notes: '' });
  const [contextSaving, setContextSaving] = useState(false);
  const [contextSaved, setContextSaved]   = useState(false);

  useEffect(() => {
    apiFetch('/api/household/context')
      .then((d) => setContext(d.context?.members ? d.context : { members: d.context?.members || [], notes: d.context?.notes || '' }))
      .catch(() => {});
    apiFetch('/api/household/mcp-info').then(setMcpInfo).catch(() => {});
  }, []);

  function addMember() {
    setContext((prev) => ({ ...prev, members: [...prev.members, newMember()] }));
  }

  function updateMember(id, field, value) {
    setContext((prev) => ({
      ...prev,
      members: prev.members.map((m) => m.id === id ? { ...m, [field]: value } : m),
    }));
  }

  function removeMember(id) {
    setContext((prev) => ({ ...prev, members: prev.members.filter((m) => m.id !== id) }));
  }

  async function saveContext() {
    setContextSaving(true);
    try {
      await apiFetch('/api/household/context', { method: 'PATCH', body: JSON.stringify({ context }) });
      setContextSaved(true);
      setTimeout(() => setContextSaved(false), 2000);
    } catch {}
    setContextSaving(false);
  }

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
    const link = window.location.origin;
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

      <Section title="Calvin AI">
        <div className="px-4 py-3 space-y-4">
          <div>
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
              Paste into Claude Cowork → Customize → Connectors to give Claude access to your Calvin alerts and calendar.
            </p>
          </div>

          <div className="border-t border-border pt-4">
            <div className="text-[11px] text-light mb-1.5">ChatGPT connector</div>
            <div className="space-y-2">
              <div>
                <div className="text-[10px] text-light mb-1">Spec URL (paste into Custom GPT → Actions)</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-[12px] font-mono bg-gray-50 border border-border rounded-lg px-3 py-2 truncate text-mid">
                    {gptSpecUrl || 'Loading…'}
                  </div>
                  <button
                    onClick={copyGptSpec}
                    disabled={!gptSpecUrl}
                    className="text-[12px] font-semibold text-blurple hover:opacity-75 shrink-0 disabled:opacity-40"
                  >
                    {gptSpecCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-light mb-1">API key (paste into GPT Authentication → Bearer token)</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-[12px] font-mono bg-gray-50 border border-border rounded-lg px-3 py-2 truncate text-mid">
                    {gptApiKey ? '••••••••••••••••' : 'Loading…'}
                  </div>
                  <button
                    onClick={copyGptKey}
                    disabled={!gptApiKey}
                    className="text-[12px] font-semibold text-blurple hover:opacity-75 shrink-0 disabled:opacity-40"
                  >
                    {gptKeyCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-light mt-2 leading-relaxed">
              In ChatGPT → Create a GPT → Actions: import from the spec URL, then set Authentication to API Key (Bearer) and paste your API key.
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

      <Section title="Household context">
        <div className="px-4 py-3 space-y-3">
          <p className="text-[11px] text-light leading-relaxed">
            Calvin uses this to personalise alerts and chat responses — add children, pets, grandparents, food preferences, and anything else that's relevant.
          </p>

          {context.members.map((m) => (
            <div key={m.id} className="flex gap-2 items-start">
              <div className="flex-1 space-y-1.5">
                <input
                  value={m.name}
                  onChange={(e) => updateMember(m.id, 'name', e.target.value)}
                  placeholder="Name"
                  className="w-full text-[13px] border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blurple"
                />
                <div className="flex gap-1.5">
                  <select
                    value={m.role}
                    onChange={(e) => updateMember(m.id, 'role', e.target.value)}
                    className="text-[12px] border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none"
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input
                    value={m.age}
                    onChange={(e) => updateMember(m.id, 'age', e.target.value)}
                    placeholder="Age"
                    className="w-14 text-[12px] border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none"
                  />
                  <input
                    value={m.notes}
                    onChange={(e) => updateMember(m.id, 'notes', e.target.value)}
                    placeholder="Fav. food, allergies, notes…"
                    className="flex-1 text-[12px] border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none"
                  />
                </div>
              </div>
              <button
                onClick={() => removeMember(m.id)}
                className="text-light hover:text-red-400 transition-colors pt-2 px-1"
              >✕</button>
            </div>
          ))}

          <button
            onClick={addMember}
            className="text-[12px] font-semibold text-blurple hover:opacity-75 transition-opacity"
          >
            + Add person or pet
          </button>

          <textarea
            value={context.notes}
            onChange={(e) => setContext((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Other notes (e.g. we're vegetarian, grandparents live 10 mins away…)"
            rows={2}
            className="w-full text-[13px] border border-border rounded-lg px-3 py-2 bg-white resize-none focus:outline-none focus:ring-1 focus:ring-blurple"
          />

          <div className="flex justify-end">
            <button
              onClick={saveContext}
              disabled={contextSaving}
              className="btn-primary text-[12px] py-1.5 px-4 disabled:opacity-50"
            >
              {contextSaved ? 'Saved ✓' : contextSaving ? 'Saving…' : 'Save'}
            </button>
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
  );
}
