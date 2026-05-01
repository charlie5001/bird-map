import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  Modal, FlatList, Alert, Image, ActivityIndicator, Keyboard, Platform,
} from 'react-native';
import MapView from 'react-native-map-clustering';
import { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BIRDS from './birds';

const STORAGE_KEY = 'bird_pins';
const NZ_REGION = { latitude: -41.5, longitude: 172.0, latitudeDelta: 14, longitudeDelta: 14 };

export default function App() {
  const [pins, setPins] = useState([]);
  const [pendingCoord, setPendingCoord] = useState(null);
  const [pendingPinId, setPendingPinId] = useState(null); // null = new pin, string = add to existing
  const [pickerVisible, setPickerVisible] = useState(false);
  const [listVisible, setListVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedPin, setSelectedPin] = useState(null);
  const [search, setSearch] = useState('');
  const [trackedMarkers, setTrackedMarkers] = useState({});
  const [failedImages, setFailedImages] = useState({});
  const [locating, setLocating] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const mapRef = useRef(null);
  const clusterPressed = useRef(false);
  const modalClosing = useRef(false);
  const currentRegion = useRef(NZ_REGION);

  useEffect(() => {
    loadPins();
    requestLocation();
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  async function requestLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    await Location.getCurrentPositionAsync({});
  }

  async function goToMyLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission denied', 'Enable location in Settings.'); return; }
      const loc = await Location.getCurrentPositionAsync({});
      const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      const { latitudeDelta, longitudeDelta } = currentRegion.current;
      mapRef.current?.animateToRegion({ ...coord, latitudeDelta, longitudeDelta }, 600);
    } finally { setLocating(false); }
  }

  async function addBirdAtMyLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission denied', 'Enable location in Settings.'); return; }
      const loc = await Location.getCurrentPositionAsync({});
      openPickerForNewPin({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } finally { setLocating(false); }
  }

  async function loadPins() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const migrated = parsed.map(p => {
        if (p.birds) return p;
        return {
          id: p.id,
          coordinate: p.coordinate,
          birds: [{ birdId: p.birdId, name: p.name, scientific: p.scientific, image: p.image, date: p.date }],
        };
      });
      setPins(migrated);
    } catch {}
  }

  async function savePins(updated) {
    setPins(updated);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  function openPickerForNewPin(coord) {
    setPendingCoord(coord);
    setPendingPinId(null);
    setSearch('');
    setPickerVisible(true);
  }

  function openPickerForExistingPin(pin) {
    setPendingPinId(pin.id);
    setSearch('');
    setDetailVisible(false);
    setPickerVisible(true);
  }

  function onMapPress(e) {
    if (clusterPressed.current || modalClosing.current) return;
    openPickerForNewPin(e.nativeEvent.coordinate);
  }

  function closeModal(setter) {
    modalClosing.current = true;
    setter(false);
    setTimeout(() => { modalClosing.current = false; }, 400);
  }

  function onClusterPress(cluster) {
    clusterPressed.current = true;
    setTimeout(() => { clusterPressed.current = false; }, 500);
    const latitude = cluster.geometry.coordinates[1];
    const longitude = cluster.geometry.coordinates[0];
    const { latitudeDelta, longitudeDelta } = currentRegion.current;
    mapRef.current?.animateToRegion({
      latitude,
      longitude,
      latitudeDelta: latitudeDelta * 0.35,
      longitudeDelta: longitudeDelta * 0.35,
    }, 500);
  }

  function onMarkerPress(pin) {
    setSelectedPin(pin);
    setDetailVisible(true);
  }

  function selectBird(bird) {
    const entry = { birdId: bird.id, name: bird.name, scientific: bird.scientific, image: bird.image, emoji: bird.emoji, date: new Date().toLocaleDateString() };
    if (pendingPinId) {
      // Add bird to existing pin
      const updated = pins.map(p =>
        p.id === pendingPinId ? { ...p, birds: [...p.birds, entry] } : p
      );
      savePins(updated);
      setSelectedPin(updated.find(p => p.id === pendingPinId));
      setDetailVisible(true);
    } else {
      // Create new pin
      const pin = { id: Date.now().toString(), coordinate: pendingCoord, birds: [entry] };
      savePins([...pins, pin]);
    }
    setPickerVisible(false);
  }

  function deleteBirdFromPin(pinId, birdIdx) {
    const updated = pins.map(p => {
      if (p.id !== pinId) return p;
      const birds = p.birds.filter((_, i) => i !== birdIdx);
      return { ...p, birds };
    }).filter(p => p.birds.length > 0);
    savePins(updated);
    const refreshed = updated.find(p => p.id === pinId);
    if (refreshed) setSelectedPin(refreshed);
    else setDetailVisible(false);
  }

  function deletePin(pinId) {
    Alert.alert('Delete pin', 'Remove this pin and all its sightings?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        savePins(pins.filter(p => p.id !== pinId));
        closeModal(setDetailVisible);
      }},
    ]);
  }

  function flyToPin(pin) {
    setListVisible(false);
    mapRef.current?.animateToRegion({ ...pin.coordinate, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 500);
  }

  const filteredBirds = BIRDS.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.scientific.toLowerCase().includes(search.toLowerCase())
  );

  const totalSightings = pins.reduce((sum, p) => sum + p.birds.length, 0);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={NZ_REGION}
        onPress={onMapPress}
        clusterColor="#1b5e20"
        clusterTextColor="#fff"
        clusterFontFamily="System"
        radius={35}
        clusteringEnabled
        spiderLineColor="#2e7d32"
        animationEnabled
        onClusterPress={onClusterPress}
        onRegionChangeComplete={r => { currentRegion.current = r; }}
        showsUserLocation
      >
        {pins.map(pin => (
          <Marker
            key={pin.id}
            coordinate={pin.coordinate}
            tracksViewChanges={!trackedMarkers[pin.id]}
            onPress={() => onMarkerPress(pin)}
          >
            <View style={styles.markerContainer}>
              {failedImages[pin.id] ? (
                <View style={styles.markerFallback}>
                  <Text style={styles.markerEmoji}>{pin.birds[0].emoji ?? '🐦'}</Text>
                </View>
              ) : (
                <Image
                  source={{ uri: pin.birds[0].image }}
                  style={styles.markerImage}
                  onLoad={() => setTrackedMarkers(prev => ({ ...prev, [pin.id]: true }))}
                  onError={() => {
                    setFailedImages(prev => ({ ...prev, [pin.id]: true }));
                    setTrackedMarkers(prev => ({ ...prev, [pin.id]: true }));
                  }}
                />
              )}
              {pin.birds.length > 1 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pin.birds.length}</Text>
                </View>
              )}
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Top-right buttons */}
      <View style={styles.locationButtons}>
        <TouchableOpacity style={styles.iconButton} onPress={goToMyLocation} disabled={locating}>
          {locating ? <ActivityIndicator size="small" color="#2e7d32" /> : <Text style={styles.iconText}>📍</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.iconButton, styles.addHereButton]} onPress={addBirdAtMyLocation} disabled={locating}>
          <Text style={styles.iconText}>🦜＋</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom sightings button */}
      <TouchableOpacity style={styles.listButton} onPress={() => setListVisible(true)}>
        <Text style={styles.listButtonText}>🦜 {totalSightings} Sightings</Text>
      </TouchableOpacity>

      {/* Bird picker modal */}
      <Modal visible={pickerVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => closeModal(setPickerVisible)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={[styles.modalCard, styles.pickerCard, { paddingBottom: keyboardHeight || 32 }]}>
              <Text style={styles.modalTitle}>
                {pendingPinId ? 'Add Another Bird' : 'Select Bird'}
              </Text>
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
                style={styles.pickerList}
              />
              <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={() => closeModal(setPickerVisible)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Pin detail modal */}
      <Modal visible={detailVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => closeModal(setDetailVisible)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={[styles.modalCard, styles.pickerCard]}>
              <View style={styles.detailHeader}>
                <Text style={styles.modalTitle}>Sightings at this pin</Text>
                <TouchableOpacity onPress={() => deletePin(selectedPin?.id)}>
                  <Text style={styles.deletePinText}>Delete pin</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={selectedPin?.birds ?? []}
                keyExtractor={(_, i) => String(i)}
                renderItem={({ item, index }) => (
                  <View style={styles.birdRow}>
                    <Image source={{ uri: item.image }} style={styles.birdThumb} />
                    <View style={styles.birdInfo}>
                      <Text style={styles.birdName}>{item.name}</Text>
                      <Text style={styles.birdSci}>{item.scientific}</Text>
                      <Text style={styles.birdDate}>{item.date}</Text>
                    </View>
                    <TouchableOpacity onPress={() => deleteBirdFromPin(selectedPin.id, index)}>
                      <Text style={styles.deleteText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                )}
                style={styles.pickerList}
              />
              <TouchableOpacity
                style={[styles.btn, styles.saveBtn, { marginTop: 10 }]}
                onPress={() => openPickerForExistingPin(selectedPin)}
              >
                <Text style={styles.saveText}>＋ Add another bird here</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.cancelBtn, { marginTop: 8 }]} onPress={() => closeModal(setDetailVisible)}>
                <Text style={styles.cancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Sightings list modal */}
      <Modal visible={listVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => closeModal(setListVisible)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={[styles.modalCard, styles.pickerCard]}>
              <Text style={styles.modalTitle}>All Sightings</Text>
              {pins.length === 0 ? (
                <Text style={styles.emptyText}>No sightings yet. Tap the map to add one!</Text>
              ) : (
                <FlatList
                  data={pins.flatMap(p => p.birds.map(b => ({ ...b, pin: p })))}
                  keyExtractor={(_, i) => String(i)}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.birdRow} onPress={() => flyToPin(item.pin)}>
                      <Image source={{ uri: item.image }} style={styles.birdThumb} />
                      <View style={styles.birdInfo}>
                        <Text style={styles.birdName}>{item.name}</Text>
                        <Text style={styles.birdSci}>{item.date}</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  style={styles.pickerList}
                />
              )}
              <TouchableOpacity style={[styles.btn, styles.saveBtn, { marginTop: 10 }]} onPress={() => closeModal(setListVisible)}>
                <Text style={styles.saveText}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  markerContainer: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2.5, borderColor: '#2e7d32',
    overflow: 'hidden', backgroundColor: '#e8f5e9',
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.25,
    shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
  markerImage: { width: '100%', height: '100%' },
  markerFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#c8e6c9' },
  markerEmoji: { fontSize: 22 },
  badge: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: '#2e7d32', borderRadius: 8,
    minWidth: 16, height: 16, paddingHorizontal: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  locationButtons: { position: 'absolute', top: 60, right: 16, gap: 10 },
  iconButton: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.2,
    shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  addHereButton: { backgroundColor: '#e8f5e9' },
  iconText: { fontSize: 20 },
  listButton: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    backgroundColor: '#2e7d32', paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 24, elevation: 4, shadowColor: '#000',
    shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  listButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 20,
    borderTopRightRadius: 20, padding: 20,
  },
  pickerCard: { maxHeight: '80%' },
  pickerList: { maxHeight: 320 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#1b5e20' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  deletePinText: { color: '#e53935', fontSize: 13 },
  searchInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    padding: 10, fontSize: 15, marginBottom: 10,
  },
  birdRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  birdThumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: '#e8f5e9', marginRight: 12 },
  birdInfo: { flex: 1 },
  birdName: { fontSize: 15, fontWeight: '600', color: '#1b5e20' },
  birdSci: { fontSize: 12, color: '#888', marginTop: 2, fontStyle: 'italic' },
  birdDate: { fontSize: 11, color: '#aaa', marginTop: 1 },
  deleteText: { color: '#ccc', fontSize: 18, paddingLeft: 12 },
  emptyText: { color: '#888', textAlign: 'center', marginVertical: 20 },
  btn: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#f5f5f5' },
  saveBtn: { backgroundColor: '#2e7d32' },
  cancelText: { color: '#555', fontWeight: '600' },
  saveText: { color: '#fff', fontWeight: '600' },
});
