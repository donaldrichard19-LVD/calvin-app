import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, useUser, SignIn } from '@clerk/clerk-react';
import { setTokenGetter } from './lib/api';
import { apiFetch } from './lib/api';
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';

function TokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setTokenGetter(() => getToken());
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
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <h1 className="text-4xl font-bold text-dark mb-3">Calvin</h1>
        <p className="text-mid text-lg mb-8 leading-relaxed">
          The shared operating picture for two-adult households. Never drop the ball again.
        </p>
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
