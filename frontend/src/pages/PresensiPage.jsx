import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  MapPin, 
  CheckCircle2, 
  AlertCircle, 
  LogIn, 
  LogOut, 
  Calendar, 
  Sparkles,
  Search,
  Filter,
  FileText,
  UserCheck
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { getLocalDateStr } from '../utils/dateFormatter';
import { checkAttendanceLocation, getCurrentCoordinates, isWithinCampus } from '../utils/locationHelper';

export const PresensiPage = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [currentTime, setCurrentTime] = useState(new Date());
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const [todayRecord, setTodayRecord] = useState(null);
  const [todayCheckIn, setTodayCheckIn] = useState(null);
  const [todayCheckOut, setTodayCheckOut] = useState(null);

  // Network & GPS
  const [ipAddress, setIpAddress] = useState('');
  const [currentCoords, setCurrentCoords] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);

  useEffect(() => {
    fetch('/cdn-cgi/trace', { cache: 'no-store' })
      .then((res) => res.text())
      .then((text) => {
        const match = text.match(/ip=([^\r\n]+)/);
        if (match && match[1]) setIpAddress(match[1].trim());
      })
      .catch(() => {});

    setGeoLoading(true);
    getCurrentCoordinates().then((coords) => {
      if (coords) setCurrentCoords(coords);
      setGeoLoading(false);
    });
  }, []);

  const locationStatus = checkAttendanceLocation(
    currentCoords?.latitude || 0,
    currentCoords?.longitude || 0,
    ipAddress
  );

  // Modals for Rules 1, 1.a, 2, 2.a, 3, 3.a, 4
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [checkInConditions, setCheckInConditions] = useState({ isLate: false, isOutside: false });
  const [lateReason, setLateReason] = useState('');
  const [outsideReason, setOutsideReason] = useState('');

  const [showCheckOutModal, setShowCheckOutModal] = useState(false);
  const [checkOutConditions, setCheckOutConditions] = useState({ isEarly: false, isOutside: false });
  const [earlyExitReason, setEarlyExitReason] = useState('');
  const [outsideResult, setOutsideResult] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchAttendanceHistory = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/v2/attendance/history');
      let items = [];
      if (Array.isArray(res)) {
        items = res;
      } else if (res?.data && Array.isArray(res.data)) {
        items = res.data;
      }

      setHistory(items);

      const todayStr = getLocalDateStr();
      const foundToday = items.find((item) => {
        const dateStr = item.tanggal || (item.absen_masuk ? getLocalDateStr(item.absen_masuk) : '');
        return dateStr === todayStr;
      });

      if (foundToday) {
        setTodayRecord(foundToday);
        setTodayCheckIn(foundToday.absen_masuk || foundToday.check_in || null);
        setTodayCheckOut(foundToday.absen_keluar || foundToday.check_out || null);
      } else {
        setTodayRecord(null);
        setTodayCheckIn(null);
        setTodayCheckOut(null);
      }
    } catch (err) {
      console.warn('Gagal memuat riwayat presensi:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendanceHistory();
  }, []);

  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const isLate = hours > 8 || (hours === 8 && minutes > 0);

  const handleCheckInClick = async () => {
    if (todayCheckIn) {
      showToast('Anda sudah melakukan Absen Masuk hari ini.', 'info');
      return;
    }

    let coords = currentCoords;
    if (!coords || (coords.latitude === 0 && coords.longitude === 0)) {
      setGeoLoading(true);
      const freshCoords = await getCurrentCoordinates();
      setGeoLoading(false);
      if (freshCoords) {
        coords = freshCoords;
        setCurrentCoords(freshCoords);
      }
    }

    const locCheck = checkAttendanceLocation(coords?.latitude || 0, coords?.longitude || 0, ipAddress);
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const late = h > 8 || (h === 8 && m > 0);
    const outside = !locCheck.inRange;

    if (late || outside) {
      setCheckInConditions({ isLate: late, isOutside: outside });
      setShowCheckInModal(true);
      return;
    }

    executeCheckIn({});
  };

  const handleCheckOutClick = async () => {
    if (!todayCheckIn) {
      showToast('Anda belum melakukan Absen Masuk hari ini.', 'warning');
      return;
    }
    if (todayCheckOut) {
      showToast('Anda sudah melakukan Absen Keluar hari ini.', 'info');
      return;
    }

    let coords = currentCoords;
    if (!coords || (coords.latitude === 0 && coords.longitude === 0)) {
      setGeoLoading(true);
      const freshCoords = await getCurrentCoordinates();
      setGeoLoading(false);
      if (freshCoords) {
        coords = freshCoords;
        setCurrentCoords(freshCoords);
      }
    }

    const locCheck = checkAttendanceLocation(coords?.latitude || 0, coords?.longitude || 0, ipAddress);
    const now = new Date();
    const checkInTime = new Date(todayCheckIn || todayRecord?.absen_masuk);
    const diffMinutes = Math.floor((now - checkInTime) / (1000 * 60));
    const isFriday = now.getDay() === 5;
    const requiredHours = isFriday ? 6 : 7;
    const early = diffMinutes < (requiredHours * 60);

    const wasOutside = Boolean(
      todayRecord?.catatan_luar_unpak || 
      (todayRecord?.latitude && !isWithinCampus(todayRecord.latitude, todayRecord.longitude))
    );
    const isCurrentlyOutside = !locCheck.inRange;
    const isOutsideWork = wasOutside || isCurrentlyOutside;

    if (early) {
      setCheckOutConditions({ isEarly: early, isOutside: isOutsideWork });
      setShowCheckOutModal(true);
      return;
    }

    executeCheckOut({});
  };

  const executeCheckIn = async (notes = {}) => {
    setSubmitting(true);
    let coords = currentCoords;
    const locCheck = checkAttendanceLocation(coords?.latitude || 0, coords?.longitude || 0, ipAddress);
    const now = new Date();
    const late = now.getHours() > 8 || (now.getHours() === 8 && now.getMinutes() > 0);
    const outside = !locCheck.inRange;

    const noteTelat = notes.lateReason || (late ? lateReason : '');
    const noteLuar = notes.outsideReason || (outside ? outsideReason : '');

    try {
      await apiClient.post('/api/v2/attendance/check-in', {
        nip: user?.nip || user?.username || '',
        nidn: user?.nidn || '',
        nama: user?.name || '',
        unit: user?.unit || '',
        fakultas: user?.fakultas || '',
        prodi: user?.prodi || '',
        latitude: coords?.latitude || 0,
        longitude: coords?.longitude || 0,
        ip_address: ipAddress,
        ip: ipAddress,
        catatan_telat: late ? noteTelat : '',
        catatan_luar_unpak: outside ? noteLuar : '',
        catatan_pulang: '',
        note: [late ? noteTelat : '', outside ? noteLuar : ''].filter(Boolean).join(' | '),
      });

      showToast(`Absen Masuk Berhasil! Lokasi: ${locCheck.locationName}`, 'success');
      setShowCheckInModal(false);
      setLateReason('');
      setOutsideReason('');
      fetchAttendanceHistory();
    } catch (err) {
      showToast(err.message || 'Gagal melakukan Absen Masuk', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const executeCheckOut = async (notes = {}) => {
    setSubmitting(true);
    let coords = currentCoords;
    const locCheck = checkAttendanceLocation(coords?.latitude || 0, coords?.longitude || 0, ipAddress);
    const now = new Date();
    const checkInTime = new Date(todayCheckIn || todayRecord?.absen_masuk);
    const diffMinutes = Math.floor((now - checkInTime) / (1000 * 60));
    const isFriday = now.getDay() === 5;
    const requiredHours = isFriday ? 6 : 7;
    const early = diffMinutes < (requiredHours * 60);

    const wasOutside = Boolean(
      todayRecord?.catatan_luar_unpak || 
      (todayRecord?.latitude && !isWithinCampus(todayRecord.latitude, todayRecord.longitude))
    );
    const isOutsideWork = wasOutside || !locCheck.inRange;

    const notePulang = notes.earlyExitReason || (early ? earlyExitReason : '');
    const noteHasil = notes.outsideResult || ((early && isOutsideWork) ? outsideResult : '');

    try {
      await apiClient.post('/api/v2/attendance/check-out', {
        nip: user?.nip || user?.username || '',
        nidn: user?.nidn || '',
        ip_address: ipAddress,
        ip: ipAddress,
        catatan_pulang: early ? notePulang : '',
        catatan_hasil_luar_unpak: (early && isOutsideWork) ? noteHasil : '',
      });

      showToast(`Absen Keluar Berhasil! Lokasi: ${locCheck.locationName}`, 'success');
      setShowCheckOutModal(false);
      setEarlyExitReason('');
      setOutsideResult('');
      fetchAttendanceHistory();
    } catch (err) {
      showToast(err.message || 'Gagal melakukan Absen Keluar', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatusBadge = (item) => {
    const checkIn = item.absen_masuk || item.check_in;
    const checkOut = item.absen_keluar || item.check_out;

    const hasMasuk = !!(checkIn && checkIn !== '-' && checkIn !== '');
    const hasKeluar = !!(checkOut && checkOut !== '-' && checkOut !== '');

    const rawStatus = (item.status || item.type || item.note || item.catatan || item.alasan || '').toString().toLowerCase();

    if (rawStatus.includes('cuti')) {
      return <Badge variant="purple">Cuti</Badge>;
    }
    if (rawStatus.includes('izin') || rawStatus.includes('sakit')) {
      return <Badge variant="info">Izin</Badge>;
    }
    if (rawStatus.includes('sppd')) {
      return <Badge variant="info">SPPD</Badge>;
    }
    if (rawStatus.includes('libur')) {
      return <Badge variant="secondary">Libur</Badge>;
    }
    if (rawStatus.includes('tidak masuk') || rawStatus.includes('alpha') || rawStatus.includes('tanpa keterangan')) {
      return <Badge variant="danger">Tidak Masuk</Badge>;
    }

    if (!hasMasuk && !hasKeluar) {
      return <Badge variant="danger">Tidak Masuk</Badge>;
    }

    const txtCatatanTelat = item.catatan_telat || item.alasan_telat;
    const txtCatatanPulang = item.catatan_pulang || item.alasan_pulang;

    if ((txtCatatanTelat && txtCatatanTelat !== '-') || rawStatus.includes('telat') || rawStatus.includes('terlambat')) {
      return <Badge variant="warning">Terlambat</Badge>;
    }
    if ((txtCatatanPulang && txtCatatanPulang !== '-') || rawStatus.includes('pulang cepat')) {
      return <Badge variant="warning">Pulang Cepat</Badge>;
    }

    return <Badge variant="success">Hadir</Badge>;
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Banner */}
      <div
        className="glass-card"
        style={{
          padding: '24px 28px',
          background: 'linear-gradient(135deg, #f3e8ff 0%, #e0f2fe 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: '20px',
                background: '#e9d5ff',
                color: '#7c3aed',
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              Presensi Mandiri
            </span>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Universitas Pakuan
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>
            Panel Presensi Real-Time
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '2px' }}>
            {user?.name} • NIP: {user?.nip || user?.username} ({user?.role?.toUpperCase() || 'DOSEN/TENDIK'})
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: '#ffffff',
              padding: '12px 18px',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <MapPin size={22} color={locationStatus.inRange ? "#10b981" : "#f59e0b"} />
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: locationStatus.inRange ? '#15803d' : '#b45309' }}>
                {locationStatus.locationName}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {currentCoords ? `Lat: ${currentCoords.latitude.toFixed(4)}, Lon: ${currentCoords.longitude.toFixed(4)}` : (geoLoading ? 'Mendeteksi GPS...' : 'GPS Belum Siap')}
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: '#ffffff',
              padding: '12px 20px',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <Clock size={24} color="#0284c7" />
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'monospace', color: '#0284c7' }}>
                {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} WIB
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {currentTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Action Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Card Absen Masuk */}
        <div
          className="glass-card"
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderLeft: todayCheckIn ? '4px solid #10b981' : (isLate ? '4px solid #f59e0b' : '4px solid #7c3aed'),
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: todayCheckIn ? '#ecfdf5' : '#faf5ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <LogIn size={22} color={todayCheckIn ? '#10b981' : '#7c3aed'} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Absen Masuk</h3>
                  <p style={{ fontSize: '0.775rem', color: '#64748b' }}>Batas waktu 08:00 WIB</p>
                </div>
              </div>

              {todayCheckIn ? (
                <Badge variant="success">Sudah Masuk</Badge>
              ) : isLate ? (
                <Badge variant="warning">Terlambat (&gt;08:00)</Badge>
              ) : (
                <Badge variant="info">Tepat Waktu</Badge>
              )}
            </div>

            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Waktu Absen Masuk:</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: todayCheckIn ? '#10b981' : '#0f172a', marginTop: '2px' }}>
                {todayCheckIn ? new Date(todayCheckIn).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB' : '-- : --'}
              </div>
            </div>
          </div>

          <button
            onClick={handleCheckInClick}
            disabled={!!todayCheckIn || submitting}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: todayCheckIn
                ? '#e2e8f0'
                : 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
              color: todayCheckIn ? '#94a3b8' : '#ffffff',
              fontWeight: 800,
              cursor: todayCheckIn || submitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: todayCheckIn ? 'none' : '0 4px 14px rgba(124, 58, 237, 0.3)',
              transition: 'all 0.2s ease',
            }}
          >
            <LogIn size={18} />
            <span>{todayCheckIn ? 'Absen Masuk Selesai' : (isLate ? 'Absen Masuk (Isi Alasan)' : 'Absen Masuk Sekarang')}</span>
          </button>
        </div>

        {/* Card Absen Keluar */}
        <div
          className="glass-card"
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderLeft: todayCheckOut ? '4px solid #10b981' : '4px solid #0284c7',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: '#e0f2fe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <LogOut size={22} color="#0284c7" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Absen Keluar</h3>
                  <p style={{ fontSize: '0.775rem', color: '#64748b' }}>Minimal {new Date().getDay() === 5 ? '6 jam' : '7 jam'} kerja</p>
                </div>
              </div>

              {todayCheckOut ? (
                <Badge variant="success">Sudah Keluar</Badge>
              ) : (
                <Badge variant="info">Belum Absen Keluar</Badge>
              )}
            </div>

            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Waktu Absen Keluar:</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: todayCheckOut ? '#10b981' : '#0f172a', marginTop: '2px' }}>
                {todayCheckOut ? new Date(todayCheckOut).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB' : '-- : --'}
              </div>
            </div>
          </div>

          <button
            onClick={handleCheckOutClick}
            disabled={!todayCheckIn || !!todayCheckOut || submitting}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: (!todayCheckIn || todayCheckOut)
                ? '#e2e8f0'
                : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: (!todayCheckIn || todayCheckOut) ? '#94a3b8' : '#ffffff',
              fontWeight: 800,
              cursor: (!todayCheckIn || todayCheckOut || submitting) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: (!todayCheckIn || todayCheckOut) ? 'none' : '0 4px 14px rgba(2, 132, 199, 0.3)',
              transition: 'all 0.2s ease',
            }}
          >
            <LogOut size={18} />
            <span>{todayCheckOut ? 'Absen Keluar Selesai' : 'Absen Keluar Sekarang'}</span>
          </button>
        </div>
      </div>

      {/* Attendance History Section */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
            marginBottom: '20px',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
              Riwayat Presensi Bulan Ini
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Catatan kehadiran, jam masuk/keluar, dan alasan keterlambatan/pulang cepat.
            </p>
          </div>

          <div style={{ position: 'relative', minWidth: '260px' }}>
            <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Cari tanggal atau alasan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '38px', borderRadius: '10px' }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            Memuat riwayat presensi...
          </div>
        ) : filteredHistory.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
            Belum ada catatan riwayat presensi.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                  <th style={{ padding: '12px 16px' }}>Tanggal</th>
                  <th style={{ padding: '12px 16px' }}>Absen Masuk</th>
                  <th style={{ padding: '12px 16px' }}>Absen Keluar</th>
                  <th style={{ padding: '12px 16px' }}>Catatan / Alasan</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((row, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>
                      {row.tanggal || row.date || '-'}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#0284c7', fontWeight: 600 }}>
                      {row.absen_masuk || row.check_in || '-'}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#7c3aed', fontWeight: 600 }}>
                      {row.absen_keluar || row.check_out || '-'}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#475569', maxWidth: '300px' }}>
                      {row.note || row.catatan || row.alasan || '-'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {renderStatusBadge(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CHECK-IN MODAL (TELAT &/ATAU DI LUAR UNPAK) */}
      <Modal 
        isOpen={showCheckInModal} 
        onClose={() => !submitting && setShowCheckInModal(false)} 
        title={
          checkInConditions.isLate && checkInConditions.isOutside
            ? "Konfirmasi Absen Masuk (Telat & Luar Kampus)"
            : checkInConditions.isLate
            ? "Alasan Telat Masuk Presensi"
            : "Alasan Berada di Luar Kampus UNPAK"
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Info Alerts */}
          {checkInConditions.isLate && (
            <div style={{ display: 'flex', gap: '10px', padding: '12px 14px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.825rem', fontWeight: 500, alignItems: 'flex-start' }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>Jam masuk Anda melebihi <strong>08:00 WIB</strong>. Harap cantumkan alasan keterlambatan Anda.</div>
            </div>
          )}

          {checkInConditions.isOutside && (
            <div style={{ display: 'flex', gap: '10px', padding: '12px 14px', borderRadius: '12px', background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309', fontSize: '0.825rem', fontWeight: 500, alignItems: 'flex-start' }}>
              <MapPin size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>Anda terdeteksi <strong>berada di luar area Kampus UNPAK</strong> (tidak berada dalam radius GPS UNPAK / Teknik / Lapangan dan tidak terhubung ke WiFi UNPAK). Harap cantumkan alasan berada di luar UNPAK.</div>
            </div>
          )}

          {/* Catatan Telat Input */}
          {checkInConditions.isLate && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#ef4444', marginBottom: '6px' }}>
                Alasan Keterlambatan <span style={{ color: '#ef4444', fontWeight: 800 }}>*</span>
              </label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Tuliskan alasan keterlambatan (misal: Kemacetan lalu lintas / Cuaca)..."
                value={lateReason}
                onChange={(e) => setLateReason(e.target.value)}
                required
                disabled={submitting}
              />
            </div>
          )}

          {/* Catatan Luar UNPAK Input */}
          {checkInConditions.isOutside && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#d97706', marginBottom: '6px' }}>
                Alasan Berada di Luar UNPAK <span style={{ color: '#ef4444', fontWeight: 800 }}>*</span>
              </label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Tuliskan alasan bertugas/berada di luar kampus (misal: Dinas luar, survei lapangan, rapat eksternal)..."
                value={outsideReason}
                onChange={(e) => setOutsideReason(e.target.value)}
                required
                disabled={submitting}
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
            <button 
              type="button" 
              onClick={() => setShowCheckInModal(false)} 
              disabled={submitting}
              style={{
                padding: '9px 18px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                color: '#64748b',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => {
                if (checkInConditions.isLate && !lateReason.trim()) {
                  showToast('Harap isi alasan keterlambatan terlebih dahulu.', 'warning');
                  return;
                }
                if (checkInConditions.isOutside && !outsideReason.trim()) {
                  showToast('Harap isi alasan berada di luar UNPAK terlebih dahulu.', 'warning');
                  return;
                }
                executeCheckIn({ lateReason: lateReason.trim(), outsideReason: outsideReason.trim() });
              }}
              disabled={submitting}
              style={{
                padding: '9px 20px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                fontWeight: 700,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Menyimpan...' : 'Simpan & Absen Masuk'}
            </button>
          </div>
        </div>
      </Modal>

      {/* CHECK-OUT MODAL (PULANG CEPAT &/ATAU HASIL LUAR UNPAK) */}
      <Modal 
        isOpen={showCheckOutModal} 
        onClose={() => !submitting && setShowCheckOutModal(false)} 
        title={
          checkOutConditions.isOutside
            ? "Alasan Pulang Cepat & Hasil Kerja di Luar UNPAK"
            : "Alasan Pulang Cepat Presensi"
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '10px', padding: '12px 14px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.825rem', fontWeight: 500, alignItems: 'flex-start' }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              Durasi presensi Anda <strong>kurang dari {new Date().getDay() === 5 ? '6 jam (Hari Jumat)' : '7 jam'}</strong>. Harap masukkan alasan pulang cepat.
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#ef4444', marginBottom: '6px' }}>
              Alasan Pulang Cepat <span style={{ color: '#ef4444', fontWeight: 800 }}>*</span>
            </label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Tuliskan alasan pulang cepat (misal: Urusan keluarga mendesak / Keperluan medis)..."
              value={earlyExitReason}
              onChange={(e) => setEarlyExitReason(e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          {checkOutConditions.isOutside && (
            <div>
              <div style={{ display: 'flex', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: '0.8rem', fontWeight: 500, marginBottom: '8px' }}>
                <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>Karena Anda beraktivitas di luar Kampus UNPAK hari ini, silakan laporkan hasil pekerjaan yang telah diselesaikan.</div>
              </div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#15803d', marginBottom: '6px' }}>
                Apa hasil yang telah Anda lakukan di luar UNPAK? <span style={{ color: '#ef4444', fontWeight: 800 }}>*</span>
              </label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Tuliskan laporan hasil pekerjaan / kegiatan yang telah dilaksanakan di luar kampus..."
                value={outsideResult}
                onChange={(e) => setOutsideResult(e.target.value)}
                required
                disabled={submitting}
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
            <button 
              type="button" 
              onClick={() => setShowCheckOutModal(false)} 
              disabled={submitting}
              style={{
                padding: '9px 18px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                color: '#64748b',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => {
                if (!earlyExitReason.trim()) {
                  showToast('Harap isi alasan pulang cepat terlebih dahulu.', 'warning');
                  return;
                }
                if (checkOutConditions.isOutside && !outsideResult.trim()) {
                  showToast('Harap isi hasil yang telah Anda lakukan di luar UNPAK.', 'warning');
                  return;
                }
                executeCheckOut({
                  earlyExitReason: earlyExitReason.trim(),
                  outsideResult: outsideResult.trim(),
                });
              }}
              disabled={submitting}
              style={{
                padding: '9px 20px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                color: '#ffffff',
                fontWeight: 700,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Menyimpan...' : 'Simpan & Absen Keluar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
