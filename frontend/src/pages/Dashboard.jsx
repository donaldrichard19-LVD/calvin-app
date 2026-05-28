import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { apiFetch } from '../lib/api';
import BriefingFeed from '../components/BriefingFeed';
import EmojiAvatar from '../components/EmojiAvatar';
import TimelineView from '../components/TimelineView';
import InsightsView from '../components/InsightsView';
import SettingsView, { getInAppAlertsEnabled } from '../components/SettingsView';
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
  const [briefing, setBriefing]           = useState({ alerts: [], meta: {} });
  const [integrations, setIntegrations]   = useState([]);
  const [myIntegrations, setMyIntegrations] = useState(null); // null = not yet loaded
  const [householdInfo, setHouseholdInfo] = useState(null);
  const [calendarData, setCalendarData]   = useState({ eventsA: [], eventsB: [] });
  const [calendarSyncError, setCalendarSyncError] = useState(null);
  const [loading, setLoading]             = useState(true);
  const [chatAlert, setChatAlert]       = useState(null);
  const [splashDone, setSplashDone]     = useState(
    () => sessionStorage.getItem(SPLASH_KEY) === '1'
  );
  const [view, setView] = useState('briefings');
  const [emojis, setEmojis] = useState({});
  const [spinning, setSpinning] = useState(false);

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
  const [dismissToast, setDismissToast] = useState(false);
  const dismissToastTimer = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const token = await getToken();
      const auth = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const [briefingData, intgData, hhData, myIntgData] = await Promise.all([
        apiFetch('/api/briefing', auth),
        apiFetch('/api/integrations/household', auth),
        apiFetch('/api/household/me', auth),
        apiFetch('/api/integrations', auth),
      ]);

      setBriefing(briefingData);
      setIntegrations(intgData || []);
      setHouseholdInfo(hhData);
      setMyIntegrations(myIntgData || []);

      apiFetch('/api/calendar/events', auth)
        .then((calData) => {
          setCalendarData(calData || { eventsA: [], eventsB: [] });
          setCalendarSyncError(calData?.error || null);
        })
        .catch(() => {});

      if (!alertShownRef.current && getInAppAlertsEnabled()) {
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
      fetchAll();
      return;
    }

    // Don't clear error params — keep them visible for the debug panel
    fetchAll();
    const id = setInterval(fetchAll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [isLoaded, fetchAll]);

  const partner      = householdInfo?.partner;
  const otherPartner = householdInfo?.other_partner;
  const partners     = [partner, otherPartner].filter(Boolean);

  const partnerAData = partner      ? { ...partner,      emoji: getEmoji(partner.id, '😊') }      : null;
  const partnerBData = otherPartner ? { ...otherPartner, emoji: getEmoji(otherPartner.id, '😎') } : null;

  // myIntegrations is queried by partner_id directly — more reliable than the household query
  const myIntegration = myIntegrations === null
    ? null
    : myIntegrations.find((i) => i.provider === 'google' && i.is_active);
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
    clearTimeout(dismissToastTimer.current);
    setDismissToast(true);
    dismissToastTimer.current = setTimeout(() => setDismissToast(false), 3500);
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

  async function handleUndo(eventId, alertId) {
    await apiFetch(`/api/calendar/restore/${eventId}`, { method: 'POST' });
    setBriefing((prev) => ({
      ...prev,
      alerts: prev.alerts.filter((a) => a.id !== alertId),
      meta: { ...prev.meta, total: Math.max(0, (prev.meta.total || 1) - 1) },
    }));
  }

  async function handleCancelEvent(alertId) {
    await apiFetch(`/api/briefing/${alertId}/cancel-event`, { method: 'POST' });
    await fetchAll();
  }

  async function handleSync() {
    if (spinning) return;
    setSpinning(true);
    try {
      await apiFetch('/api/analyze/trigger', { method: 'POST' });
      await new Promise((r) => setTimeout(r, 12000));
      fetchAll();
    } catch {}
    setSpinning(false);
  }

  // ── Splash / connect gates ────────────────────────────────────────────────
  const isDemo = import.meta.env.VITE_IS_DEMO === 'true';
  if (!isDemo && !loading && myIntegrations !== null && !myIntegration) {
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

    const urlError = new URLSearchParams(window.location.search).get('error');
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <div className="h-12 bg-white border-b border-border flex items-center justify-center shrink-0">
          <span className="text-dark font-bold text-lg tracking-tight">Calvin</span>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
          <div className="text-4xl mb-4">🔌</div>
          <h2 className="text-xl font-bold text-dark mb-2">Connect your Google account</h2>
          <p className="text-mid text-sm mb-6 max-w-xs">
            Calvin needs access to your calendar and inbox to detect gaps and conflicts.
          </p>
          {urlError && (
            <p className="text-red-500 text-xs mb-4 max-w-xs">
              Last attempt failed ({urlError}). Try again below.
            </p>
          )}
          <button
            onClick={async () => {
              const { url } = await apiFetch('/api/google/connect');
              window.location.href = url;
            }}
            className="btn-primary px-6 py-3"
          >
            Connect Google account
          </button>
          <details className="mt-8 text-left max-w-xs w-full">
            <summary className="text-[11px] text-light cursor-pointer">Debug info</summary>
            <pre className="text-[10px] text-mid bg-gray-50 rounded p-2 mt-1 overflow-auto max-h-40">
              {JSON.stringify({ myIntegrations, urlError }, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    );
  }

  // ── Shared props ──────────────────────────────────────────────────────────
  const briefingProps = {
    alerts:         briefing.alerts,
    meta:           briefing.meta,
    partnerA:       partnerAData,
    partnerB:       partnerBData,
    onDismiss:      handleDismiss,
    onSnooze:       handleSnooze,
    onResolve:      handleResolve,
    onChat:         setChatAlert,
    onUndo:         handleUndo,
    onCancelEvent:  handleCancelEvent,
  };

  const timelineProps = {
    eventsA:    calendarData.eventsA,
    eventsB:    calendarData.eventsB,
    alerts:     briefing.alerts,
    partnerA:   partnerAData,
    partnerB:   partnerBData,
    loading,
    syncError:  calendarSyncError,
  };

  const firstName = partnerAData?.display_name?.split(' ')[0] || '';

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col md:pl-52">
      {/* User avatar — fixed top right */}
      {partnerAData && (
        <div className="fixed top-4 right-4 z-30 flex items-center gap-2">
          <span className="hidden sm:block text-[13px] font-semibold text-dark">{partnerAData.display_name}</span>
          <EmojiAvatar
            emoji={partnerAData.emoji}
            isA
            name={partnerAData.display_name}
            onChangeEmoji={(e) => handleChangeEmoji(partnerAData.id, e)}
            alignRight
          />
        </div>
      )}
      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto pb-28 md:pb-0">
        {view === 'briefings' && (
          <div className="max-w-2xl mx-auto p-4">
            {firstName && (
              <div className="md:hidden mb-4 pt-2">
                <h1 className="text-[26px] font-bold text-dark leading-tight">Hi {firstName}</h1>
                <h2 className="text-[26px] font-bold text-dark leading-tight">Here's what's top of mind</h2>
              </div>
            )}
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

      <div
        className={`fixed bottom-28 left-0 right-0 flex justify-center px-4 z-40 pointer-events-none transition-all duration-300 ${
          dismissToast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        <div className="bg-dark text-white text-[12px] font-medium px-4 py-2.5 rounded-full shadow-lg max-w-xs text-center">
          Calvin uses dismissals to learn your preferences
        </div>
      </div>

      <BottomNav
        active={view}
        onChange={setView}
        onSync={handleSync}
        spinning={spinning}
        partner={partnerAData}
        onChangeEmoji={handleChangeEmoji}
      />

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
