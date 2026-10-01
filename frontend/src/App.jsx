import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MasterLiburPage } from './pages/MasterLiburPage';
import { MasterUpacaraPage } from './pages/MasterUpacaraPage';
import { IzinPage } from './pages/IzinPage';
import { CutiPage } from './pages/CutiPage';
import { SppdPage } from './pages/SppdPage';
import { SlipGajiPage } from './pages/SlipGajiPage';
import { ReportPage } from './pages/ReportPage';

const VALID_TABS = ['dashboard', 'cuti', 'izin', 'sppd', 'slip-gaji', 'libur', 'upacara', 'laporan'];

const getInitialTab = () => {
  const path = window.location.pathname.replace(/^\//, '').toLowerCase();
  if (VALID_TABS.includes(path)) {
    return path;
  }
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  if (VALID_TABS.includes(hash)) {
    return hash;
  }
  const saved = localStorage.getItem('hrportal_active_tab');
  if (VALID_TABS.includes(saved)) {
    return saved;
  }
  return 'dashboard';
};

export const App = () => {
  const { isAuthenticated, loading } = useAuth();
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [periodType, setPeriodType] = useState('cutoff'); // 'cutoff' (16-15) or 'calendar' (01-31)

  const handleTabChange = (tab) => {
    if (!VALID_TABS.includes(tab)) return;
    setActiveTab(tab);
    localStorage.setItem('hrportal_active_tab', tab);
    if (window.location.pathname !== `/${tab}`) {
      window.history.pushState(null, '', `/${tab}`);
    }
  };

  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname.replace(/^\//, '').toLowerCase();
      if (VALID_TABS.includes(path)) {
        setActiveTab(path);
        localStorage.setItem('hrportal_active_tab', path);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!loading) {
      if (isAuthenticated) {
        const path = window.location.pathname.replace(/^\//, '').toLowerCase();
        if (path === 'login' || path === 'presensi' || path === 'screener' || path === '' || !VALID_TABS.includes(path)) {
          setActiveTab('dashboard');
          localStorage.setItem('hrportal_active_tab', 'dashboard');
          window.history.pushState(null, '', '/dashboard');
        }
      } else {
        if (window.location.pathname !== '/login') {
          window.history.replaceState(null, '', '/login');
        }
      }
    }
  }, [isAuthenticated, loading]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
          color: '#111827',
          fontSize: '1.1rem',
          fontWeight: 700,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}
      >
        Memuat HR Portal UNPAK...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardPage onNavigate={handleTabChange} globalPeriodType={periodType} onPeriodTypeChange={setPeriodType} />;
      case 'cuti':
        return <CutiPage />;
      case 'izin':
        return <IzinPage />;
      case 'sppd':
        return <SppdPage />;
      case 'slip-gaji':
        return <SlipGajiPage />;
      case 'libur':
        return <MasterLiburPage />;
      case 'upacara':
        return <MasterUpacaraPage />;
      case 'laporan':
        return <ReportPage globalPeriodType={periodType} onPeriodTypeChange={setPeriodType} />;
      default:
        return <DashboardPage onNavigate={handleTabChange} globalPeriodType={periodType} onPeriodTypeChange={setPeriodType} />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={handleTabChange}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <div
        className={`main-content-wrapper ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}
      >
        <Navbar
          activeTab={activeTab}
          periodType={periodType}
          onPeriodTypeChange={setPeriodType}
          onToggleMobileSidebar={() => {
            if (window.innerWidth < 1024) {
              setIsMobileSidebarOpen(!isMobileSidebarOpen);
            } else {
              setIsSidebarCollapsed(!isSidebarCollapsed);
            }
          }}
        />

        <main className="content-container">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};
