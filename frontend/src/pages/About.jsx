export default function About() {
  const featureCards = [
    {
      emoji: '📅',
      color: 'from-blurple/10 to-transparent border-blurple/30',
      label: 'Conflicts caught early',
      body: "Calvin reads both partners' calendars and inboxes simultaneously — spotting double-bookings, missing coverage, and back-to-back commitments with no travel time before they become a problem.",
    },
    {
      emoji: '🔔',
      color: 'from-amber/10 to-transparent border-amber/30',
      label: 'Actionable alerts, not noise',
      body: 'Every alert is a specific, time-sensitive issue with one suggested next step. No general reminders — only things that will actually cause a problem if nobody acts.',
    },
    {
      emoji: '🔄',
      color: 'from-green/10 to-transparent border-green/30',
      label: 'Self-resolving',
      body: "When Calvin spots a confirmation email — a pickup, a delivery — it cancels the calendar event for you and clears the alert. Changed your mind? Undo it with one tap.",
    },
    {
      emoji: '🤝',
      color: 'from-coral/10 to-transparent border-coral/30',
      label: 'Both partners, one picture',
      body: "Calvin flags when one partner knows something the other doesn't — medication schedules, vet visits, school pickups — so nothing falls through the cracks.",
    },
    {
      emoji: '💬',
      color: 'from-blurple/10 to-transparent border-blurple/30',
      label: 'Just ask',
      body: "Tell Calvin to schedule something, draft a reply, or remind you about it later — right from the chat. It handles the busywork so you don't have to switch apps.",
    },
  ];

  const orbitKeyframes = `
    @keyframes orbit-cw { to { transform: rotate(360deg); } }
    @keyframes orbit-ccw { to { transform: rotate(-360deg); } }
  `;

  const outerEmojis = [
    { emoji: '🏫', angle: 0 },
    { emoji: '👨‍⚕️', angle: 90 },
    { emoji: '⚽', angle: 180 },
    { emoji: '📅', angle: 270 },
  ];

  const innerEmojis = [
    { emoji: '🚗', angle: 45 },
    { emoji: '📬', angle: 135 },
    { emoji: '✅', angle: 225 },
    { emoji: '🏃', angle: 315 },
  ];

  function orbitPos(angle, r) {
    const rad = (angle * Math.PI) / 180;
    return { x: Math.round(r * Math.sin(rad)), y: Math.round(-r * Math.cos(rad)) };
  }

  return (
    <div className="min-h-screen bg-white text-blurple overflow-x-hidden">
      <style>{orbitKeyframes}</style>

      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-4 py-3 flex items-center justify-between bg-white/90 backdrop-blur-sm border-b border-blurple/8">
        {/* Logo pill */}
        <a href="/about" className="bg-blurple text-white px-5 py-2 rounded-full font-bold text-[14px] tracking-tight hover:bg-blurpleHover transition-colors">
          Calvin
        </a>

        {/* Center nav pill */}
        <div className="hidden sm:flex items-center gap-0.5 bg-blurple/5 border border-blurple/12 rounded-full px-1.5 py-1">
          <a href="#features" className="px-4 py-1.5 text-[13px] text-blurple/65 hover:text-blurple hover:bg-blurple/8 transition-colors rounded-full">
            Features
          </a>
          <a href="#how-it-works" className="px-4 py-1.5 text-[13px] text-blurple/65 hover:text-blurple hover:bg-blurple/8 transition-colors rounded-full">
            How it works
          </a>
          <a href="#pricing" className="px-4 py-1.5 text-[13px] text-blurple/65 hover:text-blurple hover:bg-blurple/8 transition-colors rounded-full">
            Pricing
          </a>
        </div>

        {/* Auth controls */}
        <div className="flex items-center gap-2">
          <a href="/" className="px-4 py-2 text-[13px] font-medium text-blurple/70 hover:text-blurple transition-colors">
            Sign in
          </a>
          <a href="/signup" className="px-4 py-2 text-[13px] font-semibold bg-blurple text-white rounded-full hover:bg-blurpleHover transition-colors shadow-sm shadow-blurple/30">
            Sign up
          </a>
        </div>
      </nav>

      {/* ── Hero — two-column editorial ── */}
      <section className="pt-24 pb-16 px-6">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center min-h-[85vh]">

          {/* Left: editorial copy */}
          <div className="animate-fade-in-up">
            <div className="text-[11px] font-semibold text-blurple/45 uppercase tracking-[0.2em] mb-6">
              Family coordination, simplified
            </div>
            <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-[1.08] mb-6">
              Less{' '}
              <span className="bg-blurple/10 text-blurple px-2 py-0.5 rounded-lg">Planning</span>
              {' '}Time,
              <br />
              More{' '}
              <span className="bg-green/10 text-green px-2 py-0.5 rounded-lg">Family</span>
              {' '}Time.
            </h1>
            <p className="text-[17px] text-blurple/60 leading-relaxed mb-8 max-w-md">
              Calvin works quietly in the background — reading both partners' calendars
              and inboxes to surface the things that need attention, before they become a problem.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href="/signup"
                className="px-7 py-3 rounded-xl font-semibold text-[15px] bg-blurple hover:bg-blurpleHover transition-colors text-white shadow-lg shadow-blurple/30 text-center"
              >
                Request access →
              </a>
              <a
                href="/"
                className="px-7 py-3 rounded-xl font-semibold text-[15px] bg-blurple/8 hover:bg-blurple/14 transition-colors text-blurple border border-blurple/20 text-center"
              >
                Sign in
              </a>
            </div>
          </div>

          {/* Right: orbital visual */}
          <div className="flex justify-center items-center">
            <div
              className="relative select-none"
              style={{ width: 260, height: 260 }}
            >
              {/* Ring guides */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div style={{ width: 200, height: 200, borderRadius: '50%', border: '1px solid rgba(88,101,242,0.2)' }} />
              </div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div style={{ width: 120, height: 120, borderRadius: '50%', border: '1px solid rgba(88,101,242,0.15)' }} />
              </div>

              {/* Central bell */}
              <div className="absolute inset-0 flex items-center justify-center text-5xl z-10">🔔</div>

              {/* Outer ring — clockwise */}
              <div className="absolute inset-0" style={{ animation: 'orbit-cw 24s linear infinite' }}>
                {outerEmojis.map(({ emoji, angle }) => {
                  const { x, y } = orbitPos(angle, 100);
                  return (
                    <span
                      key={emoji}
                      style={{ position: 'absolute', left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, transform: 'translate(-50%, -50%)' }}
                    >
                      <span className="text-2xl block" style={{ animation: 'orbit-ccw 24s linear infinite', lineHeight: 1 }}>
                        {emoji}
                      </span>
                    </span>
                  );
                })}
              </div>

              {/* Inner ring — counter-clockwise */}
              <div className="absolute inset-0" style={{ animation: 'orbit-ccw 18s linear infinite' }}>
                {innerEmojis.map(({ emoji, angle }) => {
                  const { x, y } = orbitPos(angle, 60);
                  return (
                    <span
                      key={emoji}
                      style={{ position: 'absolute', left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, transform: 'translate(-50%, -50%)' }}
                    >
                      <span className="text-xl block" style={{ animation: 'orbit-cw 18s linear infinite', lineHeight: 1 }}>
                        {emoji}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="text-center mt-4">
          <p className="text-blurple/35 text-[13px] animate-fade-in" style={{ animationDelay: '1s' }}>
            ↓ See how it works
          </p>
        </div>
      </section>

      {/* ── Morning Briefing Showcase ── */}
      <section className="px-6 pb-24">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-blurple mb-3">Your morning, handled</h2>
            <p className="text-blurple/55 text-[15px]">
              Calvin delivers a coordinated briefing every morning so you're never caught off guard.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 items-start">
            {/* Routine config card */}
            <div className="rounded-2xl border border-blurple/15 bg-blurple/4 p-6">
              <div className="text-[11px] font-semibold text-blurple/45 uppercase tracking-[0.15em] mb-5">
                Morning routine
              </div>
              <div className="space-y-1">
                {[
                  { label: 'Briefing time', value: '7:30 AM' },
                  { label: 'Delivery', value: 'Email + SMS' },
                  { label: 'Lookahead window', value: '48 hours' },
                  { label: 'Partners synced', value: 'Sarah & James' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-3 border-b border-blurple/8 last:border-0">
                    <span className="text-[13px] text-blurple/55">{label}</span>
                    <span className="text-[13px] font-semibold text-blurple bg-blurple/10 px-3 py-1 rounded-full">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Briefing email preview */}
            <div className="rounded-2xl border border-blurple/15 bg-white shadow-card p-6">
              <div className="font-mono text-[11px] text-blurple/35 space-y-0.5 mb-4">
                <div>From: Calvin &lt;briefing@calvinai.co&gt;</div>
                <div>To: sarah@email.com</div>
                <div className="font-semibold text-blurple/50">Subject: Your 7:30 AM family briefing — Tuesday</div>
              </div>
              <div className="border-t border-blurple/10 pt-4 space-y-3">
                <div className="text-[14px] font-bold text-blurple">Good morning, Sarah 👋</div>
                <div className="text-[12px] text-blurple/55 mb-3">
                  Here's what needs your attention today.
                </div>
                <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                  <div className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-1">🔴 High priority</div>
                  <div className="text-[12px] text-red-800 leading-relaxed">
                    James has a dentist appt at 3 pm — but you're scheduled to pick up Lily at 3:15 pm. One of you needs to adjust.
                  </div>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                  <div className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mb-1">🟡 Heads up</div>
                  <div className="text-[12px] text-amber-800 leading-relaxed">
                    Soccer practice moved to 4 pm per last night's email. Calendar still shows 3 pm.
                  </div>
                </div>
                <div className="rounded-xl bg-green-50 border border-green-200 p-3">
                  <div className="text-[10px] font-semibold text-green-600 uppercase tracking-wider mb-1">✅ Auto-resolved</div>
                  <div className="text-[12px] text-green-800 leading-relaxed">
                    Grocery delivery confirmed for Wednesday noon. Pantry event auto-cancelled.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features / Calvin Actions ── */}
      <section id="features" className="px-6 pb-24">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-center text-2xl sm:text-3xl font-bold text-blurple mb-3">
            Calvin Actions
          </h2>
          <p className="text-center text-blurple/55 text-[15px] mb-12">
            Calvin doesn't just alert you — it can take action on your behalf.
          </p>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              {
                emoji: '📅',
                title: 'Calendar management',
                desc: 'Calvin can create, update, or cancel events based on what it finds in your emails and alerts.',
              },
              {
                emoji: '✉️',
                title: 'Automated email replies',
                desc: 'Draft or send responses to common threads — pickups, appointments, school communications.',
              },
              {
                emoji: '🔁',
                title: 'Recurring reminders',
                desc: 'Set up repeating nudges for things like medication, bills, or weekly planning sessions.',
              },
            ].map(({ emoji, title, desc }) => (
              <div key={title} className="rounded-2xl border border-blurple/15 bg-blurple/4 p-6 flex flex-col gap-3">
                <div className="text-3xl">{emoji}</div>
                <div className="text-[15px] font-bold text-blurple">{title}</div>
                <div className="text-[13px] text-blurple/60 leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="px-6 pb-24 max-w-2xl mx-auto">
        <h2 className="text-center text-2xl sm:text-3xl font-bold text-blurple mb-12">
          How it works
        </h2>
        <div className="relative">
          <div className="absolute left-[22px] top-3 bottom-3 w-px bg-blurple/20" />
          {[
            { emoji: '🔗', step: 'Connect', desc: 'Link your Google Calendar and Gmail, then invite your partner — Calvin needs both sides of the household to do its job.' },
            { emoji: '🧠', step: 'Analyse', desc: "Calvin scans both partners' data throughout the day, looking for conflicts, gaps, and signals." },
            { emoji: '📋', step: 'Surface', desc: 'Actionable alerts appear in your shared briefing — as a card, a text, or an email digest, however you want them.' },
            { emoji: '✅', step: 'Resolve', desc: 'Act on an alert, ask Calvin to handle it, or just do the thing yourself — either way, the card clears automatically.' },
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

      {/* ── Why Choose Calvin ── */}
      <section className="px-6 pb-24 max-w-2xl mx-auto">
        <h2 className="text-center text-2xl sm:text-3xl font-bold text-blurple mb-12 animate-fade-in-up">
          Why Choose Calvin
        </h2>
        <div className="space-y-5">
          {featureCards.map((p, i) => (
            <div
              key={p.label}
              className={`animate-fade-in-up rounded-2xl border bg-gradient-to-br ${p.color} p-6 flex gap-5 items-start`}
              style={{ animationDelay: `${0.1 + i * 0.12}s` }}
            >
              <span className="text-4xl shrink-0">{p.emoji}</span>
              <div>
                <div className="text-[16px] font-bold text-blurple mb-1">{p.label}</div>
                <div className="text-[14px] text-blurple/70 leading-relaxed">{p.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="px-6 pb-24">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-center text-2xl sm:text-3xl font-bold text-blurple mb-3">Pricing</h2>
          <p className="text-center text-blurple/55 text-[15px] mb-12">
            Simple, transparent pricing. No hidden fees.
          </p>
          <div className="grid sm:grid-cols-2 gap-6">

            {/* Free tier */}
            <div className="rounded-2xl border border-blurple/20 bg-blurple/4 p-8 flex flex-col">
              <div className="text-[11px] font-semibold text-blurple/45 uppercase tracking-[0.15em] mb-3">Free</div>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-extrabold text-blurple">$0</span>
              </div>
              <div className="text-blurple/45 text-[13px] mb-8">Forever</div>
              <ul className="space-y-2.5 mb-8 flex-1">
                {[
                  'Morning briefing email',
                  'One household (2 partners)',
                  'Basic conflict detection',
                ].map(item => (
                  <li key={item} className="flex items-center gap-2.5 text-[13px] text-blurple/70">
                    <span className="text-green font-bold">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href="/signup?plan=free"
                className="block w-full text-center px-6 py-3 rounded-xl font-semibold text-[14px] border border-blurple/25 text-blurple hover:bg-blurple/8 transition-colors"
              >
                Get started
              </a>
            </div>

            {/* Pro tier */}
            <div className="rounded-2xl border-2 border-blurple bg-blurple p-8 flex flex-col shadow-xl shadow-blurple/25">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] font-semibold text-white/55 uppercase tracking-[0.15em]">Pro</div>
                <span className="text-[11px] font-semibold bg-white/20 text-white px-2.5 py-1 rounded-full">Most popular</span>
              </div>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-extrabold text-white">$5</span>
                <span className="text-white/60 text-[14px] mb-1">/month</span>
              </div>
              <div className="text-white/45 text-[13px] mb-8">Per household</div>
              <ul className="space-y-2.5 mb-8 flex-1">
                {[
                  'Everything in Free',
                  'SMS + email digest',
                  'Agent actions (calendar, replies)',
                  'Auto-resolve from emails',
                  'Conversational chat (Ask Calvin)',
                  'Recurring reminders',
                ].map(item => (
                  <li key={item} className="flex items-center gap-2.5 text-[13px] text-white/85">
                    <span className="text-green-300 font-bold">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href="/signup?plan=pro"
                className="block w-full text-center px-6 py-3 rounded-xl font-semibold text-[14px] bg-white text-blurple hover:bg-white/92 transition-colors"
              >
                Get started →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="px-6 pb-24 text-center animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
        <div className="inline-block rounded-2xl border border-blurple/20 bg-blurple/5 px-10 py-10 max-w-md">
          <div className="text-3xl mb-4">🏠</div>
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
