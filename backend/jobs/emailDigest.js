'use strict';
const cron = require('node-cron');
const { supabase } = require('../lib/supabase');
const { sendDigestEmail } = require('../lib/email');
const { SHUTDOWN, blocked } = require('../lib/killSwitch');

async function runEmailDigests() {
  if (SHUTDOWN) { blocked('email digest run'); return; }
  const now = new Date();
  const isMonday = now.getDay() === 1;
  const todayUTC = now.toISOString().slice(0, 10); // YYYY-MM-DD

  const { data: households, error } = await supabase
    .from('households')
    .select('id, digest_email_frequency, digest_last_sent_at')
    .eq('digest_email_enabled', true);

  if (error) { console.error('[digest] Fetch failed:', error.message); return; }
  if (!households?.length) return;

  for (const h of households) {
    if (h.digest_email_frequency === 'weekly' && !isMonday) continue;

    // Atomic claim: only proceed if we successfully set digest_last_sent_at for today.
    // This prevents double-sends when multiple instances or restarts race.
    const { data: claimed, error: claimErr } = await supabase
      .from('households')
      .update({ digest_last_sent_at: now.toISOString() })
      .eq('id', h.id)
      .or(`digest_last_sent_at.is.null,digest_last_sent_at.lt.${todayUTC}`)
      .select('id');

    if (claimErr) {
      console.error(`[digest] Claim failed for household ${h.id}:`, claimErr.message);
      continue;
    }
    if (!claimed?.length) {
      console.log(`[digest] Already sent today for household ${h.id}, skipping`);
      continue;
    }

    try {
      await sendDigestEmail(h.id, h.digest_email_frequency || 'daily');
      console.log(`[digest] Sent ${h.digest_email_frequency} digest for household ${h.id}`);
    } catch (err) {
      // Roll back the claim so it can retry on the next cron tick
      await supabase.from('households').update({ digest_last_sent_at: h.digest_last_sent_at }).eq('id', h.id);
      console.error(`[digest] Failed for household ${h.id}:`, err.message);
    }
  }
}

function startDigestCronJob() {
  if (SHUTDOWN) { blocked('email digest cron scheduling'); return; }
  cron.schedule('0 7 * * *', () => {
    console.log('[digest] Running scheduled email digest');
    runEmailDigests().catch((err) => console.error('[digest] Cron error:', err.message));
  });
  console.log('[digest] Email digest cron scheduled (7am UTC daily)');
}

module.exports = { startDigestCronJob, runEmailDigests };
