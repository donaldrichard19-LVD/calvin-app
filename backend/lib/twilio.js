require('dotenv').config();
const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function sendSMS(to, body) {
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

async function sendAlertSMS(partners, alertTitle) {
  const msg = `Calvin Alert: ${alertTitle}. Open app for details.`;
  await Promise.all(
    partners
      .filter((p) => p.phone)
      .map((p) => sendSMS(p.phone, msg))
  );
}

module.exports = { sendSMS, sendAlertSMS };
