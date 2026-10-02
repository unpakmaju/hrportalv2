import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  POLYGON_TEKNIK,
  POLYGON_LAPANGAN,
  POLYGON_UNPAK,
  checkCeremonyLocation,
} from '../utils/locationHelper';
import { Navigation, Layers, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Loads Leaflet library dynamically if not yet available on window
 */
function ensureLeafletLoaded() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('No window'));
    if (window.L) return resolve(window.L);

    // If script element already exists, wait for it
    const existingScript = document.getElementById('leaflet-js');
    if (existingScript) {
      const check = setInterval(() => {
        if (window.L) {
          clearInterval(check);
          resolve(window.L);
        }
      }, 100);
      return;
    }

    // Otherwise inject CSS and JS
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.id = 'leaflet-js';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.head.appendChild(script);
  });
}

export default function AttendanceMap({
  userCoords,
  isRefreshingGps = false,
  onRefreshGps,
  height = '300px',
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const accuracyCircleRef = useRef(null);
  const polygonsLayerGroupRef = useRef(null);

  const [mapType, setMapType] = useState('roadmap'); // 'roadmap' | 'satellite'
  const [mapReady, setMapReady] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(() => new Date().toLocaleTimeString('id-ID'));
  const [followUser, setFollowUser] = useState(true);

  const lat = userCoords?.latitude;
  const lon = userCoords?.longitude;
  const accuracy = userCoords?.accuracy || 0;
  const timestamp = userCoords?.timestamp;
  const hasUserCoords = typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon);

  // Live continuous second ticker to keep clock moving in real-time
  useEffect(() => {
    const timer = setInterval(() => {
      setLastUpdate(new Date().toLocaleTimeString('id-ID'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const ceremonyStatus = hasUserCoords ? checkCeremonyLocation(lat, lon, accuracy) : { inRange: false, locationName: 'Menunggu GPS...' };

  // Google Maps Tile URLs (fast, crisp, Indonesian campus labels, 0 API key required)
  const TILE_URLS = {
    roadmap: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    satellite: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', // hybrid satellite + labels
  };

  // Initialize Map
  useEffect(() => {
    let isCancelled = false;

    ensureLeafletLoaded()
      .then((L) => {
        if (isCancelled || !mapContainerRef.current) return;

        // Cleanup previous instance if any
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        // Default center: Universitas Pakuan Campus
        const defaultCenter = [-6.5994, 106.8115];
        const initialZoom = 17;

        const map = L.map(mapContainerRef.current, {
          center: defaultCenter,
          zoom: initialZoom,
          zoomControl: false,
          attributionControl: false,
          maxZoom: 20,
          minZoom: 14,
        });

        // Add Zoom Control at bottom-right
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        // Add Google Maps Tile Layer
        const tileLayer = L.tileLayer(TILE_URLS[mapType], {
          maxZoom: 20,
          subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        }).addTo(map);

        tileLayerRef.current = tileLayer;

        // Layer group for polygons
        const polyGroup = L.layerGroup().addTo(map);
        polygonsLayerGroupRef.current = polyGroup;

        // Convert GeoJSON coordinates [lon, lat] -> Leaflet [lat, lon]
        const teknikLatLngs = POLYGON_TEKNIK.map(([pLon, pLat]) => [pLat, pLon]);
        const lapanganLatLngs = POLYGON_LAPANGAN.map(([pLon, pLat]) => [pLat, pLon]);
        const unpakLatLngs = POLYGON_UNPAK.map(([pLon, pLat]) => [pLat, pLon]);

        // Draw Kampus UNPAK outline (subtle boundary)
        L.polygon(unpakLatLngs, {
          color: '#64748b',
          weight: 1.5,
          dashArray: '4, 4',
          fillColor: '#94a3b8',
          fillOpacity: 0.05,
        })
          .bindTooltip('Kawasan Kampus UNPAK', { sticky: true, className: 'map-tooltip' })
          .addTo(polyGroup);

        // Draw Lapangan Utama UNPAK Polygon (Ceremony Area 1)
        L.polygon(lapanganLatLngs, {
          color: '#0284c7',
          weight: 2.5,
          fillColor: '#0284c7',
          fillOpacity: 0.25,
        })
          .bindTooltip('<strong>Area Upacara: Lapangan Utama UNPAK</strong>', {
            sticky: true,
            className: 'map-tooltip',
          })
          .addTo(polyGroup);

        mapInstanceRef.current = map;
        setMapReady(true);

        map.on('dragstart', () => {
          setFollowUser(false);
        });

        // Initial Bounds fit to ceremony polygon (Lapangan Utama)
        const allCeremonyBounds = L.latLngBounds(lapanganLatLngs);
        map.fitBounds(allCeremonyBounds, { padding: [35, 35] });

        // Trigger resize calculation
        setTimeout(() => {
          map.invalidateSize();
        }, 200);
      })
      .catch((err) => {
        console.warn('Map initialization failed:', err);
      });

    return () => {
      isCancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Tile Layer when mapType changes
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    tileLayerRef.current.setUrl(TILE_URLS[mapType]);
  }, [mapType]);

  // Update User Marker & Accuracy Circle when userCoords change
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || typeof window === 'undefined' || !window.L) return;

    const L = window.L;
    const map = mapInstanceRef.current;

    if (!hasUserCoords) {
      if (userMarkerRef.current) {
        map.removeLayer(userMarkerRef.current);
        userMarkerRef.current = null;
      }
      if (accuracyCircleRef.current) {
        map.removeLayer(accuracyCircleRef.current);
        accuracyCircleRef.current = null;
      }
      return;
    }

    const userLatLng = [lat, lon];
    const inRange = ceremonyStatus.inRange;
    const markerColor = inRange ? '#16a34a' : '#e11d48';

    setLastUpdate(new Date().toLocaleTimeString('id-ID'));
    if (followUser && mapInstanceRef.current) {
      mapInstanceRef.current.panTo(userLatLng, { animate: true, duration: 0.6 });
    }

    // Custom HTML Marker with pulsing radar ring
    const customIcon = L.divIcon({
      className: 'custom-user-marker',
      html: `
        <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
          <div style="
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            background: ${markerColor};
            opacity: 0.35;
            animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
          "></div>
          <div style="
            position: relative;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: ${markerColor};
            border: 2.5px solid #ffffff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.35);
          "></div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const popupContent = `
      <div style="font-family: inherit; font-size: 12px; line-height: 1.45; min-width: 170px; padding: 2px;">
        <div style="display: flex; align-items: center; gap: 6px; font-weight: 800; color: ${inRange ? '#16a34a' : '#be123c'}; font-size: 13px;">
          <span>${inRange ? '✓ Lokasi Valid' : '⚠️ Di Luar Area'}</span>
        </div>
        <div style="color: #0f172a; font-weight: 700; margin-top: 4px;">${ceremonyStatus.locationName}</div>
        <div style="color: #64748b; font-family: monospace; font-size: 11px; margin-top: 4px;">
          ${lat.toFixed(6)}, ${lon.toFixed(6)}
        </div>
        ${accuracy ? `<div style="color: #94a3b8; font-size: 10.5px; margin-top: 2px;">Akurasi GPS: ±${Math.round(accuracy)} m</div>` : ''}
      </div>
    `;

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker(userLatLng, { icon: customIcon, zIndexOffset: 1000 })
        .bindPopup(popupContent)
        .addTo(map);
    } else {
      userMarkerRef.current.setLatLng(userLatLng);
      userMarkerRef.current.setIcon(customIcon);
      userMarkerRef.current.setPopupContent(popupContent);
    }

    // Accuracy Circle
    if (accuracy && accuracy > 5) {
      if (!accuracyCircleRef.current) {
        accuracyCircleRef.current = L.circle(userLatLng, {
          radius: Math.min(accuracy, 250),
          color: markerColor,
          fillColor: markerColor,
          fillOpacity: 0.12,
          weight: 1,
        }).addTo(map);
      } else {
        accuracyCircleRef.current.setLatLng(userLatLng);
        accuracyCircleRef.current.setRadius(Math.min(accuracy, 250));
        accuracyCircleRef.current.setStyle({
          color: markerColor,
          fillColor: markerColor,
        });
      }
    } else if (accuracyCircleRef.current) {
      map.removeLayer(accuracyCircleRef.current);
      accuracyCircleRef.current = null;
    }
  }, [hasUserCoords, lat, lon, accuracy, timestamp, ceremonyStatus.inRange, ceremonyStatus.locationName, mapReady]);

  // Recenter to user position or polygons
  const handleRecenter = useCallback(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    setFollowUser(true);

    if (hasUserCoords) {
      map.flyTo([lat, lon], 18, { animate: true, duration: 0.8 });
      if (userMarkerRef.current) {
        userMarkerRef.current.openPopup();
      }
    } else {
      const teknikLatLngs = POLYGON_TEKNIK.map(([pLon, pLat]) => [pLat, pLon]);
      const lapanganLatLngs = POLYGON_LAPANGAN.map(([pLon, pLat]) => [pLat, pLon]);
      const allCeremonyBounds = window.L.latLngBounds([...teknikLatLngs, ...lapanganLatLngs]);
      map.flyToBounds(allCeremonyBounds, { padding: [30, 30], animate: true });
    }
  }, [hasUserCoords, lat, lon]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1.5px solid #e2e8f0',
        boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.08)',
        background: '#f8fafc',
      }}
    >
      {/* Map DOM Container */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />

      {/* Floating Top Controls Overlay */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          right: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pointerEvents: 'none',
          zIndex: 500,
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        {/* Legend & Auto-Sync Pills */}
        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.94)',
              backdropFilter: 'blur(8px)',
              padding: '5px 12px',
              borderRadius: '9999px',
              border: '1px solid rgba(226, 232, 240, 0.9)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              fontSize: '0.725rem',
              fontWeight: 700,
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#0369a1' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0284c7' }}></span>
              Zona Upacara: Lapangan UNPAK
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.94)',
              backdropFilter: 'blur(8px)',
              padding: '5px 12px',
              borderRadius: '9999px',
              border: '1px solid #86efac',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              fontSize: '0.725rem',
              fontWeight: 700,
            }}
          >
            <span style={{ position: 'relative', display: 'flex', width: '8px', height: '8px' }}>
              <span style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', background: '#22c55e', opacity: 0.75, animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite' }}></span>
              <span style={{ position: 'relative', width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a' }}></span>
            </span>
            <span style={{ color: '#15803d' }}>Auto-Sync GPS (1s)</span>
            {lastUpdate && <span style={{ color: '#64748b', fontSize: '0.675rem' }}>{lastUpdate}</span>}
          </div>
        </div>

        {/* Action Buttons: Map Type Switcher & Recenter */}
        <div
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {/* Map Layer Switcher */}
          <button
            type="button"
            onClick={() => setMapType((prev) => (prev === 'roadmap' ? 'satellite' : 'roadmap'))}
            title="Ganti Tampilan Peta (Jalan / Satelit)"
            style={{
              padding: '6px 12px',
              borderRadius: '9999px',
              border: '1px solid #e2e8f0',
              background: 'rgba(255, 255, 255, 0.94)',
              backdropFilter: 'blur(8px)',
              color: '#334155',
              fontSize: '0.725rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
              transition: 'all 0.15s ease',
            }}
          >
            <Layers size={13} color="#0284c7" />
            <span>{mapType === 'roadmap' ? 'Peta Google' : 'Satelit'}</span>
          </button>

          {/* Recenter Button */}
          <button
            type="button"
            onClick={handleRecenter}
            title="Pusatkan Peta ke Lokasi Saya"
            style={{
              padding: '6px 12px',
              borderRadius: '9999px',
              border: '1px solid #e2e8f0',
              background: 'rgba(255, 255, 255, 0.94)',
              backdropFilter: 'blur(8px)',
              color: '#0f172a',
              fontSize: '0.725rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
            }}
          >
            <Navigation size={13} color="#e11d48" />
            <span>Lokasi Saya</span>
          </button>

          {/* Refresh GPS Button (if handler provided) */}
          {onRefreshGps && (
            <button
              type="button"
              onClick={onRefreshGps}
              disabled={isRefreshingGps}
              title="Perbarui Koordinat GPS"
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                border: '1px solid #e2e8f0',
                background: 'rgba(255, 255, 255, 0.94)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isRefreshingGps ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
              }}
            >
              <RefreshCw
                size={13}
                color="#0f172a"
                className={isRefreshingGps ? 'animate-spin' : ''}
              />
            </button>
          )}
        </div>
      </div>

      {/* Floating Bottom Status Pill */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          pointerEvents: 'none',
          zIndex: 500,
        }}
      >
        <div
          style={{
            pointerEvents: 'auto',
            background: hasUserCoords
              ? ceremonyStatus.inRange
                ? 'rgba(240, 253, 244, 0.95)'
                : 'rgba(254, 242, 242, 0.95)'
              : 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(8px)',
            border: `1px solid ${
              hasUserCoords
                ? ceremonyStatus.inRange
                  ? '#86efac'
                  : '#fecdd3'
                : '#e2e8f0'
            }`,
            padding: '6px 12px',
            borderRadius: '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.725rem',
            fontWeight: 700,
            color: hasUserCoords
              ? ceremonyStatus.inRange
                ? '#15803d'
                : '#be123c'
              : '#64748b',
          }}
        >
          {hasUserCoords ? (
            ceremonyStatus.inRange ? (
              <CheckCircle2 size={14} color="#16a34a" />
            ) : (
              <AlertTriangle size={14} color="#e11d48" />
            )
          ) : (
            <RefreshCw size={12} className="animate-spin" color="#64748b" />
          )}
          <span>
            {hasUserCoords
              ? `${ceremonyStatus.locationName}`
              : 'Mendeteksi Posisi GPS...'}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(2.2);
            opacity: 0;
          }
        }
        .map-tooltip {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 6px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }
      `}</style>
    </div>
  );
}
