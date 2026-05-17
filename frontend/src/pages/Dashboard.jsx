import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { apiFetch } from '../lib/api';
import Header from '../components/Header';
import PartnerStatus from '../components/PartnerStatus';
import BriefingFeed from '../components/BriefingFeed';
import TimelineView from '../components/TimelineView';
import InsightsView from '../components/InsightsView';
import SettingsView from '../components/SettingsView';
import BottomNav from '../components/BottomNav';
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

  const [view, setView] = useState('briefings');
  const [emojis, setEmojis] = useState({});

  function getEmoji(partnerId, fallback = '😊') {
    return emojis[partnerId] ?? getStoredEmoji(partnerId, fallback);
  }

  function handleChangeEmoji(partnerId, emoji) {
    storeEmoji(partnerId, emoji);
    setEmojis((prev) => ({ ...prev, [partnerId]: emoji }));
  }

  // In-app alert notification — show once per session for first new high/medium alert
  const [alertNotif, setAlertNotif]   = useState(null);
  const [alertVisible, setAlertVisible] = useState(false);
  const alertShownRef = useRef(false);
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

      apiFetch('/api/calendar/events', auth)
        .then((calData) => setCalendarData(calData || { eventsA: [], eventsB: [] }))
        .catch(() => {});

      if (!alertShownRef.current) {
        const first = (briefingData.alerts || []).find(
          (a) => a.severity === 'high' || a.severity === 'medium'
        );
        if (first) {
          alertShownRef.current = true;
          setTimeout(() => {
            setAlertNotif(first);
            setAlertVisible(true);
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
      meta: { ...prev.meta, total: Math.max(0, (prev.meta.total || 1) - 1) },
    }));
  }

  async function handleResolve(alertId) {
    await apiFetch(`/api/briefing/${alertId}/resolve`, { method: 'PATCH' });
    setBriefing((prev) => ({
      ...prev,
      alerts: prev.alerts.filter((a) => a.id !== alertId),
      meta: { ...prev.meta, total: Math.max(0, (prev.meta.total || 1) - 1) },
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
        <Header />
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
      <Header
        householdInfo={householdInfo}
        integrations={integrations}
        onRefresh={fetchAll}
        onInvite={() => setInviteOpen(true)}
        showInvite={!otherPartner}
      />

      {partners.length > 0 && (
        <PartnerStatus
          partners={[partnerAData, partnerBData].filter(Boolean)}
          integrations={integrations}
          onChangeEmoji={handleChangeEmoji}
        />
      )}

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto pb-16">
        {view === 'briefings' && (
          <div className="max-w-2xl mx-auto p-4">
            <BriefingFeed {...briefingProps} />
          </div>
        )}

        {view === 'calendar' && (
          <div className="p-4">
            <TimelineView {...timelineProps} />
          </div>
        )}

        {view === 'insights' && <InsightsView />}

        {view === 'settings' && (
          <SettingsView householdInfo={householdInfo} integrations={integrations} />
        )}
      </div>

      <BottomNav active={view} onChange={setView} />

      {chatAlert && (
        <ChatDrawer alert={chatAlert} onClose={() => setChatAlert(null)} />
      )}

      {alertVisible && alertNotif && (
        <SMSNotification
          alert={alertNotif}
          onDismiss={() => setAlertVisible(false)}
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
