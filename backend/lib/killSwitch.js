'use strict';

// ─── Calvin global kill switch ────────────────────────────────────────────────
// Set 2026-07-29 while shutting down the app. While SHUTDOWN is true, every
// analysis run and all outbound email/SMS are blocked at their choke points
// (jobs/analyze.js, jobs/emailDigest.js, lib/twilio.js, lib/email.js,
// lib/google.js sendEmail). To bring the app back online, set SHUTDOWN to false
// (or delete this guard) and redeploy.
const SHUTDOWN = true;

// Logs once per blocked call so the Render logs make the shutdown obvious.
function blocked(label) {
  console.warn(`[shutdown] Blocked ${label} — Calvin kill switch is ON (lib/killSwitch.js).`);
}

module.exports = { SHUTDOWN, blocked };
