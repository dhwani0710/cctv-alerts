import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';

export const DEFAULT_DATABASE_URL =
  'https://cctv-dashboard-ed359-default-rtdb.asia-southeast1.firebasedatabase.app';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || DEFAULT_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(config.databaseURL);

let app = null;
let db = null;

function getDb() {
  if (!db) {
    app = initializeApp(config);
    db = getDatabase(app);
  }
  return db;
}

/**
 * Subscribes to live IoT hardware readings from Firebase Realtime Database.
 * Telemetry data packet written by the IoT device:
 *   {
 *     distance_cm: 0,
 *     door_closed: false,
 *     motion: false,
 *     person_near: false,
 *     updated: 1760512345678
 *   }
 */
export function subscribeSensors(onData, onError) {
  try {
    const database = getDb();
    const sensorsRef = ref(database, '/');

    const unsubscribe = onValue(
      sensorsRef,
      (snapshot) => {
        const v = snapshot.val() || {};
        const motion = Boolean(v.motion ?? false);
        const distance = Number(v.distance_cm ?? v.distance ?? 0);
        const doorClosed = Boolean(v.door_closed ?? false);
        const personNear = Boolean(v.person_near ?? false);
        let rawUpdated = Number(v.updated ?? Date.now());
        if (rawUpdated > 0 && rawUpdated < 10000000000) {
          rawUpdated *= 1000;
        }
        const updatedAt = rawUpdated;

        onData({
          motion,
          distance,
          doorOpen: !doorClosed,
          personNear,
          updatedAt,
        });
      },
      (err) => {
        if (onError) onError(err);
      }
    );

    return unsubscribe;
  } catch (err) {
    if (onError) onError(err);
    return () => {};
  }
}
