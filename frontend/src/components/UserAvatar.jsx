import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * UserAvatar - Centralized SSO Google Workspace Avatar Component
 *
 * Mengambil foto profil Google Workspace dari Centralized Avatar API (api.id.unpak.ac.id)
 * melalui reverse proxy internal /api/avatar.
 * Otomatis fallback ke SVG vektor / inisial jika foto belum terpasang di Google.
 */
export const UserAvatar = ({
  user,
  size = 36,
  className = '',
  allowRefresh = true,
  showBorder = true,
  style = {},
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const email = user?.email || '';
  const username = user?.username || user?.nip || '';
  const name = user?.name || 'User';
  const initial = (name || 'U')[0].toUpperCase();

  // Konstruksi URL API Avatar SSO
  const buildAvatarUrl = (isForcedRefresh = false) => {
    const params = new URLSearchParams();
    if (email) params.append('email', email);
    if (username) params.append('username', username);
    if (name) params.append('name', name);
    if (isForcedRefresh) {
      params.append('refresh', '1');
      params.append('t', Date.now().toString());
    }
    return `/api/avatar?${params.toString()}`;
  };

  const avatarUrl = buildAvatarUrl(refreshKey > 0);

  const handleRefresh = (e) => {
    e.stopPropagation();
    if (isRefreshing) return;
    setIsRefreshing(true);
    setHasError(false);
    setIsLoaded(false);
    setRefreshKey((prev) => prev + 1);

    setTimeout(() => {
      setIsRefreshing(false);
    }, 1200);
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center flex-shrink-0 group ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        position: 'relative',
        flexShrink: 0,
        ...style,
      }}
      title={allowRefresh ? `${name} - Klik ikon untuk segarkan foto Google Workspace` : name}
    >
      {/* Fallback Inisial Background */}
      {(!isLoaded || hasError) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #1e1b4b 0%, #31104b 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: `${Math.max(size * 0.42, 11)}px`,
            border: showBorder ? '2px solid #ffffff' : 'none',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            userSelect: 'none',
          }}
        >
          {initial}
        </div>
      )}

      {/* Gambar Avatar Asli Google Workspace via Proxy */}
      {!hasError && (
        <img
          key={refreshKey}
          src={avatarUrl}
          alt={name}
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            setHasError(true);
            setIsLoaded(false);
          }}
          style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '50%',
            objectFit: 'cover',
            border: showBorder ? '2px solid #ffffff' : 'none',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            opacity: isLoaded ? 1 : 0,
            transition: 'opacity 0.25s ease-in-out, transform 0.2s ease',
            display: 'block',
          }}
          className="group-hover:scale-105"
        />
      )}

      {/* Tombol Mini Segarkan Foto (Hover overlay jika allowRefresh aktif) */}
      {allowRefresh && (
        <button
          type="button"
          onClick={handleRefresh}
          title="Segarkan Foto Profil Google"
          style={{
            position: 'absolute',
            bottom: '-2px',
            right: '-2px',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            border: '1px solid #d1d5db',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
            opacity: isRefreshing ? 1 : 0.85,
            transition: 'all 0.15s ease',
          }}
          className="hover:scale-110"
        >
          <RefreshCw
            size={10}
            color="#4b5563"
            style={{
              animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
            }}
          />
        </button>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
export default UserAvatar;
