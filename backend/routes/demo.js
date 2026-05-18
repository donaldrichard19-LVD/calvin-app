const express = require('express');
const router  = express.Router();
const cors    = require('cors');

const DEMO_EMAIL = 'demo@trycalvin.app';

// Open CORS — this endpoint is intentionally public (demo only)
router.get('/token', cors(), async (req, res) => {
  try {
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) return res.status(500).json({ error: 'Clerk not configured' });

    // Look up the demo user by email
    const listRes = await fetch(
      `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(DEMO_EMAIL)}`,
      { headers: { Authorization: `Bearer ${secret}` } }
    );
    const users = await listRes.json();
    const user  = Array.isArray(users) ? users[0] : null;
    if (!user) return res.status(404).json({ error: 'Demo user not found' });

    // Create a short-lived sign-in token
    const tokenRes = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
      method:  'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ user_id: user.id, expires_in_seconds: 120 }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.token) return res.status(500).json({ error: 'Failed to create sign-in token', detail: tokenData });

    res.json({ token: tokenData.token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
