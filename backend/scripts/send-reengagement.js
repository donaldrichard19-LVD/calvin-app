#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClerkClient } = require('@clerk/clerk-sdk-node');
const { supabase } = require('../lib/supabase');
const { sendReengagementEmail } = require('../lib/email');

const SKIP_NAMES = ['Donwill'];

async function main() {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

  const { data: partners, error: pErr } = await supabase
    .from('partners')
    .select('id, clerk_user_id, display_name, household_id');

  if (pErr) throw pErr;

  const { data: integrations, error: iErr } = await supabase
    .from('integrations')
    .select('partner_id')
    .eq('provider', 'google')
    .eq('is_active', true);

  if (iErr) throw iErr;

  const connectedPartnerIds = new Set(integrations.map((i) => i.partner_id));

  const unconnected = partners.filter(
    (p) => p.household_id && !connectedPartnerIds.has(p.id) && !SKIP_NAMES.includes(p.display_name)
  );

  console.log(`Found ${unconnected.length} users to re-engage:\n`);

  for (const partner of unconnected) {
    try {
      const user = await clerk.users.getUser(partner.clerk_user_id);
      const email = user.emailAddresses?.[0]?.emailAddress;

      if (!email) {
        console.log(`  SKIP ${partner.display_name} — no email in Clerk`);
        continue;
      }

      const firstName = partner.display_name?.split(' ')[0] || undefined;
      const result = await sendReengagementEmail({ email, firstName });
      console.log(`  SENT ${partner.display_name} (${email}) — id: ${result.id}`);
    } catch (err) {
      console.error(`  FAIL ${partner.display_name}: ${err.message}`);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
