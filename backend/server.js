require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { defaultLimiter } = require('./middleware/rateLimit');
const { startCronJob, runAnalysisForHousehold } = require('./jobs/analyze');
const { startDigestCronJob } = require('./jobs/emailDigest');

const app = express();

app.set('trust proxy', 1);

const allowedOrigin = (process.env.FRONTEND_URL || 'http://localhost:5173').trim().replace(/\/$/, '');
app.use(cors({
  origin: (origin, cb) => {
    // Allow the frontend, Anthropic/Claude OAuth redirect, MCP cloud proxy, and server-to-server calls
    if (
      !origin ||
      origin === allowedOrigin ||
      origin.endsWith('.anthropic.com') ||
      origin.endsWith('.claude.ai') ||
      origin === 'https://claude.ai'
    ) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
// Webhook routes need raw body for signature verification — must come before express.json()
app.use('/api/webhooks', express.raw({ type: 'application/json' }), require('./routes/webhooks'));

// MCP HTTP transport — must handle raw body before express.json() for SSE negotiation
app.use('/mcp', require('./routes/mcpHttp'));

app.use(express.json());
app.use(defaultLimiter);

app.use('/api/demo',      require('./routes/demo'));
app.use('/api/household', require('./routes/household'));
app.use('/api/integrations', require('./routes/integrations'));
app.use('/api/google', require('./routes/google'));
app.use('/api/briefing', require('./routes/briefing'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/email', require('./routes/email'));
app.use('/api/sms', require('./routes/sms'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/mcp', require('./routes/mcp'));
app.use('/api/gpt', require('./routes/gpt'));
app.use('/api/waitlist', require('./routes/waitlist'));
app.use('/api/oauth', require('./routes/oauth'));
app.use('/api/funnel', require('./routes/funnel'));

const { requireAuth } = require('./middleware/auth');
const { supabase } = require('./lib/supabase');
app.post('/api/analyze/trigger', requireAuth, async (req, res) => {
  try {
    const { data: partner } = await supabase
      .from('partners')
      .select('household_id')
      .eq('clerk_user_id', req.auth.userId)
      .single();
    if (!partner?.household_id) return res.status(400).json({ error: 'No household found' });
    runAnalysisForHousehold(partner.household_id)
      .then(() => console.log('[analyze] Manual trigger completed for', partner.household_id))
      .catch((err) => console.error('[analyze] Manual trigger failed:', err.message));
    res.json({ success: true, message: 'Analysis started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: blast feature-update email to all active users
// Protected by WAITLIST_SECRET token (same pattern as waitlist approval)
app.post('/api/admin/send-feature-update', async (req, res) => {
  const { token } = req.body;
  const secret = process.env.WAITLIST_SECRET || process.env.ENCRYPTION_KEY;
  const expected = require('crypto').createHmac('sha256', secret).update('feature-update-june-2026').digest('hex');
  if (!token || token !== expected) return res.status(403).json({ error: 'Forbidden' });

  const { sendFeatureUpdateEmail } = require('./lib/email');
  const { data: integrations } = await supabase
    .from('integrations')
    .select('account_email, partner_id')
    .eq('provider', 'google')
    .eq('is_active', true)
    .not('account_email', 'is', null);

  if (!integrations?.length) return res.json({ sent: 0 });

  const seen = new Set();
  let sent = 0;
  const errors = [];

  for (const intg of integrations) {
    if (seen.has(intg.account_email)) continue;
    seen.add(intg.account_email);
    try {
      const { data: partner } = await supabase
        .from('partners')
        .select('display_name')
        .eq('id', intg.partner_id)
        .single();
      const firstName = partner?.display_name?.split(' ')[0] || null;
      await sendFeatureUpdateEmail({ email: intg.account_email, firstName });
      sent++;
    } catch (err) {
      errors.push({ email: intg.account_email, error: err.message });
    }
  }

  console.log(`[feature-update] Sent to ${sent} addresses. Errors: ${errors.length}`);
  res.json({ sent, errors });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/manifest.json', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'manifest.json'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Family HQ backend running on http://localhost:${PORT}`);
  startCronJob();
  startDigestCronJob();
});
