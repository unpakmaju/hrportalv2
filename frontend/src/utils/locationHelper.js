// Polygons extracted directly from polygon.txt (GeoJSON coordinates: [longitude, latitude])
export const POLYGON_TEKNIK = [
  [106.8089733, -6.5984852],
  [106.8089173, -6.5993229],
  [106.809273, -6.5993556],
  [106.8092961, -6.5994472],
  [106.809273, -6.5996828],
  [106.8092829, -6.5998628],
  [106.8096716, -6.5998824],
  [106.810136, -6.5998988],
  [106.8101756, -6.5986096],
  [106.8095497, -6.5985343],
  [106.8090523, -6.5984721],
  [106.8089733, -6.5984852],
];

export const POLYGON_UNPAK = [
  [106.8106493, -6.5989928],
  [106.810552, -6.5998848],
  [106.8108581, -6.6006916],
  [106.8114206, -6.6009082],
  [106.8121401, -6.6003234],
  [106.8130341, -6.599704],
  [106.8125457, -6.5990066],
  [106.8121738, -6.5988939],
  [106.8112655, -6.5987491],
  [106.8107011, -6.598686],
  [106.8106493, -6.5989928],
];

export const POLYGON_LAPANGAN = [
  [106.8116777, -6.599617],
  [106.8116367, -6.5999715],
  [106.8120327, -6.6003358],
  [106.8127981, -6.5997751],
  [106.8125500, -6.5987800], // Mencakup pelataran/plaza utama depan gedung rektorat & tepi lapangan
  [106.8117000, -6.5988500], // Menutup area utara lapangan
  [106.8116777, -6.599617],
];

/**
 * Point in Polygon Algorithm (Ray-Casting)
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {Array<Array<number>>} polygon - Array of [longitude, latitude] pairs
 * @returns {boolean}
 */
export function isPointInPolygon(lat, lon, polygon) {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  let j = polygon.length - 1;

  for (let i = 0; i < polygon.length; i++) {
    const xi = polygon[i][0]; // longitude
    const yi = polygon[i][1]; // latitude
    const xj = polygon[j][0]; // longitude
    const yj = polygon[j][1]; // latitude

    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
    j = i;
  }

  return inside;
}

/**
 * Calculates distance in meters between two lat/lon coordinates using Haversine formula
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distance in meters
 */
export function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates shortest distance in meters from a point (lat, lon) to a polygon perimeter.
 * Returns 0 if the point is strictly inside the polygon.
 * @param {number} lat 
 * @param {number} lon 
 * @param {Array<Array<number>>} polygon 
 * @returns {number} Distance in meters
 */
export function getDistanceToPolygon(lat, lon, polygon) {
  if (!polygon || polygon.length < 3) return Infinity;
  if (isPointInPolygon(lat, lon, polygon)) return 0;

  let minDistance = Infinity;

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];

    const lon1 = p1[0], lat1 = p1[1];
    const lon2 = p2[0], lat2 = p2[1];

    // Project point onto line segment
    const dx = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2 * Math.PI) / 180);
    const dy = lat2 - lat1;
    const lenSq = dx * dx + dy * dy;

    let dist;
    if (lenSq === 0) {
      dist = getDistanceInMeters(lat, lon, lat1, lon1);
    } else {
      const px = (lon - lon1) * Math.cos(((lat1 + lat2) / 2 * Math.PI) / 180);
      const py = lat - lat1;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
      const projLon = lon1 + t * (lon2 - lon1);
      const projLat = lat1 + t * (lat2 - lat1);
      dist = getDistanceInMeters(lat, lon, projLat, projLon);
    }

    if (dist < minDistance) {
      minDistance = dist;
    }
  }

  return minDistance;
}

/**
 * Check if the given coordinates are within the campus polygons (Teknik, UNPAK, or Lapangan)
 * Includes adaptive GPS accuracy buffer (default 40m)
 * @param {number} lat 
 * @param {number} lon 
 * @param {number} [accuracy=0]
 * @returns {boolean}
 */
export function isWithinCampus(lat, lon, accuracy = 0) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) return false;

  if (
    isPointInPolygon(lat, lon, POLYGON_TEKNIK) ||
    isPointInPolygon(lat, lon, POLYGON_UNPAK) ||
    isPointInPolygon(lat, lon, POLYGON_LAPANGAN)
  ) {
    return true;
  }

  // Tolerance buffer for GPS drift & hardware inaccuracy
  const bufferMeters = Math.max(40, Math.min(accuracy || 0, 50));
  return (
    getDistanceToPolygon(lat, lon, POLYGON_TEKNIK) <= bufferMeters ||
    getDistanceToPolygon(lat, lon, POLYGON_UNPAK) <= bufferMeters ||
    getDistanceToPolygon(lat, lon, POLYGON_LAPANGAN) <= bufferMeters
  );
}

/**
 * Checks if the IP address matches Pakuan campus network rules:
 * Matches "103.169" (IPv4) or "2001:df0:3140" (IPv6)
 * @param {string} ipAddress 
 * @returns {boolean}
 */
export function isPakuanIp(ipAddress) {
  if (!ipAddress || typeof ipAddress !== 'string') return false;
  return ipAddress.includes('103.169') || ipAddress.includes('2001:df0:3140');
}

/**
 * Comprehensive check for whether employee is within UNPAK by GPS or WiFi
 * @param {number} lat 
 * @param {number} lon 
 * @param {string} ipAddress 
 * @param {number} [accuracy=0]
 * @returns {{ inRange: boolean, byGps: boolean, byWifi: boolean, locationName: string }}
 */
export function checkAttendanceLocation(lat, lon, ipAddress, accuracy = 0) {
  const byGps = isWithinCampus(lat, lon, accuracy);
  const byWifi = isPakuanIp(ipAddress);
  const inRange = byGps || byWifi;

  let locationName = 'Di Luar Kampus UNPAK';
  if (byGps) {
    const bufferMeters = Math.max(40, Math.min(accuracy || 0, 50));
    if (isPointInPolygon(lat, lon, POLYGON_TEKNIK) || getDistanceToPolygon(lat, lon, POLYGON_TEKNIK) <= bufferMeters) {
      locationName = 'Fakultas Teknik UNPAK';
    } else if (isPointInPolygon(lat, lon, POLYGON_LAPANGAN) || getDistanceToPolygon(lat, lon, POLYGON_LAPANGAN) <= bufferMeters) {
      locationName = 'Lapangan Utama UNPAK';
    } else if (isPointInPolygon(lat, lon, POLYGON_UNPAK) || getDistanceToPolygon(lat, lon, POLYGON_UNPAK) <= bufferMeters) {
      locationName = 'Kampus Pusat UNPAK';
    } else {
      locationName = 'Area Kampus UNPAK';
    }
  } else if (byWifi) {
    locationName = 'WiFi Kampus UNPAK';
  }

  return {
    inRange,
    byGps,
    byWifi,
    locationName,
  };
}

/**
 * Promisified browser geolocation helper
 * @returns {Promise<{ latitude: number, longitude: number, accuracy: number } | null>}
 */
export function getCurrentCoordinates() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp || Date.now(),
        });
      },
      (err) => {
        // If high accuracy times out (e.g. indoors or laptop without GNSS chip),
        // gracefully fallback to standard Wi-Fi/network positioning without error
        if (err.code === 3) {
          navigator.geolocation.getCurrentPosition(
            (fallbackPos) => {
              resolve({
                latitude: fallbackPos.coords.latitude,
                longitude: fallbackPos.coords.longitude,
                accuracy: fallbackPos.coords.accuracy,
                timestamp: fallbackPos.timestamp || Date.now(),
              });
            },
            () => resolve(null),
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 10000 }
          );
          return;
        }
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

/**
 * Check if the given coordinates are within the ceremony polygons (Teknik or Lapangan)
 * Incorporates an adaptive buffer tolerance (default 40m, up to 50m depending on GPS accuracy)
 * @param {number} lat 
 * @param {number} lon 
 * @param {number} [accuracy=0]
 * @returns {boolean}
 */
export function isWithinCeremonyLocation(lat, lon, accuracy = 0) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) return false;

  // 1. Direct point-in-polygon
  if (
    isPointInPolygon(lat, lon, POLYGON_TEKNIK) ||
    isPointInPolygon(lat, lon, POLYGON_LAPANGAN)
  ) {
    return true;
  }

  // 2. Tolerance buffer (Industry standard for mobile/browser GPS accuracy)
  const bufferMeters = Math.max(40, Math.min(accuracy || 0, 50));
  const distTeknik = getDistanceToPolygon(lat, lon, POLYGON_TEKNIK);
  const distLapangan = getDistanceToPolygon(lat, lon, POLYGON_LAPANGAN);

  return distTeknik <= bufferMeters || distLapangan <= bufferMeters;
}

/**
 * Checks ceremony location details
 * @param {number} lat 
 * @param {number} lon 
 * @param {number} [accuracy=0]
 * @returns {{ inRange: boolean, locationName: string }}
 */
export function checkCeremonyLocation(lat, lon, accuracy = 0) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) {
    return { inRange: false, locationName: 'Menunggu Sinyal GPS...' };
  }

  // Check direct inclusion first
  if (isPointInPolygon(lat, lon, POLYGON_LAPANGAN)) {
    return { inRange: true, locationName: 'Lapangan Utama UNPAK' };
  }
  if (isPointInPolygon(lat, lon, POLYGON_TEKNIK)) {
    return { inRange: true, locationName: 'Fakultas Teknik UNPAK' };
  }

  // Check tolerance buffer
  const bufferMeters = Math.max(40, Math.min(accuracy || 0, 50));
  const distLapangan = getDistanceToPolygon(lat, lon, POLYGON_LAPANGAN);
  const distTeknik = getDistanceToPolygon(lat, lon, POLYGON_TEKNIK);

  if (distLapangan <= bufferMeters) {
    return { inRange: true, locationName: 'Lapangan Utama UNPAK' };
  }
  if (distTeknik <= bufferMeters) {
    return { inRange: true, locationName: 'Fakultas Teknik UNPAK' };
  }

  return { inRange: false, locationName: 'Di Luar Area Upacara (Teknik / Lapangan)' };
}
