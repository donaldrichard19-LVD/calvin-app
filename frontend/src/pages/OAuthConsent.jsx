import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { apiFetch } from '../lib/api';

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();

  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const state = params.get('state') || '';
  const clientName = params.get('client_name') || 'Claude';

  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [errorMsg, setErrorMsg] = useState('');

  // Redirect to sign-in if not authenticated, preserving the OAuth params
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      navigate(`/sign-in?redirect_url=${encodeURIComponent(window.location.href)}`);
    }
  }, [isLoaded, isSignedIn, navigate]);

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="min-h-screen bg-[#0b1120] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blurple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!clientId || !redirectUri) {
    return (
      <div className="min-h-screen bg-[#0b1120] flex items-center justify-center text-white">
        <p className="text-slate-400">Invalid authorization request.</p>
      </div>
    );
  }

  async function handleAllow() {
    setStatus('loading');
    try {
      const { code } = await apiFetch('/api/oauth/code', {
        method: 'POST',
        body: JSON.stringify({ client_id: clientId, redirect_uri: redirectUri }),
      });
      const dest = new URL(redirectUri);
      dest.searchParams.set('code', code);
      if (state) dest.searchParams.set('state', state);
      window.location.href = dest.toString();
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Something went wrong.');
    }
  }

  function handleDeny() {
    const dest = new URL(redirectUri);
    dest.searchParams.set('error', 'access_denied');
    if (state) dest.searchParams.set('state', state);
    window.location.href = dest.toString();
  }

  return (
    <div className="min-h-screen bg-[#0b1120] flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 text-white text-center">

        {/* Logos */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-blurple/20 border border-blurple/30 flex items-center justify-center text-2xl">
            🏠
          </div>
          <div className="text-slate-500 text-sm">↔</div>
          <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-2xl">
            🤖
          </div>
        </div>

        <h1 className="text-[20px] font-bold mb-2">
          Connect Calvin to {clientName}
        </h1>
        <p className="text-[13px] text-slate-400 mb-6 leading-relaxed">
          {clientName} is requesting access to your Calvin household — alerts, calendar events, and household context.
        </p>

        {/* Permissions list */}
        <ul className="text-left space-y-2 mb-7">
          {[
            ['📋', 'View and manage household alerts'],
            ['📅', 'Read and create calendar events'],
            ['🏠', 'Read household members and context'],
            ['📬', 'Send digest summaries via SMS or email'],
          ].map(([emoji, label]) => (
            <li key={label} className="flex items-center gap-3 text-[13px] text-slate-300">
              <span>{emoji}</span>
              <span>{label}</span>
            </li>
          ))}
        </ul>

        {status === 'error' && (
          <p className="text-red-400 text-[12px] mb-4">{errorMsg}</p>
        )}

        <button
          onClick={handleAllow}
          disabled={status === 'loading'}
          className="w-full py-3 rounded-xl font-semibold text-[15px] bg-blurple hover:bg-blurpleHover transition-colors text-white mb-3 disabled:opacity-50"
        >
          {status === 'loading' ? 'Connecting…' : `Allow ${clientName} access`}
        </button>

        <button
          onClick={handleDeny}
          disabled={status === 'loading'}
          className="w-full py-3 rounded-xl font-semibold text-[14px] bg-white/10 hover:bg-white/15 transition-colors text-slate-300 disabled:opacity-50"
        >
          Deny
        </button>

        <p className="mt-4 text-[11px] text-slate-600">
          You can revoke access at any time in Calvin Settings.
        </p>
      </div>
    </div>
  );
}
