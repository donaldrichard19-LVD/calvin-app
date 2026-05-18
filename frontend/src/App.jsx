import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, useUser, useSignIn, SignIn } from '@clerk/clerk-react';
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
  const { signIn, setActive, isLoaded } = useSignIn();
  const [tryingDemo, setTryingDemo] = useState(false);
  const [demoError, setDemoError]   = useState(null);

  const isDemo = import.meta.env.VITE_IS_DEMO === 'true';

  async function handleTryDemo() {
    if (!isLoaded || tryingDemo) return;
    setTryingDemo(true);
    setDemoError(null);
    try {
      const { token } = await apiFetch('/api/demo/token');
      const result = await signIn.create({ strategy: 'ticket', ticket: token });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      } else {
        setDemoError(`Unexpected status: ${result.status}`);
        setTryingDemo(false);
      }
    } catch (err) {
      setDemoError(err?.errors?.[0]?.longMessage || err?.message || 'Demo sign-in failed — try again.');
      setTryingDemo(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <h1 className="text-4xl font-bold text-dark mb-3">Calvin</h1>
        <p className="text-mid text-lg mb-8 leading-relaxed">
          Stay in sync, work as a team, never drop the ball again.
        </p>

        {isDemo && (
          <>
            <button
              onClick={handleTryDemo}
              disabled={tryingDemo}
              className="btn-primary w-full py-3 text-[15px] mb-2 disabled:opacity-50"
            >
              {tryingDemo ? 'Signing in…' : 'Try the demo'}
            </button>
            {demoError && <p className="text-red-500 text-[12px] mb-3">{demoError}</p>}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] text-light">or sign in with your account</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          </>
        )}

        <SignIn routing="hash" afterSignInUrl="/" />
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
