import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import AuthModal from './AuthModal';

export default function UserMenu() {
  const { user, signOut } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  const handleAuthClick = (mode: 'signin' | 'signup') => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  return (
    <div className="absolute top-4 right-4 z-10">
      {user ? (
        <div className="bg-white rounded-lg shadow-lg p-4">
          <div className="flex items-center gap-4">
            <span className="text-gray-700">{user.email}</span>
            <button
              onClick={() => signOut()}
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-lg p-4">
          <div className="flex gap-2">
            <button
              onClick={() => handleAuthClick('signin')}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => handleAuthClick('signup')}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors"
            >
              Sign Up
            </button>
          </div>
        </div>
      )}

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        mode={authMode}
        onModeChange={setAuthMode}
      />
    </div>
  );
} 