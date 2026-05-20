import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, useUser, SignIn, SignUp } from '@clerk/clerk-react';
import { setTokenGetter } from './lib/api';
import { apiFetch } from './lib/api';
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';

function TokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setTokenGetter((skipCache) => getToken(skipCache ? { skipCache: true } : undefined));
  }, [getToken]);
  return null;
}

function RootRedirect() {
  const { isSignedIn, isLoaded } = useAuth();
  const [checking, setChecking] = useState(true);
  const [hasHousehold, setHasHousehold] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setChecking(false);
      return;
    }
    apiFetch('/api/household/me')
      .then((data) => {
        setHasHousehold(!!data.household);
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [isSignedIn, isLoaded]);

  if (!isLoaded || checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="text-mid text-sm">Loading…</div>
      </div>
    );
  }

  if (!isSignedIn) return <LandingPage />;
  if (!hasHousehold) return <Navigate to="/onboarding" replace />;
  return <Navigate to="/dashboard" replace />;
}

function LandingPage() {
  const isDemo = import.meta.env.VITE_IS_DEMO === 'true';
  const [mode, setMode] = useState('signin');
  const [copied, setCopied] = useState(null);

  function copy(value, field) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <h1 className="text-4xl font-bold text-dark mb-3">Calvin</h1>
        <p className="text-mid text-lg mb-8 leading-relaxed">
          Stay in sync, work as a team, never drop the ball again.
        </p>

        {isDemo && (
          <div className="card p-4 mb-6 text-left space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-light mb-3">Demo credentials</p>
            {[
              { label: 'Email', value: 'demo@trycalvin.app', field: 'email' },
              { label: 'Password', value: 'calvindemoapp', field: 'password' },
            ].map(({ label, value, field }) => (
              <div key={field} className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] text-light">{label}</div>
                  <div className="text-[14px] font-medium text-dark font-mono">{value}</div>
                </div>
                <button
                  onClick={() => copy(value, field)}
                  className="text-[12px] font-semibold text-blurple hover:opacity-75 shrink-0"
                >
                  {copied === field ? 'Copied!' : 'Copy'}
                </button>
              </div>
            ))}
          </div>
        )}

        {mode === 'signin' ? (
          <SignIn
            routing="hash"
            afterSignInUrl="/"
            afterSignUpUrl="/"
            appearance={{ elements: { footerAction: { display: 'none' } } }}
          />
        ) : (
          <SignUp
            routing="hash"
            afterSignUpUrl="/"
            afterSignInUrl="/"
            appearance={{ elements: { footerAction: { display: 'none' } } }}
          />
        )}

        <p className="text-[13px] text-mid mt-4">
          {mode === 'signin' ? (
            <>Don't have an account?{' '}
              <button onClick={() => setMode('signup')} className="text-blurple font-semibold hover:opacity-75">
                Sign up
              </button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button onClick={() => setMode('signin')} className="text-blurple font-semibold hover:opacity-75">
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (!isSignedIn) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <TokenBridge />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
