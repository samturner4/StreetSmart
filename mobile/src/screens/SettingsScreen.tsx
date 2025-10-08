import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function SettingsScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const { isDarkMode: darkModeEnabled, toggleDarkMode: setDarkModeEnabled } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      
      <View style={styles.settingItem}>
        <Text style={styles.settingLabel}>Safety Notifications</Text>
        <Switch
          value={notificationsEnabled}
          onValueChange={setNotificationsEnabled}
        />
      </View>
      
      <View style={styles.settingItem}>
        <Text style={styles.settingLabel}>Dark Mode</Text>
        <Switch
          value={darkModeEnabled}
          onValueChange={setDarkModeEnabled}
        />
      </View>
      
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>About Walk Safe</Text>
        <Text style={styles.infoText}>
          Version 1.0.0{'\n'}
          Find the safest routes to your destination
        </Text>
      </View>
    </View>
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
    marginBottom: 30,
    textAlign: 'center',
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
  },
  infoSection: {
    marginTop: 40,
    padding: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});
