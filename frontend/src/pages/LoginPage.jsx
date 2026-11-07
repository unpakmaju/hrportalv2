import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldAlert, 
  RefreshCw, 
  ExternalLink,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export const LoginPage = () => {
  const { exchangeSsoCode, loginWithSsoToken, triggerSsoRedirect, isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const [status, setStatus] = useState('initializing'); // 'redirecting' | 'processing' | 'success' | 'error'
  const [statusText, setStatusText] = useState('Menghubungkan ke SSO UNPAK...');
  const [errorMessage, setErrorMessage] = useState('');
  const [countdown, setCountdown] = useState(5);
  const hasExchangedRef = useRef(false);

  useEffect(() => {
    const handleSsoCallback = async () => {
      const search = window.location.search;
      const hash = window.location.hash;
      const params = new URLSearchParams(search || (hash ? hash.substring(1) : ''));
      const code = params.get('code');
      const accessToken = params.get('access_token');
      const idToken = params.get('id_token');
      const errorParam = params.get('error') || params.get('error_description');

      if (errorParam) {
        setStatus('error');
        setErrorMessage(errorParam);
        showToast(errorParam, 'error');
        return;
      }

      if (code && !hasExchangedRef.current) {
        hasExchangedRef.current = true;
        window.history.replaceState({}, document.title, window.location.pathname);

        setStatus('processing');
        setStatusText('Memverifikasi autentikasi SSO Universitas Pakuan...');
        setErrorMessage('');

        const res = await exchangeSsoCode(code);
        if (res.success) {
          setStatus('success');
          setStatusText(`Selamat datang, ${res.user?.name || 'Pengguna'}! Mengalihkan ke Dashboard...`);
          setTimeout(() => {
            window.history.pushState(null, '', '/dashboard');
          }, 300);
        } else {
          setStatus('error');
          setErrorMessage(res.error || 'Gagal menyelesaikan pertukaran sesi SSO.');
          showToast(res.error || 'Gagal login via Unpak SSO', 'error');
        }
      } else if (accessToken && !hasExchangedRef.current) {
        hasExchangedRef.current = true;
        window.history.replaceState({}, document.title, window.location.pathname);

        setStatus('processing');
        setStatusText('Menyiapkan sesi pengguna...');
        setErrorMessage('');

        const res = loginWithSsoToken(accessToken, idToken);
        if (res.success) {
          setStatus('success');
          setStatusText('Autentikasi SSO berhasil! Mengalihkan...');
          setTimeout(() => {
            window.history.pushState(null, '', '/dashboard');
          }, 300);
        } else {
          setStatus('error');
          setErrorMessage(res.error || 'Gagal login via SSO.');
          showToast(res.error || 'Gagal login via SSO', 'error');
        }
      } else if (!code && !accessToken && !hasExchangedRef.current) {
        if (isAuthenticated) {
          window.history.pushState(null, '', '/dashboard');
          return;
        }

        const isLoggedOut = params.get('logged_out') === 'true' || sessionStorage.getItem('just_logged_out') === 'true';
        if (params.get('logged_out')) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        hasExchangedRef.current = true;
        setStatus('redirecting');
        setStatusText('Mengalihkan ke SSO Gerbang Universitas Pakuan...');
        
        // Auto-redirect directly to Keycloak SSO
        setTimeout(() => {
          triggerSsoRedirect(isLoggedOut);
        }, 150);
      }
    };

    handleSsoCallback();
  }, [isAuthenticated]);

  // Auto-redirect countdown on error
  useEffect(() => {
    let timer;
    if (status === 'error' && countdown > 0) {
      timer = setTimeout(() => {
        setCountdown((c) => c - 1);
      }, 1000);
    } else if (status === 'error' && countdown === 0) {
      triggerSsoRedirect(true);
    }
    return () => clearTimeout(timer);
  }, [status, countdown]);

  // ERROR STATE: Clean error alert modal with auto-retry
  if (status === 'error') {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
        }}
      >
        <div
          className="animate-fade-in"
          style={{
            width: '100%',
            maxWidth: '440px',
            padding: '36px 32px',
            borderRadius: '24px',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
            textAlign: 'center',
          }}
        >
          {/* Alert Icon Badge */}
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              backgroundColor: '#fef2f2',
              color: '#ef4444',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
              border: '1px solid #fee2e2',
            }}
          >
            <ShieldAlert size={32} />
          </div>

          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
            Sesi Autentikasi Diperlukan
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '20px', lineHeight: 1.5 }}>
            {errorMessage.includes('Security Check') || errorMessage.includes('403')
              ? 'Verifikasi keamanan sesi memerlukan penyegaran. Silakan klik tombol di bawah untuk masuk kembali melalui SSO UNPAK.'
              : errorMessage || 'Sesi login telah berakhir atau memerlukan otentikasi ulang melalui Gerbang SSO.'}
          </p>

          <button
            type="button"
            onClick={() => triggerSsoRedirect(true)}
            style={{
              width: '100%',
              padding: '14px 20px',
              borderRadius: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              fontSize: '0.925rem',
              fontWeight: 800,
              color: '#ffffff',
              border: 'none',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
              cursor: 'pointer',
              marginBottom: '16px',
            }}
          >
            <RefreshCw size={18} />
            <span>Masuk Kembali ke SSO UNPAK ({countdown}s)</span>
          </button>

          <a
            href="https://helpdesk.unpak.ac.id"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              color: '#64748b',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            <span>Butuh bantuan? Kunjungi Helpdesk UNPAK</span>
            <ExternalLink size={13} />
          </a>
        </div>
      </div>
    );
  }

  // DEFAULT / LOADING / REDIRECTING / PROCESSING / SUCCESS STATE
  // Seamless clean full-screen loading state (No static login card)
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        position: 'relative',
        fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
      }}
    >
      <div
        className="animate-fade-in"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          maxWidth: '460px',
        }}
      >
        {/* Animated UNPAK Emblem Logo */}
        <div style={{ position: 'relative', marginBottom: '28px' }}>
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '24px',
              backgroundColor: '#0f172a',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '1.6rem',
              letterSpacing: '-0.04em',
              boxShadow: '0 10px 30px -5px rgba(15, 23, 42, 0.25)',
            }}
          >
            UNPAK
          </div>

          {/* Smooth Spinning Gradient Ring */}
          <div
            style={{
              position: 'absolute',
              inset: '-8px',
              borderRadius: '32px',
              border: '3px solid transparent',
              borderTopColor: '#10b981',
              borderRightColor: '#059669',
              animation: 'spin 1.2s linear infinite',
            }}
          />
        </div>

        <h1
          style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            color: '#0f172a',
            marginBottom: '6px',
            letterSpacing: '-0.02em',
          }}
        >
          HR Portal UNPAK
        </h1>

        <p
          style={{
            fontSize: '0.875rem',
            color: '#64748b',
            marginBottom: '24px',
          }}
        >
          Sistem Informasi Manajemen Kepegawaian (SIMPEG)
        </p>

        {/* Dynamic Status Indicator */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            padding: '8px 18px',
            borderRadius: '9999px',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }}
          />
          <span>{statusText}</span>
        </div>
      </div>

      {/* Subtle Footer */}
      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          fontSize: '0.75rem',
          color: '#94a3b8',
          textAlign: 'center',
        }}
      >
        Universitas Pakuan &bull; Autentikasi Tunggal Single Sign-On (SSO)
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
};
