'use strict';
const cron = require('node-cron');
const { supabase } = require('../lib/supabase');
const { sendDigestEmail } = require('../lib/email');

async function runEmailDigests() {
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

    // Skip if already sent today (idempotency guard against double-fires on restart/deploy)
    if (h.digest_last_sent_at && h.digest_last_sent_at.slice(0, 10) === todayUTC) {
      console.log(`[digest] Already sent today for household ${h.id}, skipping`);
      continue;
    }

    try {
      await sendDigestEmail(h.id, h.digest_email_frequency || 'daily');
      await supabase.from('households').update({ digest_last_sent_at: now.toISOString() }).eq('id', h.id);
      console.log(`[digest] Sent ${h.digest_email_frequency} digest for household ${h.id}`);
    } catch (err) {
      console.error(`[digest] Failed for household ${h.id}:`, err.message);
    }
  }
}

function startDigestCronJob() {
  cron.schedule('0 7 * * *', () => {
    console.log('[digest] Running scheduled email digest');
    runEmailDigests().catch((err) => console.error('[digest] Cron error:', err.message));
  });
  console.log('[digest] Email digest cron scheduled (7am UTC daily)');
}

module.exports = { startDigestCronJob, runEmailDigests };
