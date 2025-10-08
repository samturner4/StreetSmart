import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ApiService, GeocodeResult } from '../services/api';

export default function SearchScreen() {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodeResult['features']>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Error', 'Please enter a destination address');
      return;
    }

    setIsLoading(true);
    try {
      const results = await ApiService.geocode(searchQuery);
      setSearchResults(results.features);
    } catch (error) {
      Alert.alert('Error', 'Failed to search for address. Please try again.');
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectLocation = (feature: GeocodeResult['features'][0]) => {
    // Navigate back to map and plan route
    navigation.navigate('Map' as never);
    
    // TODO: Pass the selected location to the map screen
    // For now, just show an alert
    Alert.alert(
      'Location Selected', 
      `Selected: ${feature.place_name}\n\nNavigate to the Map tab to see your location and plan a route.`
    );
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Find Safe Route</Text>
      
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.input}
          placeholder="Enter destination address..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity 
          style={[styles.button, isLoading && styles.buttonDisabled]} 
          onPress={handleSearch}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? 'Searching...' : 'Search'}
          </Text>
        </TouchableOpacity>
      </View>

      {searchResults.length > 0 && (
        <View style={styles.resultsContainer}>
          <Text style={styles.resultsTitle}>Search Results:</Text>
          {searchResults.map((result, index) => (
            <TouchableOpacity
              key={index}
              style={styles.resultItem}
              onPress={() => handleSelectLocation(result)}
            >
              <Text style={styles.resultText}>{result.place_name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.helpContainer}>
        <Text style={styles.helpTitle}>How to use:</Text>
        <Text style={styles.helpText}>
          1. Search for your destination address{'\n'}
          2. Select a location from the results{'\n'}
          3. Go to the Map tab to plan your route{'\n'}
          4. The app will show the safest path to your destination
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    justifyContent: 'center',
    minWidth: 80,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  resultsContainer: {
    marginTop: 20,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#333',
  },
  resultItem: {
    padding: 15,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#f8f9fa',
  },
  resultText: {
    fontSize: 16,
    color: '#333',
  },
  helpContainer: {
    marginTop: 30,
    padding: 20,
    backgroundColor: '#f0f8ff',
    borderRadius: 10,
  },
  helpTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#333',
  },
  helpText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});
