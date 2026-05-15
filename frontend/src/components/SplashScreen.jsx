import React, { useState, useEffect } from 'react';

const LETTERS = ['C', 'A', 'L', 'V', 'I', 'N'];

// House appears at 0s, letters stagger from 0.5s, exit at 2.5s, done at 3.05s
const EXIT_AT = 2500;
const DONE_AT = 3050;

function HouseIcon() {
  return (
    <svg
      width="88"
      height="88"
      viewBox="0 0 72 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Main house body — roof peak + walls as one pentagon */}
      <path d="M36 7L67 33V66H5V33L36 7Z" fill="#5865F2" />
      {/* Door */}
      <rect x="26" y="45" width="20" height="21" rx="2" fill="white" />
      {/* Left window */}
      <rect x="9" y="36" width="15" height="11" rx="2" fill="white" opacity="0.7" />
      {/* Right window */}
      <rect x="48" y="36" width="15" height="11" rx="2" fill="white" opacity="0.7" />
      {/* Chimney */}
      <rect x="50" y="10" width="8" height="16" rx="1" fill="#4752C4" />
    </svg>
  );
}

export default function SplashScreen({ onComplete }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setExiting(true), EXIT_AT);
    const t2 = setTimeout(onComplete, DONE_AT);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onComplete]);

  return (
    <div className={`splash-root${exiting ? ' splash-exit' : ''}`}>
      <div className="splash-house">
        <HouseIcon />
      </div>

      <div className="flex items-end gap-[3px] mt-5">
        {LETTERS.map((letter, i) => (
          <span
            key={i}
            className="splash-letter"
            style={{ animationDelay: `${0.5 + i * 0.14}s` }}
          >
            {letter}
          </span>
        ))}
      </div>
    </div>
  );
}
