import React from 'react';
import { LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import TabNavigator from './src/navigation/TabNavigator';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { AuthProvider } from './src/context/AuthContext';
import 'react-native-url-polyfill/auto';

// Suppress the native module warning when the dev client hasn't been rebuilt yet.
LogBox.ignoreLogs(['AsyncStorage is null']);

function AppInner() {
  const { isDarkMode } = useTheme();
  return (
    <NavigationContainer>
      <TabNavigator />
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ThemeProvider>
  );
}
