import React, { useState } from 'react';
import { apiFetch } from '../lib/api';

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export default function InviteModal({ inviteCode, onClose }) {
  const [tab, setTab]       = useState('sms');
  const [name, setName]     = useState('');
  const [phone, setPhone]   = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent]     = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError]   = useState('');

  const origin    = window.location.origin;
  const signupUrl = `${origin}?invite=${inviteCode}`;

  async function handleSend() {
    if (!phone.trim()) return setError('Phone number is required');
    setSending(true);
    setError('');
    try {
      await apiFetch('/api/sms/invite', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() || null, phone: phone.trim() }),
      });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(signupUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="relative bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-xl p-6 animate-[slideUp_0.25s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[17px] font-bold text-dark">Invite your partner</h2>
          <button onClick={onClose} className="text-light hover:text-dark transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
          {[['sms', 'Send SMS'], ['link', 'Copy link']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => { setTab(val); setSent(false); setError(''); }}
              className={`flex-1 text-[13px] font-semibold py-1.5 rounded-lg transition-all ${
                tab === val ? 'bg-white text-dark shadow-sm' : 'text-mid hover:text-dark'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* SMS tab */}
        {tab === 'sms' && (
          <div className="space-y-3">
            {sent ? (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="text-4xl mb-3">✓</div>
                <p className="font-semibold text-dark">Invite sent!</p>
                <p className="text-[13px] text-mid mt-1">They'll get an SMS with a sign-up link.</p>
                <button onClick={onClose} className="btn-primary mt-5 px-6 py-2 text-[14px]">Done</button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-mid uppercase tracking-wider mb-1">
                    Their name <span className="normal-case font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Jamie"
                    className="w-full border border-border rounded-xl px-4 py-3 text-[15px] text-dark focus:outline-none focus:border-blurple transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-mid uppercase tracking-wider mb-1">
                    Their mobile
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 555 000 0000"
                    className="w-full border border-border rounded-xl px-4 py-3 text-[15px] text-dark focus:outline-none focus:border-blurple transition-colors"
                  />
                </div>
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-[13px] rounded-xl px-4 py-3">
                    {error}
                  </div>
                )}
                <button
                  onClick={handleSend}
                  disabled={sending || !phone.trim()}
                  className="btn-primary w-full py-3 text-[15px] flex items-center justify-center gap-2"
                >
                  {sending ? <><Spinner /> Sending…</> : 'Send invite'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Copy link tab */}
        {tab === 'link' && (
          <div className="space-y-4">
            <p className="text-[13px] text-mid leading-relaxed">
              Share this link — it opens Calvin and pre-fills their invite code automatically.
            </p>
            <div className="bg-gray-50 border border-border rounded-xl px-4 py-3 text-[13px] text-dark font-mono break-all">
              {signupUrl}
            </div>
            <button
              onClick={copyLink}
              className={`w-full py-3 text-[15px] font-semibold rounded-xl border-2 transition-all ${
                copied
                  ? 'border-green-300 bg-green-50 text-green-700'
                  : 'border-border text-dark hover:border-blurple hover:text-blurple'
              }`}
            >
              {copied ? '✓ Copied!' : 'Copy link'}
            </button>
            <div className="text-center">
              <p className="text-[11px] text-light">Invite code</p>
              <p className="font-mono font-bold text-dark text-[18px] tracking-widest mt-0.5">{inviteCode}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
