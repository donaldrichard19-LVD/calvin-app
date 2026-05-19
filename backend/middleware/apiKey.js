function requireApiKey(req, res, next) {
  const key = req.headers['x-calvin-api-key'];
  const expected = process.env.CALVIN_MCP_API_KEY;
  if (!expected || !key || key !== expected) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  const householdId = req.headers['x-household-id'];
  if (!householdId) {
    return res.status(400).json({ error: 'x-household-id header required' });
  }
  req.householdId = householdId;
  next();
}

module.exports = { requireApiKey };
