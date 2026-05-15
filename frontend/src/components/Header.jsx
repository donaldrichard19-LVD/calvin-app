import React from 'react';
import { UserButton } from '@clerk/clerk-react';

export default function Header({ partnerName }) {
  return (
    <header className="h-14 bg-white border-b border-border flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-dark font-bold text-lg tracking-tight">Calvin</span>
        {partnerName && (
          <span className="text-light text-sm ml-1">— {partnerName}'s household</span>
        )}
      </div>
      <UserButton afterSignOutUrl="/" />
    </header>
  );
}
