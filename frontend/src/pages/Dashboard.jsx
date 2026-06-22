import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { apiFetch } from '../lib/api';
import BriefingFeed from '../components/BriefingFeed';
import TimelineView from '../components/TimelineView';
import InsightsView from '../components/InsightsView';
import SettingsView, { getInAppAlertsEnabled } from '../components/SettingsView';
import ContextWallet from '../components/ContextWallet';
import BottomNav from '../components/BottomNav';
import EmailDraftModal from '../components/EmailDraftModal';
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
  const [emailDraft, setEmailDraft]     = useState(null);
  const [splashDone, setSplashDone]     = useState(
    () => sessionStorage.getItem(SPLASH_KEY) === '1'
  );
  const [view, setView] = useState('pulse');
  const [emojis, setEmojis] = useState({});
  const [spinning, setSpinning] = useState(false);
  const [connectBannerDismissed, setConnectBannerDismissed] = useState(
    () => sessionStorage.getItem('calvin_connect_banner_dismissed') === '1'
  );

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
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  function showToast(msg) {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

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
    showToast('Calvin uses dismissals to learn your preferences');
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

  function resolveAndRemoveAlert(alertId) {
    apiFetch(`/api/briefing/${alertId}/resolve`, { method: 'PATCH' }).catch(() => {});
    setBriefing((prev) => ({
      ...prev,
      alerts: prev.alerts.filter((a) => a.id !== alertId),
      meta: { ...prev.meta, total: Math.max(0, (prev.meta.total || 1) - 1) },
    }));
  }

  async function handleChat(alert, messages) {
    return await apiFetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ alertId: alert.id, messages }),
    });
  }

  async function handleTackle(alert) {
    const data = await apiFetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        alertId: alert.id,
        messages: [{ role: 'user', content: alert.action_hint }],
      }),
    });
    if (data.eventCreated) {
      resolveAndRemoveAlert(alert.id);
      showToast(`Added to your calendar: ${data.eventCreated.title || 'Event created'} ✓`);
    } else if (data.draftCreated) {
      setEmailDraft({ ...data.draftCreated, alertId: alert.id });
    } else if (data.reminderScheduled) {
      resolveAndRemoveAlert(alert.id);
      showToast('Reminder set — Calvin will resurface this in 3 days ✓');
    } else {
      resolveAndRemoveAlert(alert.id);
      showToast('Done! Calvin took care of it ✓');
    }
  }

  async function handleAddToOrders(alertId, editedOrder) {
    const body = editedOrder ? { edited_order: editedOrder } : {};
    await apiFetch(`/api/briefing/${alertId}/add-to-orders`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    setBriefing((prev) => ({
      ...prev,
      alerts: prev.alerts.filter((a) => a.id !== alertId),
      meta: { ...prev.meta, total: Math.max(0, (prev.meta.total || 1) - 1) },
    }));
    showToast('Order added to your Wallet ✓');
  }

  async function handleAcceptSuggestion(alertId, editedEntry) {
    const body = editedEntry ? { edited_entry: editedEntry } : {};
    await apiFetch(`/api/briefing/${alertId}/accept-suggestion`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    setBriefing((prev) => ({
      ...prev,
      alerts: prev.alerts.filter((a) => a.id !== alertId),
      meta: { ...prev.meta, total: Math.max(0, (prev.meta.total || 1) - 1) },
    }));
    showToast('Added to your Context Wallet ✓');
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

  // ── Splash gate (connect gate removed — soft banner used instead) ────────
  const isDemo = import.meta.env.VITE_IS_DEMO === 'true';
  const showConnectBanner = !isDemo && !loading && myIntegrations !== null && !myIntegration && !connectBannerDismissed;

  // ── Shared props ──────────────────────────────────────────────────────────
  const briefingProps = {
    alerts:         briefing.alerts,
    meta:           briefing.meta,
    partnerA:       partnerAData,
    partnerB:       partnerBData,
    onDismiss:      handleDismiss,
    onSnooze:       handleSnooze,
    onResolve:      handleResolve,
    onChat:         handleChat,
    onTackle:       handleTackle,
    onAcceptSuggestion: handleAcceptSuggestion,
    onAddToOrders:  handleAddToOrders,
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
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col md:pl-64">
      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto pb-28 md:pb-0">
        {view === 'pulse' && (
          <div className="max-w-2xl mx-auto p-4">
            {firstName && (
              <div className="mb-4 pt-2">
                <h1 className="text-[26px] font-bold text-dark leading-tight">Hi {firstName}</h1>
                <h2 className="text-[26px] font-bold text-dark leading-tight">Here's what's top of mind</h2>
              </div>
            )}

            {showConnectBanner && (
              <div className="rounded-2xl border border-blurple/15 bg-blurple/4 p-6 mb-4 relative">
                <button
                  onClick={() => {
                    sessionStorage.setItem('calvin_connect_banner_dismissed', '1');
                    setConnectBannerDismissed(true);
                  }}
                  className="absolute top-3 right-3 text-blurple/40 hover:text-blurple transition-colors text-lg leading-none"
                >
                  ×
                </button>
                <div className="flex items-start gap-4">
                  <div className="text-3xl shrink-0">🔗</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[15px] font-bold text-blurple mb-1">Connect Google to activate Calvin</h3>
                    <p className="text-[13px] text-blurple/60 leading-relaxed mb-3">
                      Calvin needs access to your calendar and inbox to detect conflicts and surface alerts.
                      It takes about 60 seconds.
                    </p>
                    <button
                      onClick={async () => {
                        const { url } = await apiFetch('/api/google/connect');
                        window.location.href = url;
                      }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-[13px] bg-blurple hover:bg-blurpleHover transition-colors text-white shadow-sm shadow-blurple/30"
                    >
                      Connect Google account →
                    </button>
                  </div>
                </div>
              </div>
            )}

            <BriefingFeed {...briefingProps} />
          </div>
        )}

        {view === 'context' && <ContextWallet />}

        {view === 'insights' && <InsightsView />}

        {view === 'settings' && (
          <SettingsView
            householdInfo={householdInfo}
            integrations={integrations}
            partnerEmoji={partnerAData?.emoji}
            onChangeEmoji={partnerAData ? (e) => handleChangeEmoji(partnerAData.id, e) : undefined}
          />
        )}
      </div>

      <div
        className={`fixed bottom-28 left-0 right-0 flex justify-center px-4 z-40 pointer-events-none transition-all duration-300 ${
          toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        <div className="bg-dark text-white text-[12px] font-medium px-4 py-2.5 rounded-full shadow-lg max-w-xs text-center">
          {toast}
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

      {emailDraft && (
        <EmailDraftModal
          draft={emailDraft}
          onClose={() => setEmailDraft(null)}
          onSent={(msg) => {
            const alertId = emailDraft.alertId;
            setEmailDraft(null);
            showToast(msg);
            if (alertId) resolveAndRemoveAlert(alertId);
          }}
        />
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
