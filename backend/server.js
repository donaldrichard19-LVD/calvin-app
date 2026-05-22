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
app.use('/api/sms', require('./routes/sms'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/mcp', require('./routes/mcp'));
app.use('/api/gpt', require('./routes/gpt'));
app.use('/api/waitlist', require('./routes/waitlist'));
app.use('/api/oauth', require('./routes/oauth'));

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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
