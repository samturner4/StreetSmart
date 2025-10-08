import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Share } from 'react-native';
import { RouteSegment } from './RouteDisplay';

interface ShareButtonProps {
  route: RouteSegment[];
  routeType: 'safest' | 'fastest';
}

export default function ShareButton({ route, routeType }: ShareButtonProps) {
  if (!route.length) return null;

  const summarySegment = route[route.length - 1];
  const routeSegments = route.slice(0, -1);

  const handleShare = async () => {
    try {
      // Extract route stats from summary
      const stats = {
        distance: summarySegment.street_name.match(/(\d+\.?\d*)km/)?.[1] || '0',
        duration: summarySegment.street_name.match(/(\d+)min/)?.[1] || '0',
        safety: summarySegment.safety_score
      };

      // Build share message
      const message = [
        `🚶‍♂️ Walk Safe Route (${routeType === 'safest' ? '🛡️ Safest' : '⚡ Fastest'})`,
        ``,
        `📍 Route Summary:`,
        `• Distance: ${stats.distance} km`,
        `• Duration: ${stats.duration} min`,
        `• Safety Score: ${stats.safety}%`,
        ``,
        `🛣️ Route Segments:`,
        ...routeSegments.map(segment => 
          `• ${segment.street_name} (Safety: ${segment.safety_score}/5)`
        ),
        ``,
        `🔗 Open in Walk Safe App:`,
        `walksafe://route?start=${route[0].coordinates[0].join(',')}&end=${route[route.length - 1].coordinates[route[route.length - 1].coordinates.length - 1].join(',')}&type=${routeType}`
      ].join('\\n');

      await Share.share({
        message,
        title: 'Share Walk Safe Route'
      });
    } catch (error) {
      console.error('Error sharing route:', error);
    }
  };

  return (
    <TouchableOpacity style={styles.button} onPress={handleShare}>
      <Text style={styles.buttonText}>Share Route</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
});

