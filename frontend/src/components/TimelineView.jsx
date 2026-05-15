import React, { useState } from 'react';

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 7am–10pm
const PX_DESKTOP = 48;
const PX_MOBILE  = 40;

function formatHour(h) {
  if (h === 12) return '12pm';
  if (h > 12) return `${h - 12}pm`;
  return `${h}am`;
}

function getDays() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
}

function formatDayLabel(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[date.getDay()]} ${date.getDate()}`;
}

function formatDayFull(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

function isSameDay(eventDate, day) {
  const d = new Date(eventDate);
  return d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate();
}

function getEventBlock(event, pxPerHour) {
  const start = new Date(event.start);
  const end   = new Date(event.end);
  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour   = end.getHours()   + end.getMinutes() / 60;
  const top    = (Math.max(startHour, 7) - 7) * pxPerHour;
  const height = Math.max((Math.min(endHour, 23) - Math.max(startHour, 7)) * pxPerHour, 20);
  return { top, height };
}

function DesktopEventBlock({ event, isA }) {
  const [tooltip, setTooltip] = useState(false);
  const { top, height } = getEventBlock(event, PX_DESKTOP);

  return (
    <div
      className={`absolute left-0 right-0 rounded text-white text-[10px] px-1 py-0.5 overflow-hidden cursor-pointer z-10 ${
        isA ? 'partner-a-event' : 'partner-b-event'
      }`}
      style={{ top, height: height - 2, marginRight: isA ? '50%' : '0', marginLeft: isA ? '0' : '50%' }}
      onMouseEnter={() => setTooltip(true)}
      onMouseLeave={() => setTooltip(false)}
    >
      <div className="truncate font-medium">{event.title}</div>
      <div className="opacity-75">
        {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
      {tooltip && (
        <div className="absolute z-50 left-full ml-1 top-0 bg-dark text-white text-[11px] rounded p-2 shadow-lg w-44 pointer-events-none">
          <div className="font-semibold mb-0.5">{event.title}</div>
          {event.location && <div className="text-[10px] opacity-70">{event.location}</div>}
          <div className="text-[10px] mt-1 opacity-70">
            {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
            {new Date(event.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      )}
    </div>
  );
}

function MobileEventBlock({ event, isA, partnerName }) {
  const [open, setOpen] = useState(false);
  const { top, height } = getEventBlock(event, PX_MOBILE);

  return (
    <div
      className={`absolute left-0 right-0 rounded text-white text-[11px] px-1.5 py-0.5 overflow-hidden cursor-pointer z-10 ${
        isA ? 'partner-a-event' : 'partner-b-event'
      }`}
      style={{ top, height: height - 2, marginRight: isA ? '50%' : '0', marginLeft: isA ? '0' : '50%' }}
      onClick={() => setOpen((v) => !v)}
    >
      {open ? (
        <div className="text-[10px] leading-snug">
          <div className="font-semibold truncate">{event.title}</div>
          <div className="opacity-80">
            {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
            {new Date(event.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          {event.location && <div className="opacity-70 truncate">{event.location}</div>}
          <div className="opacity-60">{partnerName}</div>
        </div>
      ) : (
        <>
          <div className="truncate font-medium">{event.title}</div>
          <div className="opacity-75">
            {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </>
      )}
    </div>
  );
}

function DayGrid({ day, eventsA, eventsB, partnerA, partnerB, pxPerHour, mobile = false }) {
  const dayEventsA = eventsA.filter((e) => isSameDay(e.start, day));
  const dayEventsB = eventsB.filter((e) => isSameDay(e.start, day));

  return (
    <div className="relative" style={{ height: HOURS.length * pxPerHour }}>
      {HOURS.map((h) => (
        <div key={h} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: (h - 7) * pxPerHour }} />
      ))}
      {dayEventsA.map((e) =>
        mobile
          ? <MobileEventBlock key={e.id} event={e} isA={true}  partnerName={partnerA?.display_name} />
          : <DesktopEventBlock key={e.id} event={e} isA={true} />
      )}
      {dayEventsB.map((e) =>
        mobile
          ? <MobileEventBlock key={e.id} event={e} isA={false} partnerName={partnerB?.display_name} />
          : <DesktopEventBlock key={e.id} event={e} isA={false} />
      )}
    </div>
  );
}

export default function TimelineView({ eventsA = [], eventsB = [], alerts = [], partnerA, partnerB, loading }) {
  const days = getDays();

  const hasDayAlert = (day) =>
    alerts.some((a) => (a.source_data?.dates || []).some((d) => isSameDay(d, day)));

  const legend = (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-3 h-3 rounded bg-coral inline-block" />
      <span className="text-mid">{partnerA?.display_name || 'Partner A'}</span>
      <span className="w-3 h-3 rounded bg-dark inline-block ml-2" />
      <span className="text-mid">{partnerB?.display_name || 'Partner B'}</span>
    </div>
  );

  if (loading) {
    return (
      <div className="card p-4">
        <h2 className="text-[16px] font-bold text-dark mb-4">Next 7 Days</h2>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => (
            <div key={d.toISOString()} className="h-32 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-[16px] font-bold text-dark">Next 7 Days</h2>
        {legend}
      </div>

      {/* ── Desktop: horizontal 7-column grid ── */}
      <div className="hidden md:flex overflow-x-auto">
        <div className="w-10 shrink-0">
          {HOURS.map((h) => (
            <div key={h} className="flex items-start" style={{ height: PX_DESKTOP }}>
              <span className="text-[10px] text-light -mt-1.5">{formatHour(h)}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-1 gap-1 min-w-[540px]">
          {days.map((day) => {
            const hasAlert = hasDayAlert(day);
            const isToday  = day.toDateString() === new Date().toDateString();
            return (
              <div key={day.toISOString()} className="flex-1 min-w-0">
                <div className={`text-[11px] font-semibold text-center mb-1 pb-1 border-b border-border relative ${
                  isToday ? 'text-blurple' : 'text-mid'
                }`}>
                  {formatDayLabel(day)}
                  {hasAlert && <span className="absolute -top-0.5 right-0 w-1.5 h-1.5 bg-red-500 rounded-full" />}
                </div>
                <DayGrid day={day} eventsA={eventsA} eventsB={eventsB} partnerA={partnerA} partnerB={partnerB} pxPerHour={PX_DESKTOP} />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Mobile: vertical stack, one day per section ── */}
      <div className="md:hidden space-y-6">
        {days.map((day) => {
          const hasAlert   = hasDayAlert(day);
          const isToday    = day.toDateString() === new Date().toDateString();
          const hasEvents  = eventsA.some((e) => isSameDay(e.start, day)) || eventsB.some((e) => isSameDay(e.start, day));

          return (
            <div key={day.toISOString()}>
              <div className={`flex items-center gap-2 mb-2 pb-1.5 border-b-2 ${isToday ? 'border-blurple' : 'border-border'}`}>
                <span className={`text-[13px] font-bold ${isToday ? 'text-blurple' : 'text-dark'}`}>
                  {formatDayFull(day)}
                </span>
                {isToday && (
                  <span className="text-[10px] font-bold bg-blurple text-white px-1.5 py-0.5 rounded-full">Today</span>
                )}
                {hasAlert && (
                  <span className="text-[10px] font-semibold text-red-500 ml-auto flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full inline-block" />
                    Alert
                  </span>
                )}
              </div>
              {!hasEvents ? (
                <p className="text-[12px] text-light italic pl-10">No events</p>
              ) : (
                <div className="flex">
                  <div className="w-10 shrink-0">
                    {HOURS.map((h) => (
                      <div key={h} className="flex items-start" style={{ height: PX_MOBILE }}>
                        <span className="text-[10px] text-light -mt-1.5">{formatHour(h)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex-1">
                    <DayGrid day={day} eventsA={eventsA} eventsB={eventsB} partnerA={partnerA} partnerB={partnerB} pxPerHour={PX_MOBILE} mobile={true} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {eventsA.length === 0 && eventsB.length === 0 && (
        <div className="text-center text-mid text-sm py-6">
          Connect Google Calendar to see schedules
        </div>
      )}
    </div>
  );
}
