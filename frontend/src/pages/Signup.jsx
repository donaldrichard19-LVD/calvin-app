import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://calvin-app.onrender.com';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState('');

  const plan = new URLSearchParams(window.location.search).get('plan');

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch(`${API_URL}/api/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, plan: plan || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setStatus('success');
    } catch (err) {
      setErrorMsg(err.message);
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full">

        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-dark">Calvin</h1>
          <p className="text-mid text-[15px] mt-2 leading-relaxed">
            Less Planning Time, More Family Time.
          </p>
        </div>

        <div className="card p-8">
          {status === 'success' ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-4">✅</div>
              <h2 className="text-[18px] font-bold text-dark mb-2">You're on the list</h2>
              <p className="text-mid text-[14px] leading-relaxed">
                We'll be in touch soon with access. In the meantime,{' '}
                <a href="/about" className="text-blurple font-semibold hover:opacity-75">learn more about Calvin</a>.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-[18px] font-bold text-dark mb-1">Request access</h2>
              <p className="text-mid text-[13px] mb-6 leading-relaxed">
                Calvin reads both partners' calendars and inboxes to surface conflicts,
                gaps, and dropped balls — before they become a problem.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[12px] font-semibold text-mid uppercase tracking-wide mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full border border-border rounded-lg px-3 py-2 text-[14px] text-dark bg-white focus:outline-none focus:ring-2 focus:ring-blurple/30 focus:border-blurple"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-mid uppercase tracking-wide mb-1">
                    Email <span className="text-warm-red">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full border border-border rounded-lg px-3 py-2 text-[14px] text-dark bg-white focus:outline-none focus:ring-2 focus:ring-blurple/30 focus:border-blurple"
                  />
                </div>

                {status === 'error' && (
                  <p className="text-[13px] text-warm-red">{errorMsg}</p>
                )}

                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="btn-primary w-full py-2.5 text-[14px]"
                >
                  {status === 'loading' ? 'Submitting…' : 'Request access'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-[12px] text-light text-center mt-4">
          <a href="/privacy" className="hover:text-mid transition-colors">Privacy Policy</a>
          <span className="mx-2">·</span>
          <a href="/terms" className="hover:text-mid transition-colors">Terms of Service</a>
        </p>
      </div>
    </div>
  );
}
