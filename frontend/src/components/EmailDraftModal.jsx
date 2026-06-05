import React, { useState } from 'react';
import { apiFetch } from '../lib/api';

export default function EmailDraftModal({ draft, onClose, onSent }) {
  const [to, setTo] = useState(draft.to || '');
  const [subject, setSubject] = useState(draft.subject || '');
  const [body, setBody] = useState(draft.body || '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  async function handleSend() {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await apiFetch('/api/email/send', {
        method: 'POST',
        body: JSON.stringify({ to, subject, body }),
      });
      onSent(`Email sent to ${to} ✓`);
    } catch (err) {
      setError(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: '#fff', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-black/6">
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] flex items-center justify-center w-5 h-5 rounded-full shrink-0"
              style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
            >
              ✨
            </span>
            <span className="text-[13px] font-semibold text-dark">Review email draft</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-light hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* To */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#9CA3AF' }}>To</label>
            <input
              type="email"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] text-dark focus:outline-none focus:border-indigo-400 transition-colors"
              placeholder="recipient@email.com"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#9CA3AF' }}>Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] text-dark focus:outline-none focus:border-indigo-400 transition-colors"
              placeholder="Email subject"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#9CA3AF' }}>Message</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={7}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] text-dark leading-relaxed focus:outline-none focus:border-indigo-400 transition-colors resize-none"
              placeholder="Email body"
            />
          </div>

          {error && (
            <p className="text-[12px] text-red-500 rounded-xl bg-red-50 px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 pb-5 pt-1 gap-3">
          <button
            onClick={onClose}
            className="text-[13px] font-medium text-mid px-4 py-2 rounded-full border border-border hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !to || !subject || !body}
            className="flex items-center gap-2 text-[13px] font-semibold text-white px-5 py-2 rounded-full transition-colors disabled:opacity-60"
            style={{ background: '#3730A3' }}
            onMouseEnter={e => { if (!sending) e.currentTarget.style.background = '#312E81'; }}
            onMouseLeave={e => { if (!sending) e.currentTarget.style.background = '#3730A3'; }}
          >
            {sending ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Sending…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Send email
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
