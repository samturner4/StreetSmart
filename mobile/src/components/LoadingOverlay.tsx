import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Animated } from 'react-native';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  progress?: number;
}

export default function LoadingOverlay({ visible, message, progress }: LoadingOverlayProps) {
  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <ActivityIndicator size="large" color="#4285F4" />
        {message && <Text style={styles.message}>{message}</Text>}
        {progress !== undefined && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <Animated.View 
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, Math.max(0, progress))}%` }
                ]}
              />
            </View>
            <Text style={styles.progressText}>{Math.round(progress)}%</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    minWidth: 200,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  message: {
    marginTop: 16,
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
  progressContainer: {
    marginTop: 16,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    overflow: 'hidden',
    marginRight: 8,
  },
  progressFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: '#4285F4',
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    minWidth: 40,
    textAlign: 'right',
  },
});

