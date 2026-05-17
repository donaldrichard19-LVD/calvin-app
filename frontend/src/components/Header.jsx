import React from 'react';
import { UserButton } from '@clerk/clerk-react';

export default function Header() {
  return (
    <header className="h-14 bg-white border-b border-border flex items-center justify-between px-6 shrink-0">
      <span className="text-dark font-bold text-lg tracking-tight">Calvin</span>
      <UserButton afterSignOutUrl="/" />
    </header>
  );
}
