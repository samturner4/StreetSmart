import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SearchBarProps {
  value: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmit?: () => void;
  editable?: boolean;
  showMyLocation?: boolean;
  onMyLocationPress?: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChangeText,
  placeholder = 'Search',
  onFocus,
  onBlur,
  onSubmit,
  editable = true,
  showMyLocation = false,
  onMyLocationPress,
}) => {
  return (
    <View style={styles.container}>
      {showMyLocation && (
        <TouchableOpacity 
          style={styles.myLocationButton}
          onPress={onMyLocationPress}
        >
          <Ionicons name="location" size={16} color="#007AFF" />
          <Text style={styles.myLocationText}>My Location</Text>
        </TouchableOpacity>
      )}
      <View style={styles.searchContainer}>
        <Ionicons 
          name="search" 
          size={20} 
          color="#8E8E93" 
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#8E8E93"
          onFocus={onFocus}
          onBlur={onBlur}
          onSubmitEditing={onSubmit}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          editable={editable}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Platform.select({
      ios: '#FFFFFF',
      android: '#FFFFFF',
    }),
    borderRadius: 25,
    paddingHorizontal: 16,
    height: 44,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: Platform.select({
      ios: '#E5E5EA',
      android: '#E0E0E0',
    }),
  },
  searchIcon: {
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: 17,
    color: '#000',
    height: '100%',
    paddingVertical: 0, // Remove default padding
    marginLeft: 8,
  },
  myLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F8FF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  myLocationText: {
    fontSize: 14,
    color: '#007AFF',
    marginLeft: 4,
    fontWeight: '500',
  },
});
