import React, { useState, useRef, useEffect } from 'react';
import { apiFetch } from '../lib/api';

function renderContent(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const output = [];
  let listItems = [];

  function flushList() {
    if (!listItems.length) return;
    output.push(
      <ul key={output.length} className="list-none space-y-1 mt-1">
        {listItems.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-blurple shrink-0">•</span>
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    );
    listItems = [];
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bulletMatch = line.match(/^[\s]*[-*•]\s+(.+)/);
    const numberedMatch = line.match(/^[\s]*\d+[.)]\s+(.+)/);
    if (bulletMatch || numberedMatch) {
      listItems.push((bulletMatch || numberedMatch)[1]);
    } else {
      flushList();
      if (line.trim()) {
        output.push(<p key={output.length} className="mt-1 first:mt-0">{renderInline(line)}</p>);
      }
    }
  }
  flushList();
  return <div className="space-y-1">{output}</div>;
}

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : p
  );
}

const SUGGESTIONS = [
  '📅 Create a calendar event for this',
  'What are my options here?',
  'Who should handle this?',
];

function TypingDots() {
  return (
    <div className="flex gap-1 items-center px-3 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 bg-mid rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

function CalendarEventCard({ event }) {
  const start = event?.start?.dateTime || event?.start?.date;
  const formatted = start
    ? new Date(start).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      })
    : null;

  return (
    <div className="mt-2 bg-blurpleLight border border-blurple/20 rounded-xl px-3 py-2.5 flex items-start gap-2.5">
      <span className="text-lg shrink-0">📅</span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-blurple leading-snug truncate">
          {event?.summary || 'Event created'}
        </p>
        {formatted && (
          <p className="text-[11px] text-blurple/70 mt-0.5">{formatted}</p>
        )}
        <p className="text-[11px] text-green-700 font-semibold mt-1">✓ Added to Google Calendar</p>
      </div>
    </div>
  );
}

export default function ChatDrawer({ alert, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    setMessages([]);
    setInput('');
  }, [alert?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage(text) {
    const trimmed = (text ?? input).trim();
    if (!trimmed || loading) return;

    const userMsg = { role: 'user', content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);

    try {
      const data = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ alertId: alert.id, messages: next }),
      });
      setMessages([
        ...next,
        { role: 'assistant', content: data.content, eventCreated: data.eventCreated || null },
      ]);
    } catch (err) {
      setMessages([...next, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div
        className="fixed top-0 right-0 z-50 bg-white flex flex-col"
        style={{
          width: 'clamp(320px, 420px, 100vw)',
          height: '100dvh',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-dark truncate">{alert?.title}</div>
          </div>
          <button onClick={onClose} className="text-mid hover:text-dark text-xl leading-none">×</button>
        </div>

        {/* Alert context */}
        {alert && (
          <div className="px-4 py-3 bg-gray-50 border-b border-border shrink-0">
            <p className="text-[12px] text-mid leading-relaxed">{alert.summary}</p>
            {alert.action_hint && (
              <p className="text-[12px] italic text-coral mt-1">→ {alert.action_hint}</p>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="pt-6 space-y-4">
              <p className="text-center text-light text-[12px]">Ask a follow-up or create a calendar event</p>
              <div className="flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-left text-[12px] font-medium text-blurple bg-blurpleLight border border-blurple/20 rounded-xl px-3 py-2 hover:bg-blurple/10 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blurple text-white rounded-br-sm'
                    : 'bg-white border border-border text-dark rounded-bl-sm shadow-card'
                }`}
              >
                {m.role === 'assistant' ? renderContent(m.content) : m.content}
                {m.eventCreated && <CalendarEventCard event={m.eventCreated} />}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-border rounded-xl rounded-bl-sm shadow-card">
                <TypingDots />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-border shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask a follow-up or say 'Create an event…'"
              rows={1}
              style={{ fontSize: '16px' }}
              className="flex-1 resize-none border border-border rounded-lg px-3 py-2.5 text-dark placeholder-light focus:outline-none focus:border-blurple transition-colors leading-snug"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="btn-primary px-3 py-2 shrink-0 self-end"
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
