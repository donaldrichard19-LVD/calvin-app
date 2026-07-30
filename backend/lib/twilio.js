require('dotenv').config();
const twilio = require('twilio');
const { SHUTDOWN, blocked } = require('./killSwitch');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function sendSMS(to, body) {
  if (SHUTDOWN) { blocked('SMS send'); return null; }
  if (!to || !process.env.TWILIO_ACCOUNT_SID) return null;
  const normalized = to.startsWith('+') ? to : `+1${to.replace(/\D/g, '')}`;
  try {
    return await client.messages.create({
      body,
      from: process.env.TWILIO_FROM_NUMBER,
      to: normalized,
    });
  } catch (err) {
    console.error('SMS send error:', err.message);
    return null;
  }
}

async function sendAlertSMS(partners, alertTitle, severity = 'high') {
  const prefix = severity === 'high' ? '🔴 HIGH' : '🟡 MEDIUM';
  const msg = `Calvin ${prefix}: ${alertTitle}. Open the app for details.`;
  await Promise.all(
    partners
      .filter((p) => p.phone)
      .map((p) => sendSMS(p.phone, msg))
  );
}

module.exports = { sendSMS, sendAlertSMS };
