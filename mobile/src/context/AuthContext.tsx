import React, { createContext, useContext, useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { AuthContextType, AuthState } from '../types/auth';
import { SecureStorageService } from '../services/SecureStorageService';

const initialState: AuthState = {
  user: null,
  session: null,
  loading: true,
  error: null,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>(initialState);

  useEffect(() => {
    // Check SecureStore availability first
    const initializeAuth = async () => {
      console.log('[AuthContext] Initializing...');
      
      const isSecureStoreAvailable = await SecureStorageService.isAvailable();
      console.log('[AuthContext] SecureStore available:', isSecureStoreAvailable);
      
      if (!isSecureStoreAvailable) {
        console.error('[AuthContext] SecureStore is not available on this device');
        setState(current => ({
          ...current,
          error: 'Secure storage is not available on this device',
          loading: false,
        }));
        return;
      }

      // Test SecureStore operations
      const testResult = await SecureStorageService.testStorage();
      console.log('[AuthContext] SecureStore test result:', testResult);
      
      if (!testResult) {
        console.error('[AuthContext] SecureStore test failed');
        setState(current => ({
          ...current,
          error: 'Secure storage test failed',
          loading: false,
        }));
        return;
      }

      // If all tests pass, proceed with user session check
      await checkUser();
    };

    initializeAuth();
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        // Save session data securely
        await SecureStorageService.saveSession(JSON.stringify(session));
        await SecureStorageService.saveAuthTokens(
          session.access_token,
          session.refresh_token ?? ''
        );
      } else {
        // Clear secure storage on session end
        await SecureStorageService.clearAuthData();
      }

      setState(current => ({
        ...current,
        user: session?.user ?? null,
        session,
        loading: false,
      }));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkUser = async () => {
    try {
      // First try to get session from secure storage
      const storedSession = await SecureStorageService.getSession();
      if (storedSession) {
        const session = JSON.parse(storedSession);
        const { accessToken, refreshToken } = await SecureStorageService.getAuthTokens();
        
        if (accessToken && refreshToken) {
          // Set the session in Supabase client
          const { data: { session: newSession }, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          
          if (!error && newSession) {
            setState(current => ({
              ...current,
              user: newSession.user,
              session: newSession,
              loading: false,
            }));
            return;
          }
        }
      }

      // If no stored session or token refresh failed, get fresh session
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      
      if (session) {
        await SecureStorageService.saveSession(JSON.stringify(session));
        await SecureStorageService.saveAuthTokens(
          session.access_token,
          session.refresh_token ?? ''
        );
      }

      setState(current => ({
        ...current,
        user: session?.user ?? null,
        session,
        loading: false,
      }));
    } catch (error) {
      console.error('Error checking user session:', error);
      setState(current => ({
        ...current,
        loading: false,
        error: 'Failed to load user session',
      }));
      // Clear any potentially invalid stored data
      await SecureStorageService.clearAuthData();
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      setState(current => ({ ...current, loading: true, error: null }));
      
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) throw error;
    } catch (error) {
      console.error('Sign in error:', error);
      setState(current => ({
        ...current,
        error: 'Failed to sign in',
        loading: false,
      }));
      Alert.alert('Error', 'Failed to sign in. Please check your credentials and try again.');
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      setState(current => ({ ...current, loading: true, error: null }));
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      
      if (error) throw error;
      
      Alert.alert(
        'Verification Required',
        'Please check your email for a verification link to complete your registration.'
      );
    } catch (error) {
      console.error('Sign up error:', error);
      setState(current => ({
        ...current,
        error: 'Failed to sign up',
        loading: false,
      }));
      Alert.alert('Error', 'Failed to create account. Please try again.');
    }
  };

  const signOut = async () => {
    try {
      setState(current => ({ ...current, loading: true, error: null }));
      
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // Clear secure storage
      await SecureStorageService.clearAuthData();
    } catch (error) {
      console.error('Sign out error:', error);
      setState(current => ({
        ...current,
        error: 'Failed to sign out',
        loading: false,
      }));
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    }
  };

  const resetPassword = async (email: string) => {
    try {
      setState(current => ({ ...current, loading: true, error: null }));
      
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      
      Alert.alert(
        'Password Reset',
        'If an account exists for this email, you will receive password reset instructions.'
      );
    } catch (error) {
      console.error('Password reset error:', error);
      setState(current => ({
        ...current,
        error: 'Failed to reset password',
        loading: false,
      }));
      Alert.alert('Error', 'Failed to reset password. Please try again.');
    }
  };

  const value = {
    ...state,
    signIn,
    signUp,
    signOut,
    resetPassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
