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
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker } from 'react-native-map-clustering';
import { Marker as RNMarker } from 'react-native-maps';
import * as Location from 'expo-location';
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
  const [userLocation, setUserLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const mapRef = useRef(null);
  const clusterPressed = useRef(false);

  useEffect(() => {
    loadPins();
    requestLocation();
  }, []);

  async function requestLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({});
    setUserLocation({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    });
  }

  async function goToMyLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Enable location access in Settings.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setUserLocation(coord);
      mapRef.current?.animateToRegion(
        { ...coord, latitudeDelta: 0.05, longitudeDelta: 0.05 },
        600
      );
    } finally {
      setLocating(false);
    }
  }

  async function addBirdAtMyLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Enable location access in Settings.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setPendingCoord({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      setSearch('');
      setPickerVisible(true);
    } finally {
      setLocating(false);
    }
  }

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
    if (clusterPressed.current) return;
    setPendingCoord(e.nativeEvent.coordinate);
    setSearch('');
    setPickerVisible(true);
  }

  function onClusterPress(cluster, markers) {
    clusterPressed.current = true;
    setTimeout(() => { clusterPressed.current = false; }, 500);
    const coords = markers.map(m => ({
      latitude: m.geometry.coordinates[1],
      longitude: m.geometry.coordinates[0],
    }));
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 120, right: 80, bottom: 120, left: 80 },
      animated: true,
    });
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
        onClusterPress={onClusterPress}
        showsUserLocation
      >
        {pins.map(pin => (
          <RNMarker
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
          </RNMarker>
        ))}
      </MapView>

      {/* Top-right location buttons */}
      <View style={styles.locationButtons}>
        <TouchableOpacity style={styles.iconButton} onPress={goToMyLocation} disabled={locating}>
          {locating ? (
            <ActivityIndicator size="small" color="#2e7d32" />
          ) : (
            <Text style={styles.iconText}>📍</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.iconButton, styles.addHereButton]} onPress={addBirdAtMyLocation} disabled={locating}>
          <Text style={styles.iconText}>🦜＋</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom sightings button */}
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
  locationButtons: {
    position: 'absolute',
    top: 60,
    right: 16,
    gap: 10,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  addHereButton: {
    backgroundColor: '#e8f5e9',
  },
  iconText: { fontSize: 20 },
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
