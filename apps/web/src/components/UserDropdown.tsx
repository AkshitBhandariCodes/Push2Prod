'use client';

import { useState, useRef, useEffect } from 'react';
import { signOut } from 'next-auth/react';

interface UserDropdownProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export default function UserDropdown({ user }: UserDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-8 h-8 rounded-full overflow-hidden border border-border-hairline bg-card-bg hover:ring-2 ring-accent transition-all focus:outline-none"
      >
        {user.image ? (
          <img src={user.image} alt="User avatar" className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm font-semibold text-text-mute">
            {user.name ? user.name.charAt(0).toUpperCase() : '?'}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-card-bg border border-border-hairline shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none animate-in fade-in zoom-in-95 duration-100 z-50">
          <div className="px-4 py-3 border-b border-border-hairline">
            <p className="text-sm font-medium text-text-ink truncate">{user.name}</p>
            <p className="text-xs text-text-mute truncate">{user.email}</p>
          </div>
          <div className="p-1">
            <button
              onClick={() => signOut()}
              className="w-full text-left block px-3 py-2 text-sm text-error rounded-md hover:bg-error/10 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
