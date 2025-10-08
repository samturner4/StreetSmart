import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { AuthInput } from '../components/auth/AuthInput';
import { SafeAreaView } from 'react-native-safe-area-context';

type AuthMode = 'signin' | 'signup' | 'reset';

export default function AuthScreen() {
  const { signIn, signUp, resetPassword, loading, error } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const validateForm = () => {
    if (!email.trim()) {
      setValidationError('Email is required');
      return false;
    }
    if (mode !== 'reset' && !password.trim()) {
      setValidationError('Password is required');
      return false;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      switch (mode) {
        case 'signin':
          await signIn(email, password);
          break;
        case 'signup':
          await signUp(email, password);
          break;
        case 'reset':
          await resetPassword(email);
          setMode('signin');
          break;
      }
    } catch (err) {
      console.error('Auth error:', err);
    }
  };

  const renderForm = () => {
    switch (mode) {
      case 'signin':
        return (
          <>
            <Text style={styles.title}>Welcome Back</Text>
            <AuthInput
              label="Email"
              placeholder="Enter your email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoComplete="email"
              error={validationError}
            />
            <AuthInput
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              error={validationError}
            />
            <TouchableOpacity
              style={styles.forgotPassword}
              onPress={() => setMode('reset')}
            >
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>
          </>
        );

      case 'signup':
        return (
          <>
            <Text style={styles.title}>Create Account</Text>
            <AuthInput
              label="Email"
              placeholder="Enter your email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoComplete="email"
              error={validationError}
            />
            <AuthInput
              label="Password"
              placeholder="Create a password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              error={validationError}
            />
            <AuthInput
              label="Confirm Password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              error={validationError}
            />
          </>
        );

      case 'reset':
        return (
          <>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>
              Enter your email to receive password reset instructions
            </Text>
            <AuthInput
              label="Email"
              placeholder="Enter your email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoComplete="email"
              error={validationError}
            />
          </>
        );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.formContainer}>
            {renderForm()}

            {error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>
                  {mode === 'signin'
                    ? 'Sign In'
                    : mode === 'signup'
                    ? 'Sign Up'
                    : 'Reset Password'}
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {mode === 'signin'
                  ? "Don't have an account? "
                  : mode === 'signup'
                  ? 'Already have an account? '
                  : 'Remember your password? '}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  setMode(mode === 'signin' ? 'signup' : 'signin')
                }
              >
                <Text style={styles.footerLink}>
                  {mode === 'signin'
                    ? 'Sign Up'
                    : mode === 'signup'
                    ? 'Sign In'
                    : 'Sign In'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  formContainer: {
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 24,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    color: '#007AFF',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    backgroundColor: '#999',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    color: '#666',
    fontSize: 14,
  },
  footerLink: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
});




