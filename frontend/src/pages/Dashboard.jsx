import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { apiFetch } from '../lib/api';
import Header from '../components/Header';
import PartnerStatus from '../components/PartnerStatus';
import BriefingFeed from '../components/BriefingFeed';
import TimelineView from '../components/TimelineView';
import ChatDrawer from '../components/ChatDrawer';
import SplashScreen from '../components/SplashScreen';
import SMSNotification from '../components/SMSNotification';
import InviteModal from '../components/InviteModal';

const SPLASH_KEY = 'calvin_splash_shown';
const POLL_INTERVAL = 90000;

function getStoredEmoji(partnerId, fallback) {
  return localStorage.getItem(`calvin_emoji_${partnerId}`) || fallback;
}

function storeEmoji(partnerId, emoji) {
  localStorage.setItem(`calvin_emoji_${partnerId}`, emoji);
}

export default function Dashboard() {
  const { isLoaded, getToken } = useAuth();
  const [briefing, setBriefing]         = useState({ alerts: [], meta: {} });
  const [integrations, setIntegrations] = useState([]);
  const [householdInfo, setHouseholdInfo] = useState(null);
  const [calendarData, setCalendarData] = useState({ eventsA: [], eventsB: [] });
  const [loading, setLoading]           = useState(true);
  const [chatAlert, setChatAlert]       = useState(null);
  const [splashDone, setSplashDone]     = useState(
    () => sessionStorage.getItem(SPLASH_KEY) === '1'
  );
  const navigate = useNavigate();

  // View toggle — default to insights so alerts are front and centre
  const [view, setView] = useState('insights');

  // Per-partner emoji stored in localStorage for persistence
  const [emojis, setEmojis] = useState({});

  function getEmoji(partnerId, fallback = '😊') {
    return emojis[partnerId] ?? getStoredEmoji(partnerId, fallback);
  }

  function handleChangeEmoji(partnerId, emoji) {
    storeEmoji(partnerId, emoji);
    setEmojis((prev) => ({ ...prev, [partnerId]: emoji }));
  }

  // SMS notification — show once per session for first high-priority alert
  const [smsAlert, setSmsAlert]       = useState(null);
  const [smsVisible, setSmsVisible]   = useState(false);
  const smsShownRef = useRef(false);
  const [inviteOpen, setInviteOpen]   = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const token = await getToken();
      const auth = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const [briefingData, intgData, hhData] = await Promise.all([
        apiFetch('/api/briefing', auth),
        apiFetch('/api/integrations/household', auth),
        apiFetch('/api/household/me', auth),
      ]);

      setBriefing(briefingData);
      setIntegrations(intgData || []);
      setHouseholdInfo(hhData);

      // Fetch calendar separately — a Google API failure must not break the dashboard
      apiFetch('/api/calendar/events', auth)
        .then((calData) => setCalendarData(calData || { eventsA: [], eventsB: [] }))
        .catch(() => {});

      // Trigger SMS notification for first high-priority alert (once per session)
      if (!smsShownRef.current) {
        const firstHigh = (briefingData.alerts || []).find((a) => a.severity === 'high');
        if (firstHigh) {
          smsShownRef.current = true;
          setTimeout(() => {
            setSmsAlert(firstHigh);
            setSmsVisible(true);
          }, 1500);
        }
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded) return;

    const params = new URLSearchParams(window.location.search);
    const justConnected = params.get('connected') === 'google';

    if (justConnected) {
      window.history.replaceState({}, '', '/dashboard');
      let attempts = 0;
      const retry = setInterval(async () => {
        attempts++;
        await fetchAll();
        if (attempts >= 5) clearInterval(retry);
      }, 800);
      return () => clearInterval(retry);
    }

    fetchAll();
    const id = setInterval(fetchAll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [isLoaded, fetchAll]);

  const partner      = householdInfo?.partner;
  const otherPartner = householdInfo?.other_partner;
  const partners     = [partner, otherPartner].filter(Boolean);

  // Enrich partner objects with stored emoji
  const partnerAData = partner      ? { ...partner,      emoji: getEmoji(partner.id, '😊') }      : null;
  const partnerBData = otherPartner ? { ...otherPartner, emoji: getEmoji(otherPartner.id, '😎') } : null;

  const myIntegration = integrations.find(
    (i) => i.partner_id === partner?.id && i.provider === 'google' && i.is_active
  );
  const partnerIntegration = otherPartner
    ? integrations.find((i) => i.partner_id === otherPartner.id && i.provider === 'google' && i.is_active)
    : null;

  async function handleDismiss(alertId) {
    await apiFetch(`/api/briefing/${alertId}/dismiss`, { method: 'PATCH' });
    setBriefing((prev) => ({
      ...prev,
      alerts: prev.alerts.filter((a) => a.id !== alertId),
      meta: { ...prev.meta, total: (prev.meta.total || 1) - 1 },
    }));
  }

  async function handleSnooze(alertId, hours) {
    await apiFetch(`/api/briefing/${alertId}/snooze`, {
      method: 'PATCH',
      body: JSON.stringify({ hours }),
    });
    setBriefing((prev) => ({
      ...prev,
      alerts: prev.alerts.filter((a) => a.id !== alertId),
    }));
  }

  async function handleResolve(alertId) {
    await apiFetch(`/api/briefing/${alertId}/resolve`, { method: 'PATCH' });
    setBriefing((prev) => ({
      ...prev,
      alerts: prev.alerts.filter((a) => a.id !== alertId),
    }));
  }

  // ── Splash / connect gates ────────────────────────────────────────────────
  if (!loading && !myIntegration) {
    if (!splashDone) {
      return (
        <SplashScreen
          onComplete={() => {
            sessionStorage.setItem(SPLASH_KEY, '1');
            setSplashDone(true);
          }}
        />
      );
    }

    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <Header partnerName={partner?.display_name} />
        <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
          <div className="text-4xl mb-4">🔌</div>
          <h2 className="text-xl font-bold text-dark mb-2">Connect your Google account</h2>
          <p className="text-mid text-sm mb-6 max-w-xs">
            Calvin needs access to your calendar and inbox to detect gaps and conflicts.
          </p>
          <button
            onClick={async () => {
              const { url } = await apiFetch('/api/google/connect');
              window.location.href = url;
            }}
            className="btn-primary px-6 py-3"
          >
            Connect Google account
          </button>
        </div>
      </div>
    );
  }

  // ── Shared props ──────────────────────────────────────────────────────────
  const briefingProps = {
    alerts:    briefing.alerts,
    meta:      briefing.meta,
    partnerA:  partnerAData,
    partnerB:  partnerBData,
    onDismiss: handleDismiss,
    onSnooze:  handleSnooze,
    onResolve: handleResolve,
    onChat:    setChatAlert,
  };

  const timelineProps = {
    eventsA:  calendarData.eventsA,
    eventsB:  calendarData.eventsB,
    alerts:   briefing.alerts,
    partnerA: partnerAData,
    partnerB: partnerBData,
    loading,
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Header partnerName={partner?.display_name} />

      {otherPartner && !partnerIntegration && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-[13px] text-amber-700 flex items-center gap-2">
          <span>⚠️</span>
          <span>
            <strong>{otherPartner.display_name}</strong> hasn't connected their Google account yet.
            Share invite code: <code className="font-mono font-bold">{householdInfo?.household?.invite_code}</code>
          </span>
        </div>
      )}

      {partners.length > 0 && (
        <PartnerStatus
          partners={[partnerAData, partnerBData].filter(Boolean)}
          integrations={integrations}
          onRefresh={fetchAll}
          view={view}
          onViewChange={setView}
          onChangeEmoji={handleChangeEmoji}
          onInvite={() => setInviteOpen(true)}
          showInvite={!otherPartner}
        />
      )}

      {/* ── Insights only ── */}
      {view === 'insights' && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-4">
            <BriefingFeed {...briefingProps} />
          </div>
        </div>
      )}

      {/* ── Calendar only ── */}
      {view === 'calendar' && (
        <div className="flex-1 overflow-y-auto p-4">
          <TimelineView {...timelineProps} />
        </div>
      )}

      {/* ── Both: sidebar + main ── */}
      {view === 'both' && (
        <div className="flex flex-1 overflow-hidden">
          <div className="hidden md:flex w-[360px] shrink-0 flex-col border-r border-border bg-white overflow-hidden">
            <BriefingFeed {...briefingProps} sidebar />
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <TimelineView {...timelineProps} />
            <div className="md:hidden">
              <BriefingFeed {...briefingProps} />
            </div>
          </div>
        </div>
      )}

      {chatAlert && (
        <ChatDrawer alert={chatAlert} onClose={() => setChatAlert(null)} />
      )}

      {smsVisible && smsAlert && (
        <SMSNotification
          alert={smsAlert}
          partners={[partnerAData, partnerBData].filter(Boolean)}
          onDismiss={() => setSmsVisible(false)}
        />
      )}

      {inviteOpen && householdInfo?.household?.invite_code && (
        <InviteModal
          inviteCode={householdInfo.household.invite_code}
          onClose={() => setInviteOpen(false)}
        />
      )}
    </div>
  );
}
