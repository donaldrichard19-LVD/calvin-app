import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { apiFetch } from '../lib/api';
import SplashScreen from '../components/SplashScreen';

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function HouseIcon({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      <path d="M36 7L67 33V66H5V33L36 7Z" fill="#5865F2" />
      <rect x="26" y="45" width="20" height="21" rx="2" fill="white" />
      <rect x="9"  y="36" width="15" height="11" rx="2" fill="white" opacity="0.7" />
      <rect x="48" y="36" width="15" height="11" rx="2" fill="white" opacity="0.7" />
      <rect x="50" y="10" width="8"  height="16" rx="1" fill="#4752C4" />
    </svg>
  );
}

function StepDots({ total, current }) {
  return (
    <div className="flex items-center gap-1.5 justify-center mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i === current
              ? 'w-5 h-2 bg-blurple'
              : i < current
              ? 'w-2 h-2 bg-blurple opacity-40'
              : 'w-2 h-2 bg-border'
          }`}
        />
      ))}
    </div>
  );
}

function FormInput({ label, value, onChange, type = 'text', placeholder, hint }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-mid uppercase tracking-wider mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-border rounded-xl px-4 py-3 text-[15px] text-dark bg-white focus:outline-none focus:border-blurple transition-colors"
      />
      {hint && <p className="text-[11px] text-light mt-1">{hint}</p>}
    </div>
  );
}

function ErrorBanner({ message }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 text-[13px] rounded-xl px-4 py-3">
      {message}
    </div>
  );
}

function ConnectedRow({ icon, label, sublabel }) {
  return (
    <div className="step-enter flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
      <span className="text-2xl">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-dark">{label}</div>
        <div className="text-[12px] text-mid truncate">{sublabel}</div>
      </div>
      <span className="text-green-600 text-[18px]">✓</span>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function Spinner({ className = 'w-4 h-4' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ── Main onboarding component ──────────────────────────────────────────────────
//
// Creator flow: 0 (info) → 1 (household/create) → [splash] → 2 (invite) → 3 (connect) → dashboard
// Joiner flow:  0 (info) → 1 (household/join)   → [splash] → 3 (connect)               → dashboard
//   Joiner's connect step is displayed as step 2 in the dot counter.

const IS_DEMO = import.meta.env.VITE_IS_DEMO === 'true';

function trackEvent(event, metadata) {
  apiFetch('/api/funnel/event', {
    method: 'POST',
    body: JSON.stringify({ event, metadata }),
  }).catch(() => {});
}

export default function Onboarding() {
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();

  const [step, setStep]               = useState(0);
  const [flow, setFlow]               = useState(null); // 'create' | 'join'

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone]             = useState('');
  const [inviteCode, setInviteCode]   = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('invite');
    if (fromUrl) {
      sessionStorage.setItem('calvin_invite', fromUrl);
      return fromUrl;
    }
    return sessionStorage.getItem('calvin_invite') || '';
  });
  const [createdCode, setCreatedCode] = useState('');
  const [copied, setCopied]           = useState(false);

  const [demoLoading, setDemoLoading]  = useState(false);
  const [loading, setLoading]         = useState(false);
  const [checking, setChecking]       = useState(true);
  const [showSplash, setShowSplash]   = useState(false);
  const [error, setError]             = useState('');
  const [myIntegration, setMyIntegration] = useState(null);
  const [isConnecting, setIsConnecting]   = useState(false);
  const [googleAccountCount, setGoogleAccountCount] = useState(0);
  const [showSecondAccountPrompt, setShowSecondAccountPrompt] = useState(false);
  const [isConnectingSecond, setIsConnectingSecond] = useState(false);

  const SECOND_ACCOUNT_PROMPT_KEY = 'calvin_second_account_prompt_shown';
  const MAX_GOOGLE_ACCOUNTS = 3;

  const connectError = new URLSearchParams(window.location.search).get('error');

  // Redirect if already in a household
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    apiFetch('/api/household/me')
      .then((data) => {
        if (data.household) {
          navigate('/dashboard', { replace: true });
        } else {
          if (data.partner?.display_name) setDisplayName(data.partner.display_name);
          if (data.partner?.phone) setPhone(data.partner.phone);
          setChecking(false);
          trackEvent('onboarding_started');
        }
      })
      .catch(() => setChecking(false));
  }, [isLoaded, isSignedIn]);

  // Track when the invite-code screen and connect screen are reached
  useEffect(() => {
    if (step === 2) trackEvent('invite_viewed');
  }, [step]);

  // Poll for Google integration once on the connect step
  useEffect(() => {
    const connectStep = 3;
    if (step !== connectStep) return;

    async function poll() {
      try {
        const data = await apiFetch('/api/integrations/household');
        const activeGoogleAccounts = (data || []).filter((i) => i.is_active && i.provider === 'google');
        setGoogleAccountCount(activeGoogleAccounts.length);
        const me = activeGoogleAccounts[0];
        if (me) {
          setMyIntegration((prev) => {
            if (!prev) {
              trackEvent('google_connected');
              maybeShowSecondAccountPrompt(activeGoogleAccounts.length);
            }
            return me;
          });
        }
      } catch {}
    }

    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [step]);

  // ── Action handlers ──────────────────────────────────────────────────────────

  async function handleInfoContinue() {
    if (!displayName.trim()) return setError('Name is required');
    setLoading(true);
    setError('');
    try {
      await apiFetch('/api/household/partner', {
        method: 'PUT',
        body: JSON.stringify({ display_name: displayName.trim(), phone: phone.trim() || null }),
      });
      trackEvent('info_submitted', { has_phone: !!(phone.trim()) });
      setStep(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setLoading(true);
    setError('');
    setFlow('create');
    try {
      const { invite_code } = await apiFetch('/api/household/create', {
        method: 'POST',
        body: JSON.stringify({ name: `${displayName.trim()}'s Household` }),
      });
      trackEvent('household_created');
      setCreatedCode(invite_code);
      setShowSplash(true);
    } catch (err) {
      if (err.message === 'Already in a household') {
        navigate('/dashboard', { replace: true });
        return;
      }
      setError(err.message);
      setFlow(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!inviteCode.trim()) return setError('Enter an invite code');
    sessionStorage.removeItem('calvin_invite');
    setLoading(true);
    setError('');
    setFlow('join');
    try {
      await apiFetch('/api/household/join', {
        method: 'POST',
        body: JSON.stringify({ invite_code: inviteCode.trim() }),
      });
      trackEvent('household_joined');
      setShowSplash(true);
    } catch (err) {
      if (err.message === 'Already in a household') {
        navigate('/dashboard', { replace: true });
        return;
      }
      setError(err.message);
      setFlow(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnectGoogle() {
    setIsConnecting(true);
    setError('');
    trackEvent('google_connect_clicked');
    try {
      const { url } = await apiFetch('/api/google/connect');
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setIsConnecting(false);
    }
  }

  // Shows the "Add another Gmail account" prompt exactly once, the first time
  // myIntegration transitions from null → set. Persists a session flag
  // immediately so it never reappears (re-renders, dismissal, or proceeding
  // all suppress it permanently for this session).
  function maybeShowSecondAccountPrompt(activeCount) {
    if (sessionStorage.getItem(SECOND_ACCOUNT_PROMPT_KEY)) return;
    if (activeCount >= MAX_GOOGLE_ACCOUNTS) return;
    sessionStorage.setItem(SECOND_ACCOUNT_PROMPT_KEY, 'true');
    setShowSecondAccountPrompt(true);
    trackEvent('second_account_prompt_shown');
  }

  function dismissSecondAccountPrompt() {
    setShowSecondAccountPrompt(false);
    trackEvent('second_account_prompt_dismissed');
  }

  async function handleConnectSecondAccount() {
    setIsConnectingSecond(true);
    setError('');
    trackEvent('second_account_connect_clicked');
    try {
      const { url } = await apiFetch('/api/google/connect?mode=add');
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setIsConnectingSecond(false);
    }
  }

  async function handleDemoExplore() {
    setDemoLoading(true);
    try {
      await apiFetch('/api/household/partner', {
        method: 'PUT',
        body: JSON.stringify({ display_name: 'Demo User', phone: null }),
      });
      await apiFetch('/api/household/create', {
        method: 'POST',
        body: JSON.stringify({ name: 'Demo Household' }),
      }).catch(() => {});
      await apiFetch('/api/demo/setup', { method: 'POST' }).catch(() => {});
    } catch {}
    navigate('/dashboard', { replace: true });
  }

  function copyCode() {
    navigator.clipboard.writeText(createdCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Dot counter logic ────────────────────────────────────────────────────────
  // Creators have 4 steps (0–3); joiners have 3 (0–1, then connect shown as 2).
  const totalSteps  = flow === 'join' ? 3 : 4;
  const displayStep = flow === 'join' && step === 3 ? 2 : step;

  // ── Loading / auth gate ──────────────────────────────────────────────────────
  if (!isLoaded || checking) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Spinner className="w-6 h-6 text-blurple" />
      </div>
    );
  }

  if (showSplash) {
    return (
      <SplashScreen
        onComplete={() => {
          setShowSplash(false);
          setStep(flow === 'join' ? 3 : 2);
        }}
      />
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-card p-8">
        <StepDots total={totalSteps} current={displayStep} />

        {/* ── Step 0: Your info ── */}
        {step === 0 && (
          <div key="step-0" className="step-enter space-y-5">
            {IS_DEMO && (
              <button
                onClick={handleDemoExplore}
                disabled={demoLoading}
                className="btn-primary w-full py-3 text-[15px] disabled:opacity-50"
              >
                {demoLoading ? 'Setting up…' : 'Explore demo →'}
              </button>
            )}
            <div className="text-center mb-6">
              <HouseIcon />
              <h1 className="text-[26px] font-bold text-dark mt-4 mb-1">Welcome to Calvin</h1>
              <p className="text-mid text-[15px] leading-relaxed max-w-xs mx-auto">
                Stay in sync, work as a team, never drop the ball again.
              </p>
            </div>
            <FormInput
              label="Your name"
              value={displayName}
              onChange={setDisplayName}
              placeholder="e.g. Alex"
              hint="This is how your partner sees you."
            />
            <FormInput
              label="Your mobile"
              value={phone}
              onChange={setPhone}
              type="tel"
              placeholder="+1 555 000 0000"
              hint="Calvin sends SMS alerts to both partners when it detects issues."
            />
            {error && <ErrorBanner message={error} />}
            <button
              onClick={handleInfoContinue}
              disabled={loading || !displayName.trim()}
              className="btn-primary w-full py-3 text-[15px]"
            >
              {loading ? 'Saving…' : 'Get started →'}
            </button>
          </div>
        )}

        {/* ── Step 1: Household ── */}
        {step === 1 && (
          <div key="step-1" className="step-enter space-y-5">
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">🏡</div>
              <h1 className="text-[22px] font-bold text-dark mb-1">Set up your household</h1>
              <p className="text-mid text-[14px]">
                Create a new household or join one your partner already set up.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="border-2 border-border rounded-xl p-4 hover:border-blurple transition-colors">
                <h3 className="font-bold text-dark text-[14px] mb-1">Start fresh</h3>
                <p className="text-mid text-[12px] mb-4 leading-relaxed">
                  Create a household and invite your partner.
                </p>
                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="btn-primary w-full py-2 text-[13px]"
                >
                  {loading && flow === 'create' ? <span className="flex items-center justify-center gap-2"><Spinner /> Creating…</span> : 'Create household'}
                </button>
              </div>

              <div className="border-2 border-border rounded-xl p-4 hover:border-blurple transition-colors">
                <h3 className="font-bold text-dark text-[14px] mb-1">Join existing</h3>
                <p className="text-mid text-[12px] mb-2 leading-relaxed">Enter your partner's invite code.</p>
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Invite code"
                  className="w-full border border-border rounded-lg px-2 py-1.5 text-[13px] mb-2 focus:outline-none focus:border-blurple"
                />
                <button
                  onClick={handleJoin}
                  disabled={loading || !inviteCode.trim()}
                  className="btn-primary w-full py-2 text-[13px]"
                >
                  {loading && flow === 'join' ? <span className="flex items-center justify-center gap-2"><Spinner /> Joining…</span> : 'Join'}
                </button>
              </div>
            </div>

            {error && <ErrorBanner message={error} />}
            <button onClick={() => { setStep(0); setError(''); }} className="w-full text-[13px] text-mid hover:text-dark text-center py-1">
              ← Back
            </button>
          </div>
        )}

        {/* ── Step 2: Invite partner (creators only) ── */}
        {step === 2 && (
          <div key="step-2" className="step-enter space-y-5">
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">📩</div>
              <h1 className="text-[22px] font-bold text-dark mb-1">Invite your partner</h1>
              <p className="text-mid text-[14px] max-w-xs mx-auto">
                Share this code so your partner can join and connect their accounts.
              </p>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-mid uppercase tracking-wider mb-1">
                Your invite code
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-50 border border-border rounded-xl px-4 py-3 font-mono text-[17px] font-bold text-dark tracking-widest">
                  {createdCode}
                </div>
                <button
                  onClick={copyCode}
                  className={`shrink-0 text-[12px] font-semibold px-3 py-3 rounded-xl border transition-all ${
                    copied
                      ? 'bg-green-50 border-green-300 text-green-700'
                      : 'border-border text-mid hover:border-blurple hover:text-blurple'
                  }`}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-[11px] text-light mt-2">
                Your partner enters this when they sign up at calvin.app
              </p>
            </div>

            <button onClick={() => setStep(3)} className="btn-primary w-full py-3 text-[15px]">
              Continue →
            </button>
            <button onClick={() => setStep(1)} className="w-full text-[13px] text-mid hover:text-dark text-center py-1">
              ← Back
            </button>
          </div>
        )}

        {/* ── Step 3: Connect Google ── */}
        {step === 3 && (
          <div key="step-3" className="step-enter space-y-5">
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">📅</div>
              <h1 className="text-[22px] font-bold text-dark mb-1">Connect your accounts</h1>
              <p className="text-mid text-[14px] max-w-xs mx-auto">
                Calvin reads your calendar and inbox to detect gaps before they become problems.
                It never sends emails or creates events.
              </p>
            </div>

            {connectError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-[13px] rounded-xl px-4 py-3">
                Google connection failed — please try again.
              </div>
            )}

            {!myIntegration ? (
              <>
                <button
                  onClick={handleConnectGoogle}
                  disabled={isConnecting}
                  className="w-full flex items-center justify-center gap-3 border-2 border-border rounded-xl py-3.5 text-[15px] font-semibold text-dark hover:border-blurple hover:bg-blurpleLight transition-all disabled:opacity-60"
                >
                  {isConnecting ? (
                    <><Spinner className="w-4 h-4 text-blurple" /> Redirecting to Google…</>
                  ) : (
                    <><GoogleIcon /> Connect Google Calendar + Gmail</>
                  )}
                </button>
                {error && <ErrorBanner message={error} />}
                <p className="text-[11px] text-center text-light">
                  After connecting you'll land on your dashboard automatically.
                </p>
              </>
            ) : (
              <div className="space-y-3">
                <ConnectedRow icon="📅" label="Google Calendar" sublabel={`Connected as ${myIntegration.account_email}`} />
                <ConnectedRow icon="📧" label="Gmail" sublabel="Scanning for commitments and deadlines" />
              </div>
            )}

            {myIntegration && showSecondAccountPrompt && googleAccountCount < MAX_GOOGLE_ACCOUNTS && (
              <div className="step-enter bg-blurpleLight border border-blurple/20 rounded-xl px-4 py-3 space-y-2">
                <div className="text-[13px] font-semibold text-dark">Add another Gmail account?</div>
                <p className="text-[12px] text-mid leading-relaxed">
                  If you use more than one Google account for work or family, Calvin can watch those calendars and inboxes too.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleConnectSecondAccount}
                    disabled={isConnectingSecond}
                    className="btn-primary text-[12px] py-2 px-3 disabled:opacity-60"
                  >
                    {isConnectingSecond ? 'Redirecting…' : 'Add another Gmail account'}
                  </button>
                  <button
                    onClick={dismissSecondAccountPrompt}
                    className="text-[12px] font-semibold text-mid hover:text-dark transition-colors px-2 py-2"
                  >
                    Maybe later
                  </button>
                </div>
              </div>
            )}

            {myIntegration && (
              <div className="step-enter">
                <button
                  onClick={() => { trackEvent('onboarding_completed'); navigate('/dashboard'); }}
                  className="btn-primary w-full py-3 text-[15px]"
                >
                  Go to dashboard →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Skip link — available on household + invite steps only */}
      {step >= 1 && step <= 2 && (
        <button
          onClick={() => navigate('/dashboard')}
          className="mt-4 text-[12px] text-light hover:text-mid transition-colors"
        >
          Skip for now →
        </button>
      )}
    </div>
  );
}
