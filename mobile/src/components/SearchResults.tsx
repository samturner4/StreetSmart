import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import { GeocodingResult } from '../services/GeocodingService';
import { Ionicons } from '@expo/vector-icons';

interface SearchResultsProps {
  results: GeocodingResult[];
  onSelectResult: (result: GeocodingResult) => void;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  onSelectResult,
}) => {
  if (results.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
        {results.map((result, index) => (
          <TouchableOpacity
            key={index}
            style={styles.resultItem}
            onPress={() => onSelectResult(result)}
          >
            <Ionicons name="location" size={20} color="#8E8E93" style={styles.icon} />
            <View style={styles.textContainer}>
              <Text style={styles.primaryText} numberOfLines={1}>
                {result.text}
              </Text>
              <Text style={styles.secondaryText} numberOfLines={1}>
                {result.place_name.split(',').slice(1).join(',').trim()}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 115, // Position below search bar
    left: 16,
    right: 16,
    maxHeight: 300,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1000,
  },
  scrollView: {
    maxHeight: 300,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  icon: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  primaryText: {
    fontSize: 16,
    color: '#000',
    marginBottom: 2,
  },
  secondaryText: {
    fontSize: 14,
    color: '#8E8E93',
  },
});



