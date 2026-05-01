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
  Image,
} from 'react-native';
import MapView, { Marker } from 'react-native-map-clustering';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BIRDS from './birds';

const STORAGE_KEY = 'bird_pins';

const NZ_REGION = {
  latitude: -41.5,
  longitude: 172.0,
  latitudeDelta: 14,
  longitudeDelta: 14,
};

export default function App() {
  const [pins, setPins] = useState([]);
  const [pendingCoord, setPendingCoord] = useState(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [listVisible, setListVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [trackedMarkers, setTrackedMarkers] = useState({});
  const mapRef = useRef(null);

  useEffect(() => { loadPins(); }, []);

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
    setSearch('');
    setPickerVisible(true);
  }

  function selectBird(bird) {
    const pin = {
      id: Date.now().toString(),
      coordinate: pendingCoord,
      birdId: bird.id,
      name: bird.name,
      scientific: bird.scientific,
      image: bird.image,
      date: new Date().toLocaleDateString(),
    };
    savePins([...pins, pin]);
    setPickerVisible(false);
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
      { ...pin.coordinate, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      500
    );
  }

  const filteredBirds = BIRDS.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.scientific.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={NZ_REGION}
        onPress={onMapPress}
        clusterColor="#2e7d32"
        clusterTextColor="#fff"
        clusterFontFamily="System"
        radius={60}
        animationEnabled
      >
        {pins.map(pin => (
          <Marker
            key={pin.id}
            coordinate={pin.coordinate}
            title={pin.name}
            description={pin.scientific}
            tracksViewChanges={!trackedMarkers[pin.id]}
            onCalloutPress={() => deletePin(pin.id)}
          >
            <View style={styles.markerContainer}>
              <Image
                source={{ uri: pin.image }}
                style={styles.markerImage}
                onLoad={() =>
                  setTrackedMarkers(prev => ({ ...prev, [pin.id]: true }))
                }
              />
            </View>
          </Marker>
        ))}
      </MapView>

      <TouchableOpacity style={styles.listButton} onPress={() => setListVisible(true)}>
        <Text style={styles.listButtonText}>🦜 {pins.length} Sightings</Text>
      </TouchableOpacity>

      {/* Bird picker modal */}
      <Modal visible={pickerVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.pickerCard]}>
            <Text style={styles.modalTitle}>Select Bird</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search species..."
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
            <FlatList
              data={filteredBirds}
              keyExtractor={b => b.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.birdRow} onPress={() => selectBird(item)}>
                  <Image source={{ uri: item.image }} style={styles.birdThumb} />
                  <View style={styles.birdInfo}>
                    <Text style={styles.birdName}>{item.name}</Text>
                    <Text style={styles.birdSci}>{item.scientific}</Text>
                  </View>
                </TouchableOpacity>
              )}
              keyboardShouldPersistTaps="handled"
            />
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn, { marginTop: 12 }]}
              onPress={() => setPickerVisible(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sightings list modal */}
      <Modal visible={listVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.pickerCard]}>
            <Text style={styles.modalTitle}>All Sightings</Text>
            {pins.length === 0 ? (
              <Text style={styles.emptyText}>No sightings yet. Tap the map to add one!</Text>
            ) : (
              <FlatList
                data={pins}
                keyExtractor={p => p.id}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.birdRow} onPress={() => flyToPin(item)}>
                    <Image source={{ uri: item.image }} style={styles.birdThumb} />
                    <View style={styles.birdInfo}>
                      <Text style={styles.birdName}>{item.name}</Text>
                      <Text style={styles.birdSci}>{item.date}</Text>
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
  markerContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: '#2e7d32',
    overflow: 'hidden',
    backgroundColor: '#e8f5e9',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  markerImage: { width: '100%', height: '100%' },
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
    padding: 20,
    paddingBottom: 40,
  },
  pickerCard: { maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#1b5e20' },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
    marginBottom: 10,
  },
  birdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  birdThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#e8f5e9',
    marginRight: 12,
  },
  birdInfo: { flex: 1 },
  birdName: { fontSize: 15, fontWeight: '600', color: '#1b5e20' },
  birdSci: { fontSize: 12, color: '#888', marginTop: 2, fontStyle: 'italic' },
  deleteText: { color: '#ccc', fontSize: 18, paddingLeft: 12 },
  emptyText: { color: '#888', textAlign: 'center', marginVertical: 20 },
  btn: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#f5f5f5' },
  saveBtn: { backgroundColor: '#2e7d32' },
  cancelText: { color: '#555', fontWeight: '600' },
  saveText: { color: '#fff', fontWeight: '600' },
});
