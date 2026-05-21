export default function Terms() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <a href="/" className="text-[13px] text-blurple hover:opacity-75 mb-8 inline-block">← Back to Calvin</a>

        <h1 className="text-3xl font-bold text-dark mb-2">Terms of Service</h1>
        <p className="text-[13px] text-light mb-10">Last updated: May 20, 2026</p>

        <div className="space-y-8 text-[15px] text-dark leading-relaxed">

          <section>
            <h2 className="text-[17px] font-bold mb-3">1. Acceptance of terms</h2>
            <p className="text-mid">By creating an account or using Calvin ("the Service"), you agree to these Terms of Service. If you do not agree, do not use Calvin.</p>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">2. What Calvin does</h2>
            <p className="text-mid">Calvin is a family coordination service that connects to your Google Calendar and Gmail to surface scheduling conflicts, shared alerts, and household briefings. Calvin uses AI (Anthropic Claude) to analyse your data and generate summaries.</p>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">3. Eligibility</h2>
            <p className="text-mid">You must be at least 13 years old to use Calvin. By using the Service you represent that you meet this requirement.</p>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">4. Your account</h2>
            <ul className="space-y-2 list-disc pl-5 text-mid">
              <li>You are responsible for keeping your account credentials secure.</li>
              <li>You are responsible for all activity that occurs under your account.</li>
              <li>You must provide accurate information when creating your account.</li>
              <li>You may not share your account with others outside your household.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">5. Google account connection</h2>
            <p className="text-mid">Connecting your Google account is optional but required for calendar and email analysis features. By connecting, you authorise Calvin to read your Google Calendar events and Gmail metadata (subject lines, senders, snippets) as described in our <a href="/privacy" className="text-blurple hover:opacity-75">Privacy Policy</a>. You can revoke access at any time from Settings.</p>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">6. Acceptable use</h2>
            <p className="text-mid">You agree not to:</p>
            <ul className="space-y-2 list-disc pl-5 text-mid mt-2">
              <li>Use Calvin for any unlawful purpose.</li>
              <li>Attempt to gain unauthorised access to other households' data.</li>
              <li>Interfere with or disrupt the Service or its infrastructure.</li>
              <li>Reverse-engineer or attempt to extract source code from Calvin.</li>
              <li>Use Calvin to harass, abuse, or harm others.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">7. AI-generated content</h2>
            <p className="text-mid">Calvin uses AI to generate briefings, alerts, and summaries. These are provided for informational convenience only. Calvin does not guarantee the accuracy, completeness, or timeliness of AI-generated content. Do not rely solely on Calvin for time-sensitive decisions.</p>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">8. Data and privacy</h2>
            <p className="text-mid">Our collection and use of your data is described in our <a href="/privacy" className="text-blurple hover:opacity-75">Privacy Policy</a>, which is incorporated into these Terms by reference.</p>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">9. Service availability</h2>
            <p className="text-mid">We aim to keep Calvin available but do not guarantee uninterrupted access. We may modify, suspend, or discontinue the Service at any time with reasonable notice where possible.</p>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">10. Termination</h2>
            <p className="text-mid">You may stop using Calvin and delete your account at any time via Settings → Household → Leave household, or by emailing <a href="mailto:hello@calvinai.co" className="text-blurple hover:opacity-75">hello@calvinai.co</a>. We reserve the right to suspend or terminate accounts that violate these Terms.</p>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">11. Disclaimer of warranties</h2>
            <p className="text-mid">Calvin is provided "as is" without warranties of any kind, express or implied. We do not warrant that the Service will be error-free, secure, or continuously available.</p>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">12. Limitation of liability</h2>
            <p className="text-mid">To the fullest extent permitted by law, Calvin and its operators shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service.</p>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">13. Changes to these terms</h2>
            <p className="text-mid">We may update these Terms from time to time. Continued use of Calvin after changes are posted constitutes acceptance of the updated Terms. We will notify users of material changes by email.</p>
          </section>

          <section>
            <h2 className="text-[17px] font-bold mb-3">14. Contact</h2>
            <p className="text-mid">Questions about these Terms? Email us at <a href="mailto:hello@calvinai.co" className="text-blurple hover:opacity-75">hello@calvinai.co</a>.</p>
          </section>

        </div>
      </div>
    </div>
  );
}
