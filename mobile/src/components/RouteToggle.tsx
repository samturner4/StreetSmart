import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Modal, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { RouteType } from '../types/routing';

export interface RouteOption {
  id: string;
  label: string;
  type: RouteType;
  value: number; // detour percentage or safety weight
}

interface RouteToggleProps {
  onRoutesChange: (selectedRoutes: RouteOption[]) => void;
  initialRoutes?: RouteOption[];
}

const RouteToggle: React.FC<RouteToggleProps> = ({ onRoutesChange, initialRoutes = [] }) => {
  const [isModalVisible, setModalVisible] = useState(false);
  const [selectedRoutes, setSelectedRoutes] = useState<RouteOption[]>(initialRoutes);
  const [isSafestExpanded, setIsSafestExpanded] = useState(false);

  // Notify parent of initial selection once on mount
  useEffect(() => {
    onRoutesChange(initialRoutes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mainRouteOptions: RouteOption[] = [
    { id: 'quickest', label: 'Quickest Route', type: 'quickest', value: 0 }
  ];

  const detourOptions: RouteOption[] = [
    { id: 'detour-5', label: '5% Detour', type: 'detour5', value: 5 },
    { id: 'detour-10', label: '10% Detour', type: 'detour10', value: 10 },
    { id: 'detour-15', label: '15% Detour', type: 'detour15', value: 15 },
    { id: 'detour-20', label: '20% Detour', type: 'detour20', value: 20 },
    { id: 'detour-25', label: '25% Detour', type: 'detour25', value: 25 },
    { id: 'detour-30', label: '30% Detour', type: 'detour30', value: 30 }
  ];

  const handleRouteSelect = (route: RouteOption) => {
    let newSelected: RouteOption[];
    
    if (selectedRoutes.find(r => r.id === route.id)) {
      // Attempting to remove
      if (selectedRoutes.length === 1) {
        // Must have at least one route selected; ignore
        return;
      }
      newSelected = selectedRoutes.filter(r => r.id !== route.id);
    } else {
      // Add if less than 3 routes are selected
      if (selectedRoutes.length < 3) {
        newSelected = [...selectedRoutes, route];
      } else {
        // Replace the first selected route if already have 3
        newSelected = [...selectedRoutes.slice(1), route];
      }
    }
    
    setSelectedRoutes(newSelected);
    onRoutesChange(newSelected);
  };

  return (
    <View>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setModalVisible(true)}
      >
        <MaterialIcons name="alt-route" size={28} color="#000" />
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select up to 3 routes</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.optionsList}>
              {/* Quickest Route */}
              {mainRouteOptions.map(route => (
                <TouchableOpacity
                  key={route.id}
                  style={styles.optionItem}
                  onPress={() => handleRouteSelect(route)}
                >
                  <View style={styles.checkboxContainer}>
                    <View style={[
                      styles.checkbox,
                      selectedRoutes.some(r => r.id === route.id) && styles.checkboxSelected
                    ]} />
                    <Text style={styles.optionText}>{route.label}</Text>
                  </View>
                </TouchableOpacity>
              ))}

              {/* Safest Route - Expandable */}
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => setIsSafestExpanded(!isSafestExpanded)}
              >
                <View style={styles.checkboxContainer}>
                  <MaterialIcons 
                    name={isSafestExpanded ? "expand-less" : "expand-more"} 
                    size={20} 
                    color="#666" 
                    style={styles.expandIcon}
                  />
                  <Text style={styles.optionText}>Safest Route</Text>
                </View>
              </TouchableOpacity>

              {/* Detour Options - Show when expanded */}
              {isSafestExpanded && detourOptions.map(route => (
                <TouchableOpacity
                  key={route.id}
                  style={[styles.optionItem, styles.subOption]}
                  onPress={() => handleRouteSelect(route)}
                >
                  <View style={styles.checkboxContainer}>
                    <View style={[
                      styles.checkbox,
                      selectedRoutes.some(r => r.id === route.id) && styles.checkboxSelected
                    ]} />
                    <Text style={styles.optionText}>{route.label}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'white',
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 20,
    color: '#666',
  },
  optionsList: {
    marginBottom: 20,
  },
  optionItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expandIcon: {
    marginRight: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#007AFF',
    marginRight: 12,
  },
  checkboxSelected: {
    backgroundColor: '#007AFF',
  },
  optionText: {
    fontSize: 16,
    color: '#333',
  },
  subOption: {
    paddingLeft: 20,
    backgroundColor: '#f8f9fa',
  },
});

export default RouteToggle;
