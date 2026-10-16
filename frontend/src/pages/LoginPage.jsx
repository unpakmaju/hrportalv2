import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  ShieldCheck, 
  AlertCircle,
  Globe,
  Lock,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export const LoginPage = () => {
  const { exchangeSsoCode, loginWithSsoToken, triggerSsoRedirect, isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const hasExchangedRef = React.useRef(false);

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
        setErrorMessage(errorParam);
        showToast(errorParam, 'error');
        return;
      }

      if (code && !hasExchangedRef.current) {
        hasExchangedRef.current = true;
        window.history.replaceState({}, document.title, window.location.pathname);

        setLoading(true);
        setErrorMessage('');
        // showToast('Memproses autentikasi Unpak SSO Keycloak...', 'info');
        const res = await exchangeSsoCode(code);
        if (res.success) {
          // showToast(`Selamat datang, ${res.user.name}!`, 'success');
          window.history.pushState(null, '', '/dashboard');
        } else {
          setErrorMessage(res.error || 'Gagal login via Unpak SSO');
          showToast(res.error || 'Gagal login via Unpak SSO', 'error');
        }
        setLoading(false);
      } else if (accessToken && !hasExchangedRef.current) {
        hasExchangedRef.current = true;
        window.history.replaceState({}, document.title, window.location.pathname);

        setLoading(true);
        setErrorMessage('');
        const res = loginWithSsoToken(accessToken, idToken);
        if (res.success) {
          showToast('Login dengan Unpak SSO berhasil!', 'success');
          window.history.pushState(null, '', '/dashboard');
        } else {
          setErrorMessage(res.error || 'Gagal login via SSO');
          showToast(res.error || 'Gagal login via SSO', 'error');
        }
        setLoading(false);
      } else if (!code && !accessToken && !hasExchangedRef.current) {
        if (isAuthenticated) {
          window.history.pushState(null, '', '/dashboard');
          return;
        }

        const isLoggedOut = params.get('logged_out') === 'true' || sessionStorage.getItem('just_logged_out') === 'true';
        if (params.get('logged_out')) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        // Direct auto-redirect to Keycloak gerbang.unpak.ac.id without waiting for click
        hasExchangedRef.current = true;
        setLoading(true);
        triggerSsoRedirect(isLoggedOut);
      }
    };

    handleSsoCallback();
  }, [isAuthenticated]);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        position: 'relative',
      }}
    >
      {/* Top Right Language Selector */}
      <div style={{ position: 'absolute', top: '24px', right: '32px' }}>
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '0.8rem',
            fontWeight: 700,
            color: '#111827',
            cursor: 'pointer',
          }}
        >
          <Globe size={14} color="#6b7280" />
          <span>ID / EN</span>
        </button>
      </div>

      {/* Centered SSO Only Auth Card */}
      <div
        className="animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '36px 32px',
          border: '1px solid #e5e7eb',
          borderRadius: '20px',
          backgroundColor: '#ffffff',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
          textAlign: 'center',
        }}
      >
        {/* Centered HR Portal Badge Logo */}
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '14px',
            backgroundColor: '#111827',
            color: '#ffffff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '1.25rem',
            letterSpacing: '-0.03em',
            marginBottom: '20px',
            boxShadow: '0 4px 12px rgba(17, 24, 39, 0.15)',
          }}
        >
          UNPAK
        </div>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827', marginBottom: '6px' }}>
          HR Portal UNPAK
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '28px', lineHeight: 1.5 }}>
          Layanan Autentikasi Tunggal Single Sign-On (SSO) Pegawai &amp; Dosen Universitas Pakuan.
        </p>

        {/* Error Alert */}
        {errorMessage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: '10px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '0.825rem',
              marginBottom: '20px',
              textAlign: 'left',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>{errorMessage}</div>
          </div>
        )}

        {/* EXCLUSIVE UNPAK SSO LOGIN BUTTON ONLY (NO FORM, NO REGIS, NO FORGET PASSWORD) */}
        <button
          type="button"
          onClick={triggerSsoRedirect}
          disabled={loading}
          className="bm-btn-emerald"
          style={{
            width: '100%',
            padding: '14px 20px',
            borderRadius: '12px',
            justifyContent: 'center',
            fontSize: '0.925rem',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
            marginBottom: '20px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path fill="#ffffff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#ffffff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#ffffff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#ffffff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>{loading ? 'Memproses SSO...' : 'Masuk dengan UNPAK SSO'}</span>
        </button>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem', color: '#059669', background: '#ecfdf5', padding: '6px 12px', borderRadius: '9999px', fontWeight: 700 }}>
          <ShieldCheck size={14} color="#10b981" />
          <span>Terintegrasi dengan SSO UNPAK</span>
        </div>

        <div style={{ marginTop: '28px', paddingTop: '16px', borderTop: '1px solid #e5e7eb', fontSize: '0.725rem', color: '#9ca3af' }}>
          Autentikasi resmi Universitas Pakuan &bull; Sistem Informasi Manajemen Kepegawaian (SIMPEG).
        </div>
      </div>
    </div>
  );
};
