import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface SafetyScoreIndicatorProps {
  score: number;
  isNormalized?: boolean;
}

export default function SafetyScoreIndicator({ score, isNormalized = false }: SafetyScoreIndicatorProps) {
  // Helper function to get color based on score
  const getColor = (score: number, isNormalized: boolean) => {
    if (isNormalized) {
      // For normalized scores (0-100)
      if (score < 50) return '#ff0000';
      if (score < 75) return '#ffff00';
      return '#0e9737';
    } else {
      // For raw scores (1-5)
      if (score <= 2) return '#ff0000';
      if (score <= 3) return '#ffff00';
      return '#0e9737';
    }
  };

  // Helper function to get label based on score
  const getLabel = (score: number, isNormalized: boolean) => {
    if (isNormalized) {
      if (score < 50) return 'High Risk';
      if (score < 75) return 'Medium Risk';
      return 'Low Risk';
    } else {
      if (score <= 2) return 'High Risk';
      if (score <= 3) return 'Medium Risk';
      return 'Low Risk';
    }
  };

  const color = getColor(score, isNormalized);
  const label = getLabel(score, isNormalized);

  return (
    <View style={styles.container}>
      {/* Score circle */}
      <View style={[styles.circle, { backgroundColor: color }]}>
        <Text style={styles.score}>
          {isNormalized ? `${Math.round(score)}%` : score.toFixed(1)}
        </Text>
      </View>

      {/* Label */}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  score: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
});

