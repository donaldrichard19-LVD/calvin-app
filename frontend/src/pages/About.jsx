export default function About() {
  const props = [
    {
      emoji: '📅',
      floatClass: 'animate-float',
      delay: 'animation-delay-[100ms]',
      color: 'from-blurple/10 to-transparent border-blurple/30',
      label: 'Conflicts caught early',
      body: "Calvin reads both partners’ calendars and inboxes simultaneously — spotting double-bookings, missing coverage, and back-to-back commitments with no travel time before they become a problem.",
    },
    {
      emoji: '🔔',
      floatClass: 'animate-float-slow',
      delay: 'animation-delay-[200ms]',
      color: 'from-amber/10 to-transparent border-amber/30',
      label: 'Actionable alerts, not noise',
      body: 'Every alert is a specific, time-sensitive issue with one suggested next step. No general reminders — only things that will actually cause a problem if nobody acts.',
    },
    {
      emoji: '🔄',
      floatClass: 'animate-float',
      delay: 'animation-delay-[300ms]',
      color: 'from-green/10 to-transparent border-green/30',
      label: 'Self-resolving',
      body: 'When you create an event, complete a pickup, or tick off a task, Calvin detects it and clears the alert automatically. No manual cleanup needed.',
    },
    {
      emoji: '🤝',
      floatClass: 'animate-float-slow',
      delay: 'animation-delay-[400ms]',
      color: 'from-coral/10 to-transparent border-coral/30',
      label: 'Both partners, one picture',
      body: "Calvin flags when one partner knows something the other doesn't — medication schedules, vet visits, school pickups — so nothing falls through the cracks.",
    },
  ];

  return (
    <div className="min-h-screen bg-white text-blurple overflow-x-hidden">

      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center justify-center min-h-[90vh] px-6 text-center">

        {/* Soft radial glow behind hero */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 70% 50% at 50% 40%, rgba(88,101,242,0.08) 0%, transparent 70%)',
          }}
        />

        {/* Floating emoji cluster */}
        <div className="relative mb-10 h-32 w-64 mx-auto select-none">
          <span
            className="absolute text-5xl animate-float"
            style={{ top: 0, left: '50%', transform: 'translateX(-50%)', animationDelay: '0s' }}
          >
            📅
          </span>
          <span
            className="absolute text-3xl animate-float-slow"
            style={{ top: 16, left: 8, animationDelay: '0.6s' }}
          >
            📬
          </span>
          <span
            className="absolute text-3xl animate-float"
            style={{ top: 16, right: 8, animationDelay: '1.1s' }}
          >
            ✅
          </span>
          <span
            className="absolute text-2xl animate-float-slow"
            style={{ bottom: 0, left: '50%', transform: 'translateX(-50%)', animationDelay: '0.3s' }}
          >
            🔔
          </span>
        </div>

        <h1
          className="w-full text-center text-5xl sm:text-6xl font-extrabold tracking-tight animate-fade-in-up mb-4"
          style={{ animationDelay: '0.05s' }}
        >
          Calvin
        </h1>

        <p
          className="text-xl sm:text-2xl font-medium text-blurple/70 animate-fade-in-up max-w-xl leading-snug"
          style={{ animationDelay: '0.15s' }}
        >
          Never drop the ball again.
        </p>

        <p
          className="mt-5 text-blurple/60 text-[15px] max-w-md leading-relaxed animate-fade-in-up"
          style={{ animationDelay: '0.25s' }}
        >
          Calvin works quietly in the background — reading both partners' calendars
          and inboxes to surface the things that need attention, before they become a problem.
        </p>

        <div
          className="mt-10 flex flex-col sm:flex-row gap-3 animate-fade-in-up"
          style={{ animationDelay: '0.35s' }}
        >
          <a
            href="/signup"
            className="px-7 py-3 rounded-xl font-semibold text-[15px] bg-blurple hover:bg-blurpleHover transition-colors text-white shadow-lg shadow-blurple/30"
          >
            Request access →
          </a>
          <a
            href="/"
            className="px-7 py-3 rounded-xl font-semibold text-[15px] bg-blurple/10 hover:bg-blurple/15 transition-colors text-blurple border border-blurple/20"
          >
            Sign in
          </a>
        </div>

        {/* Scroll hint */}
        <p
          className="absolute bottom-8 text-blurple/40 text-[13px] animate-fade-in"
          style={{ animationDelay: '1s' }}
        >
          ↓ See how it works
        </p>
      </section>

      {/* ── Value props ── */}
      <section className="px-6 pb-24 max-w-2xl mx-auto">
        <h2
          className="text-center text-2xl sm:text-3xl font-bold text-blurple mb-12 animate-fade-in-up"
          style={{ animationDelay: '0.1s' }}
        >
          What Calvin does
        </h2>

        <div className="space-y-5">
          {props.map((p, i) => (
            <div
              key={p.label}
              className={`animate-fade-in-up rounded-2xl border bg-gradient-to-br ${p.color} p-6 flex gap-5 items-start`}
              style={{ animationDelay: `${0.1 + i * 0.12}s` }}
            >
              <span className={`text-4xl shrink-0 ${p.floatClass}`} style={{ animationDelay: `${i * 0.4}s` }}>
                {p.emoji}
              </span>
              <div>
                <div className="text-[16px] font-bold text-blurple mb-1">{p.label}</div>
                <div className="text-[14px] text-blurple/70 leading-relaxed">{p.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="px-6 pb-24 max-w-2xl mx-auto">
        <h2 className="text-center text-2xl sm:text-3xl font-bold text-blurple mb-12 animate-fade-in-up">
          How it works
        </h2>

        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[22px] top-3 bottom-3 w-px bg-blurple/20" />

          {[
            { emoji: '🔗', step: 'Connect', desc: 'Link your Google Calendar and Gmail. Takes 60 seconds.' },
            { emoji: '🧠', step: 'Analyse', desc: "Calvin scans both partners' data every 90 minutes, looking for conflicts, gaps, and signals." },
            { emoji: '📋', step: 'Surface', desc: 'Actionable alerts appear in your shared briefing — only the things that matter.' },
            { emoji: '✅', step: 'Resolve', desc: 'Act on an alert or just do the thing — Calvin detects it and clears the card automatically.' },
          ].map((s, i) => (
            <div
              key={s.step}
              className="flex gap-5 mb-8 animate-fade-in-up"
              style={{ animationDelay: `${0.1 + i * 0.1}s` }}
            >
              <div className="shrink-0 w-11 h-11 rounded-full bg-blurple/10 border border-blurple/20 flex items-center justify-center text-xl z-10">
                {s.emoji}
              </div>
              <div className="pt-1">
                <div className="text-[15px] font-bold text-blurple">{s.step}</div>
                <div className="text-[14px] text-blurple/60 mt-0.5 leading-relaxed">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="px-6 pb-24 text-center animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
        <div className="inline-block rounded-2xl border border-blurple/20 bg-blurple/5 px-10 py-10 max-w-md">
          <div className="text-3xl mb-4 animate-float">🏠</div>
          <div className="text-[20px] font-bold text-blurple mb-2">Ready to try it?</div>
          <div className="text-blurple/60 text-[14px] mb-6 leading-relaxed">
            Calvin is in early access. Request your spot and we'll add you as soon as a slot opens.
          </div>
          <a
            href="/signup"
            className="inline-block px-8 py-3 rounded-xl font-semibold text-[15px] bg-blurple hover:bg-blurpleHover transition-colors text-white shadow-lg shadow-blurple/30"
          >
            Request access →
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="text-center pb-10 text-[12px] text-blurple/40">
        <a href="/privacy" className="hover:text-blurple/70 transition-colors">Privacy Policy</a>
        <span className="mx-2">·</span>
        <a href="/terms" className="hover:text-blurple/70 transition-colors">Terms of Service</a>
      </footer>

    </div>
  );
}
