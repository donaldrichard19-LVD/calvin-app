import React, { useState, useRef, useEffect } from 'react';

const EMOJI_OPTIONS = [
  '🧑', '👩', '👨', '🧔', '👱', '😊', '😎', '🤓',
  '🙂', '😄', '🧑‍💻', '👩‍💻', '🧘', '🏃', '☕', '🌟',
  '🦁', '🦊', '🐼', '🐨', '🌸', '⚡', '🎯', '🏄',
];

export default function EmojiAvatar({ emoji, isA, onChangeEmoji, name }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-9 h-9 rounded-full flex items-center justify-center text-xl border-2 bg-white transition-shadow hover:shadow-md focus:outline-none ${
          isA ? 'border-coral' : 'border-dark'
        }`}
        title={`Change ${name}'s emoji`}
      >
        {emoji}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-card-hover border border-border p-2 w-[200px]">
          <p className="text-[10px] text-light font-semibold uppercase tracking-wider px-1 mb-1.5">
            Choose emoji
          </p>
          <div className="grid grid-cols-6 gap-0.5">
            {EMOJI_OPTIONS.map((e) => (
              <button
                key={e}
                onClick={() => { onChangeEmoji(e); setOpen(false); }}
                className={`w-7 h-7 rounded-lg text-lg flex items-center justify-center hover:bg-gray-100 transition-colors ${
                  e === emoji ? 'bg-blurpleLight ring-1 ring-blurple' : ''
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
