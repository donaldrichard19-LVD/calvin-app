require('dotenv').config();
const { google } = require('googleapis');
const { supabase } = require('./supabase');
const { encrypt, decrypt } = require('./crypto');

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getAuthUrl(partnerId) {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: partnerId,
  });
}

async function getTokensFromCode(code) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
    email: data.email,
  };
}

async function refreshIfNeeded(integration) {
  const expiryDate = integration.token_expiry
    ? new Date(integration.token_expiry).getTime()
    : 0;
  const fiveMinutes = 5 * 60 * 1000;
  const needsRefresh = Date.now() >= expiryDate - fiveMinutes;

  if (!needsRefresh) {
    return decrypt(integration.access_token);
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    refresh_token: decrypt(integration.refresh_token),
  });

  const { credentials } = await oauth2Client.refreshAccessToken();

  await supabase
    .from('integrations')
    .update({
      access_token: encrypt(credentials.access_token),
      token_expiry: new Date(credentials.expiry_date).toISOString(),
    })
    .eq('id', integration.id);

  return credentials.access_token;
}

async function getCalendarEvents(integration, daysAhead = 14) {
  const accessToken = await refreshIfNeeded(integration);
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + daysAhead * 86400000).toISOString();

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 200,
  });

  return (res.data.items || []).map((e) => ({
    id: e.id,
    title: e.summary || '(No title)',
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    location: e.location || null,
    attendees: (e.attendees || []).map((a) => a.email),
    description: e.description || null,
    isAllDay: !!e.start?.date,
  }));
}

async function createCalendarEvent(integration, { title, start, end, description, attendees = [], timezone = 'America/New_York' }) {
  const accessToken = await refreshIfNeeded(integration);
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(start);
  const eventBody = {
    summary: title,
    description: description || undefined,
    start: isAllDay ? { date: start } : { dateTime: start, timeZone: timezone },
    end:   isAllDay ? { date: end   } : { dateTime: end,   timeZone: timezone },
    attendees: attendees.length ? attendees.map((email) => ({ email })) : undefined,
  };

  const res = await calendar.events.insert({ calendarId: 'primary', resource: eventBody });
  return {
    id:    res.data.id,
    title: res.data.summary,
    start: res.data.start?.dateTime || res.data.start?.date,
    end:   res.data.end?.dateTime   || res.data.end?.date,
    link:  res.data.htmlLink,
  };
}

function extractEmailBody(payload) {
  if (!payload) return null;
  const search = (parts) => {
    for (const part of parts || []) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      if (part.parts) {
        const nested = search(part.parts);
        if (nested) return nested;
      }
    }
    return null;
  };
  if (payload.body?.data && payload.mimeType === 'text/plain') {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  return search(payload.parts);
}

function isRecruiterEmail(subject, from, snippet) {
  const text = `${subject} ${from} ${snippet}`.toLowerCase();
  return /interview|recruiter|recruiting|talent\s+acquisition|hiring manager|phone\s+screen|technical\s+screen|onsite|availability.*role|schedule.*call|please\s+pick|calendly|job\s+opportunity|open\s+position/.test(text);
}

function isFinancialEmail(subject, from, snippet) {
  const text = `${subject} ${from} ${snippet}`.toLowerCase();
  return /amount\s+due|payment\s+due|bill\s+(ready|available|is\s+due)|invoice|statement\s+ready|minimum\s+payment|autopay|auto-pay|balance\s+due|past\s+due|subscription\s+renewal|your\s+receipt|order\s+total|\$\d+|charged\s+to\s+your|payment\s+of|amount\s+charged/.test(text);
}

async function getRecentEmails(integration, maxResults = 50) {
  const accessToken = await refreshIfNeeded(integration);
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const sevenDaysAgo = Math.floor((Date.now() - 7 * 86400000) / 1000);
  const query = `(is:unread OR is:starred OR label:IMPORTANT OR (in:sent after:${sevenDaysAgo}) OR (in:inbox after:${sevenDaysAgo}))`;

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
  });

  const messages = listRes.data.messages || [];
  if (!messages.length) return [];

  const fetched = await Promise.all(
    messages.map((m) =>
      gmail.users.messages.get({
        userId: 'me',
        id: m.id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'To', 'Date'],
      })
    )
  );

  // Fetch full body for recruiter/interview emails (scheduling links, proposed times)
  // and financial emails (amounts, due dates) — snippets are too short for either.
  const fullBodyIds = new Set(
    fetched
      .filter((res) => {
        const headers = res.data.payload?.headers || [];
        const h = (name) => headers.find((hh) => hh.name === name)?.value || '';
        const subject = h('Subject');
        const from = h('From');
        const snippet = res.data.snippet || '';
        return isRecruiterEmail(subject, from, snippet) || isFinancialEmail(subject, from, snippet);
      })
      .map((res) => res.data.id)
  );

  const bodyMap = {};
  if (fullBodyIds.size) {
    const bodyFetches = await Promise.all(
      [...fullBodyIds].map((id) =>
        gmail.users.messages.get({ userId: 'me', id, format: 'full' }).catch(() => null)
      )
    );
    for (const bodyRes of bodyFetches) {
      if (!bodyRes) continue;
      const text = extractEmailBody(bodyRes.data.payload);
      if (text) bodyMap[bodyRes.data.id] = text.slice(0, 800);
    }
  }

  return fetched.map((res) => {
    const headers = res.data.payload?.headers || [];
    const h = (name) => headers.find((hh) => hh.name === name)?.value || '';
    return {
      id: res.data.id,
      subject: h('Subject'),
      from: h('From'),
      to: h('To'),
      date: h('Date'),
      snippet: res.data.snippet || '',
      labels: res.data.labelIds || [],
      body: bodyMap[res.data.id] || null,
    };
  });
}

async function deleteCalendarEvent(integration, eventId) {
  const accessToken = await refreshIfNeeded(integration);
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  await calendar.events.delete({ calendarId: 'primary', eventId });
}

async function cancelCalendarEvent(integration, eventId) {
  const accessToken = await refreshIfNeeded(integration);
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    requestBody: { status: 'cancelled' },
  });
}

async function restoreCalendarEvent(integration, eventId) {
  const accessToken = await refreshIfNeeded(integration);
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    requestBody: { status: 'confirmed' },
  });
}

module.exports = { getAuthUrl, getTokensFromCode, refreshIfNeeded, getCalendarEvents, createCalendarEvent, deleteCalendarEvent, cancelCalendarEvent, restoreCalendarEvent, getRecentEmails };
