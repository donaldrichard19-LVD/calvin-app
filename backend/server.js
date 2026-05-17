require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { defaultLimiter } = require('./middleware/rateLimit');
const { startCronJob, runAnalysisForHousehold } = require('./jobs/analyze');

const app = express();

const allowedOrigin = (process.env.FRONTEND_URL || 'http://localhost:5173').trim().replace(/\/$/, '');
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
}));
app.use(express.json());
app.use(defaultLimiter);

app.use('/api/household', require('./routes/household'));
app.use('/api/integrations', require('./routes/integrations'));
app.use('/api/google', require('./routes/google'));
app.use('/api/briefing', require('./routes/briefing'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/sms', require('./routes/sms'));
app.use('/api/calendar', require('./routes/calendar'));

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
});
