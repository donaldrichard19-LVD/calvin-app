require('dotenv').config();
const { verifyToken } = require('@clerk/backend');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    req.auth = { userId: payload.sub };
    next();
  } catch (err) {
    console.error('[auth] Token verification failed:', err.message);
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { requireAuth };
