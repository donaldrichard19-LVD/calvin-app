import React, { useState, useRef, useEffect } from 'react';
import { apiFetch } from '../lib/api';

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

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);

    try {
      const { content } = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ alertId: alert.id, messages: next }),
      });
      setMessages([...next, { role: 'assistant', content }]);
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
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />
      <div
        className="fixed top-0 right-0 h-full z-50 bg-white flex flex-col"
        style={{
          width: 'clamp(320px, 420px, 100vw)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          transition: 'transform 0.25s ease',
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-dark truncate">{alert?.title}</div>
          </div>
          <button
            onClick={onClose}
            className="text-mid hover:text-dark text-xl leading-none"
          >
            ×
          </button>
        </div>

        {alert && (
          <div className="px-4 py-3 bg-gray-50 border-b border-border shrink-0">
            <p className="text-[12px] text-mid leading-relaxed">{alert.summary}</p>
            {alert.action_hint && (
              <p className="text-[12px] italic text-coral mt-1">→ {alert.action_hint}</p>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-light text-[12px] pt-8">
              Ask a follow-up question about this alert
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
                {m.content}
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

        <div className="px-4 py-3 border-t border-border shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask a follow-up…"
              rows={2}
              className="flex-1 resize-none border border-border rounded-lg px-3 py-2 text-[13px] text-dark placeholder-light focus:outline-none focus:border-blurple transition-colors"
            />
            <button
              onClick={sendMessage}
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
