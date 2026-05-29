import React, { useState, useRef, useEffect } from 'react';

const TONE_MODIFIERS = ['\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];

const SKIN_TONES = [
  { modifier: '', color: '#FFCA28' },
  { modifier: '\u{1F3FB}', color: '#FFDBB4' },
  { modifier: '\u{1F3FC}', color: '#E8BE93' },
  { modifier: '\u{1F3FD}', color: '#C47B47' },
  { modifier: '\u{1F3FE}', color: '#8B5E3C' },
  { modifier: '\u{1F3FF}', color: '#5A3825' },
];

// Emojis that accept a skin tone modifier
const SKIN_TONE_CAPABLE = new Set([
  '🧑', '👩', '👨', '🧔', '👱', '🧑‍💻', '👩‍💻', '🧘', '🏃', '🏄',
]);

// ZWJ sequences: tone goes after the first codepoint, before the ZWJ
const ZWJ_CAPABLE = new Set(['🧑‍💻', '👩‍💻']);

const EMOJI_OPTIONS = [
  '🧑', '👩', '👨', '🧔', '👱', '😊', '😎', '🤓',
  '🙂', '😄', '🧑‍💻', '👩‍💻', '🧘', '🏃', '☕', '🌟',
  '🦁', '🦊', '🐼', '🐨', '🌸', '⚡', '🎯', '🏄',
];

function detectTone(emoji) {
  for (const t of TONE_MODIFIERS) {
    if (emoji.includes(t)) return t;
  }
  return '';
}

function stripTone(emoji) {
  let result = emoji;
  for (const t of TONE_MODIFIERS) result = result.split(t).join('');
  return result;
}

function applyTone(emoji, modifier) {
  if (!modifier || !SKIN_TONE_CAPABLE.has(emoji)) return emoji;
  if (ZWJ_CAPABLE.has(emoji)) {
    const chars = [...emoji]; // Unicode-aware split
    return chars[0] + modifier + chars.slice(1).join('');
  }
  return emoji + modifier;
}

export default function EmojiAvatar({ emoji, isA, onChangeEmoji, name, alignRight = false }) {
  const [open, setOpen] = useState(false);
  const [skinTone, setSkinTone] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (open) setSkinTone(detectTone(emoji));
  }, [open, emoji]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const baseEmoji = stripTone(emoji);

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
        <div className={`absolute ${alignRight ? 'right-0' : 'left-0'} top-full mt-1.5 z-50 bg-white rounded-xl shadow-card-hover border border-border p-2 w-[200px]`}>
          <p className="text-[10px] text-light font-semibold uppercase tracking-wider px-1 mb-1.5">
            Choose emoji
          </p>

          {/* Skin tone selector */}
          <div className="flex items-center gap-1 px-1 mb-2">
            <span className="text-[10px] text-light mr-0.5">Tone</span>
            {SKIN_TONES.map(({ modifier, color }) => (
              <button
                key={modifier || 'default'}
                onClick={() => setSkinTone(modifier)}
                title={modifier || 'Default'}
                style={{ backgroundColor: color }}
                className={`w-4 h-4 rounded-full flex-shrink-0 transition-all ${
                  skinTone === modifier
                    ? 'ring-2 ring-offset-1 ring-blurple scale-110'
                    : 'hover:scale-110'
                }`}
              />
            ))}
          </div>

          <div className="grid grid-cols-6 gap-0.5">
            {EMOJI_OPTIONS.map((e) => {
              const display = applyTone(e, skinTone);
              const isSelected = baseEmoji === e;
              return (
                <button
                  key={e}
                  onClick={() => { onChangeEmoji(display); setOpen(false); }}
                  className={`w-7 h-7 rounded-lg text-lg flex items-center justify-center hover:bg-gray-100 transition-colors ${
                    isSelected ? 'bg-blurpleLight ring-1 ring-blurple' : ''
                  }`}
                >
                  {display}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
