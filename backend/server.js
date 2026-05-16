require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { defaultLimiter } = require('./middleware/rateLimit');
const { startCronJob } = require('./jobs/analyze');

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
