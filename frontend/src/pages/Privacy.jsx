export default function Privacy() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <a href="/" className="text-[13px] text-blurple hover:opacity-75 mb-8 inline-block">← Back to Calvin</a>

        <h1 className="text-3xl font-bold text-dark mb-2">Privacy Policy</h1>
        <p className="text-[13px] text-light mb-10">Last updated: May 20, 2026</p>

        <div className="space-y-8 text-[15px] text-dark leading-relaxed">

          <section>
            <h2 className="text-[17px] font-bold mb-3">What is Calvin?</h2>
            <p>Calvin is a family coordination app that helps couples and households stay in sync by surfacing calendar conflicts, inbox signals, and actionable alerts. Calvin connects to your Google Calendar and Gmail to analyse your schedule and generate a shared briefing for your household.</p>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">Information we collect</h2>
            <ul className="space-y-2 list-disc pl-5 text-mid">
              <li><span className="text-dark font-medium">Account information</span> — name and email address provided when you sign up via Clerk.</li>
              <li><span className="text-dark font-medium">Google Calendar data</span> — upcoming events (title, time, location, attendees) for the next 14 days, used to detect scheduling conflicts and generate briefings.</li>
              <li><span className="text-dark font-medium">Gmail metadata</span> — subject lines, sender, recipient, and snippet of recent emails flagged as important, unread, or starred. We do not read the full body of your emails.</li>
              <li><span className="text-dark font-medium">Household context</span> — names, roles, and notes about household members that you voluntarily enter (e.g. children, pets, dietary preferences).</li>
              <li><span className="text-dark font-medium">Phone number</span> — optionally provided for SMS digest notifications.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">How we use your data</h2>
            <ul className="space-y-2 list-disc pl-5 text-mid">
              <li>Detect scheduling conflicts, gaps, and actionable items across your household's calendars and inboxes.</li>
              <li>Generate a shared briefing (alerts) visible to members of your household.</li>
              <li>Send daily or weekly digest emails or SMS summaries at your request.</li>
              <li>Power AI-assisted features via Claude (Anthropic) to analyse and summarise your household's schedule.</li>
            </ul>
            <p className="mt-3 text-mid">We do not sell your data. We do not use your Google data to train machine learning models. We do not share your data with third parties except as described below.</p>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">Google API data</h2>
            <p className="text-mid">Calvin's use of data received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-blurple hover:opacity-75" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
            <ul className="space-y-2 list-disc pl-5 text-mid mt-3">
              <li>Google Calendar and Gmail data is used solely to provide Calvin's coordination and briefing features.</li>
              <li>We do not transfer your Google data to third parties except to Anthropic (Claude AI) for analysis, and only for the purpose of generating your household briefing.</li>
              <li>We do not use Google data for advertising or to train AI models.</li>
              <li>OAuth tokens are encrypted at rest using AES-256 encryption.</li>
              <li>You can disconnect your Google account at any time from Calvin's Settings page, which immediately revokes our access.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">Data storage and security</h2>
            <ul className="space-y-2 list-disc pl-5 text-mid">
              <li>Data is stored in Supabase (PostgreSQL), hosted in the United States.</li>
              <li>Google OAuth tokens are encrypted using AES-256 before being stored.</li>
              <li>All data is transmitted over HTTPS.</li>
              <li>Access to your household data is restricted to authenticated members of your household.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">Third-party services</h2>
            <ul className="space-y-2 list-disc pl-5 text-mid">
              <li><span className="text-dark font-medium">Clerk</span> — authentication and user management.</li>
              <li><span className="text-dark font-medium">Anthropic (Claude)</span> — AI analysis of calendar and email data to generate briefings.</li>
              <li><span className="text-dark font-medium">Supabase</span> — database and storage.</li>
              <li><span className="text-dark font-medium">Twilio</span> — SMS digest delivery (only if you provide a phone number).</li>
              <li><span className="text-dark font-medium">Resend</span> — email digest delivery.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">Your rights</h2>
            <ul className="space-y-2 list-disc pl-5 text-mid">
              <li><span className="text-dark font-medium">Disconnect Google</span> — revoke Calvin's access to your Google account at any time via Settings → Google Calendar &amp; Gmail → Disconnect.</li>
              <li><span className="text-dark font-medium">Leave household</span> — remove yourself from a household and delete your partner record via Settings → Household → Leave household.</li>
              <li><span className="text-dark font-medium">Delete your data</span> — to request full deletion of your account and associated data, email us at <a href="mailto:hello@calvinai.co" className="text-blurple hover:opacity-75">hello@calvinai.co</a>.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">Children's privacy</h2>
            <p className="text-mid">Calvin is not directed at children under 13. We do not knowingly collect personal information from children under 13.</p>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">Changes to this policy</h2>
            <p className="text-mid">We may update this policy as Calvin evolves. We'll notify household members by email if we make material changes.</p>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">Contact</h2>
            <p className="text-mid">Questions or requests? Email us at <a href="mailto:hello@calvinai.co" className="text-blurple hover:opacity-75">hello@calvinai.co</a>.</p>
          </section>

        </div>
      </div>
    </div>
  );
}
