'use strict';
const cron = require('node-cron');
const { supabase } = require('../lib/supabase');
const { sendDigestEmail } = require('../lib/email');

async function runEmailDigests() {
  const isMonday = new Date().getDay() === 1;

  const { data: households, error } = await supabase
    .from('households')
    .select('id, digest_email_frequency')
    .eq('digest_email_enabled', true);

  if (error) { console.error('[digest] Fetch failed:', error.message); return; }
  if (!households?.length) return;

  for (const h of households) {
    if (h.digest_email_frequency === 'weekly' && !isMonday) continue;
    try {
      await sendDigestEmail(h.id, h.digest_email_frequency || 'daily');
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
