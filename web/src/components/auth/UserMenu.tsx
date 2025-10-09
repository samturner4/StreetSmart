'use client';

import { useState } from 'react';

export default function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="absolute top-4 right-4 z-10">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-white rounded-full p-2 shadow-lg hover:bg-gray-50"
      >
        <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-1">
          <a
            href="/auth/signin"
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Sign In
          </a>
          <a
            href="/auth/signup"
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Sign Up
          </a>
        </div>
      )}
    </div>
  );
}