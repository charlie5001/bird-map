import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'bird_pins';

export default function App() {
  const [pins, setPins] = useState([]);
  const [pendingCoord, setPendingCoord] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [listVisible, setListVisible] = useState(false);
  const [birdName, setBirdName] = useState('');
  const [notes, setNotes] = useState('');
  const [region, setRegion] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      } else {
        setRegion({
          latitude: 37.7749,
          longitude: -122.4194,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      }
    })();
    loadPins();
  }, []);

  async function loadPins() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) setPins(JSON.parse(raw));
    } catch {}
  }

  async function savePins(updated) {
    setPins(updated);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  function onMapPress(e) {
    setPendingCoord(e.nativeEvent.coordinate);
    setBirdName('');
    setNotes('');
    setModalVisible(true);
  }

  function confirmPin() {
    if (!birdName.trim()) {
      Alert.alert('Bird name required', 'Please enter the species name.');
      return;
    }
    const pin = {
      id: Date.now().toString(),
      coordinate: pendingCoord,
      name: birdName.trim(),
      notes: notes.trim(),
      date: new Date().toLocaleDateString(),
    };
    savePins([...pins, pin]);
    setModalVisible(false);
  }

  function deletePin(id) {
    Alert.alert('Delete sighting', 'Remove this bird pin?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => savePins(pins.filter(p => p.id !== id)),
      },
    ]);
  }

  function flyToPin(pin) {
    setListVisible(false);
    mapRef.current?.animateToRegion(
      { ...pin.coordinate, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      500
    );
  }

  if (!region) {
    return (
      <View style={styles.loading}>
        <Text>Loading map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        onPress={onMapPress}
      >
        {pins.map(pin => (
          <Marker
            key={pin.id}
            coordinate={pin.coordinate}
            title={pin.name}
            description={pin.notes || pin.date}
            pinColor="#2e7d32"
            onCalloutPress={() => deletePin(pin.id)}
          />
        ))}
      </MapView>

      <TouchableOpacity style={styles.listButton} onPress={() => setListVisible(true)}>
        <Text style={styles.listButtonText}>🦜 {pins.length} Sightings</Text>
      </TouchableOpacity>

      {/* Add pin modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Bird Sighting</Text>
            <TextInput
              style={styles.input}
              placeholder="Species name *"
              value={birdName}
              onChangeText={setBirdName}
              autoFocus
            />
            <TextInput
              style={[styles.input, styles.notesInput]}
              placeholder="Notes (optional)"
              value={notes}
              onChangeText={setNotes}
              multiline
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.btn, styles.cancelBtn]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.saveBtn]} onPress={confirmPin}>
                <Text style={styles.saveText}>Save Pin</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Sightings list modal */}
      <Modal visible={listVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.listCard]}>
            <Text style={styles.modalTitle}>All Sightings</Text>
            {pins.length === 0 ? (
              <Text style={styles.emptyText}>No sightings yet. Tap the map to add one!</Text>
            ) : (
              <FlatList
                data={pins}
                keyExtractor={p => p.id}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.listItem} onPress={() => flyToPin(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listName}>{item.name}</Text>
                      <Text style={styles.listMeta}>{item.date}{item.notes ? ` · ${item.notes}` : ''}</Text>
                    </View>
                    <TouchableOpacity onPress={() => deletePin(item.id)}>
                      <Text style={styles.deleteText}>✕</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity
              style={[styles.btn, styles.saveBtn, { marginTop: 12 }]}
              onPress={() => setListVisible(false)}
            >
              <Text style={styles.saveText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listButton: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: '#2e7d32',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  listButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  listCard: { maxHeight: '70%' },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#1b5e20' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  notesInput: { height: 80, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 4 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#f5f5f5' },
  saveBtn: { backgroundColor: '#2e7d32' },
  cancelText: { color: '#555', fontWeight: '600' },
  saveText: { color: '#fff', fontWeight: '600' },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  listName: { fontSize: 15, fontWeight: '600', color: '#1b5e20' },
  listMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  deleteText: { color: '#ccc', fontSize: 18, paddingLeft: 12 },
  emptyText: { color: '#888', textAlign: 'center', marginVertical: 20 },
});
