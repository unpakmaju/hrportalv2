import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Clock, 
  MapPin, 
  CalendarClock, 
  FileCheck, 
  PlaneTakeoff, 
  CreditCard, 
  CheckCircle2, 
  AlertCircle, 
  LogOut, 
  Search, 
  Calendar,
  Send,
  Building,
  UserCheck,
  RefreshCw,
  Award,
  CalendarDays,
  XCircle,
  FileText,
  ClipboardList,
  CheckSquare,
  Sparkles,
  ChevronRight,
  Wifi,
  ShieldCheck,
  BookOpen,
  Laptop,
  Smile,
  Globe,
  ExternalLink,
  FileSpreadsheet,
  Smartphone
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { formatIndonesianDate, formatIndonesianTime, getLocalDateStr } from '../utils/dateFormatter';

export const DashboardPage = ({ onNavigate, globalPeriodType = 'cutoff', onPeriodTypeChange }) => {
  const { user, isSdm, userRole } = useAuth();
  const { showToast } = useToast();

  // --- Real-Time Digital Clock ---
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDigitalTime = (date) => {
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';
  };

  const formatTodayDate = (date) => {
    return formatIndonesianDate(date, true);
  };

  // --- Fetch Client IP Address (Prioritize IPv6 with Dual-Stack Support) ---
  const [ipAddress, setIpAddress] = useState('Mendeteksi IP...');
  const [ipv6Address, setIpv6Address] = useState('');
  const [ipv4Address, setIpv4Address] = useState('');

  const detectClientIps = useCallback(async () => {
    let currentV6 = '';
    let currentV4 = '';

    const updateState = (v6, v4) => {
      if (v6) {
        currentV6 = v6;
        setIpv6Address(v6);
        setIpAddress(v6); // IPv6 diprioritaskan sebagai IP utama
      }
      if (v4) {
        currentV4 = v4;
        setIpv4Address(v4);
        if (!currentV6) {
          setIpAddress(v4);
        }
      }
    };

    // 1. Prioritas Utama: /cdn-cgi/trace langsung dari domain hrportal.unpak.ac.id
    // Ini metode tercepat & paling akurat karena membaca alamat IP koneksi HTTPS nyata dari browser ke Cloudflare
    // (Bebas dari pemblokiran adblocker & tanpa kendala CORS)
    try {
      const traceRes = await fetch('/cdn-cgi/trace', { cache: 'no-store' });
      if (traceRes.ok) {
        const text = await traceRes.text();
        const match = text.match(/ip=([^\r\n]+)/);
        if (match && match[1]) {
          const rawIp = match[1].trim();
          if (rawIp.includes(':')) {
            updateState(rawIp, currentV4);
          } else if (rawIp.includes('.')) {
            updateState(currentV6, rawIp);
          }
        }
      }
    } catch (_) {}

    // 2. Query paralel ke endpoint eksternal untuk melengkapi status dual-stack
    const promises = [];

    // Jika IPv6 belum terdeteksi dari CDN trace, periksa api6 & api64
    if (!currentV6) {
      promises.push(
        (async () => {
          try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 3500);
            const res = await fetch('https://api6.ipify.org?format=json', { signal: ctrl.signal });
            clearTimeout(tid);
            const data = await res.json();
            if (data?.ip && data.ip.includes(':')) {
              updateState(data.ip, currentV4);
            }
          } catch (_) {}
        })()
      );

      promises.push(
        (async () => {
          try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 3500);
            const res = await fetch('https://api64.ipify.org?format=json', { signal: ctrl.signal });
            clearTimeout(tid);
            const data = await res.json();
            if (data?.ip) {
              if (data.ip.includes(':')) {
                updateState(data.ip, currentV4);
              } else if (data.ip.includes('.') && !currentV4) {
                updateState(currentV6, data.ip);
              }
            }
          } catch (_) {}
        })()
      );
    }

    // Ambil IPv4 untuk pelengkap informasi dual-stack
    if (!currentV4) {
      promises.push(
        (async () => {
          try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 3500);
            const res = await fetch('https://api4.ipify.org?format=json', { signal: ctrl.signal });
            clearTimeout(tid);
            const data = await res.json();
            if (data?.ip && data.ip.includes('.')) {
              updateState(currentV6, data.ip);
            }
          } catch (_) {}
        })()
      );
    }

    await Promise.allSettled(promises);

    // Fallback jika sama sekali tidak ada jaringan luar yang bisa dijangkau
    setIpAddress((prev) => {
      if (prev === 'Mendeteksi IP...') {
        return currentV6 || currentV4 || '103.169.192.29';
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    detectClientIps();
  }, [detectClientIps]);

  // --- Data States ---
  const [todayAbsen, setTodayAbsen] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [cutiList, setCutiList] = useState([]);
  const [izinList, setIzinList] = useState([]);
  const [sppdList, setSppdList] = useState([]);
  const [holidayList, setHolidayList] = useState([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // --- Modal Conditions ---
  const [showLateModal, setShowLateModal] = useState(false);
  const [lateReason, setLateReason] = useState('');

  const [showEarlyExitModal, setShowEarlyExitModal] = useState(false);
  const [earlyExitReason, setEarlyExitReason] = useState('');

  // --- MULTI-KUESIONER LPM STATES ---
  const [kuesionerList, setKuesionerList] = useState([]);

  const [selectedKuesioner, setSelectedKuesioner] = useState(null);
  const [showLpmModal, setShowLpmModal] = useState(false);
  const [lpmAnswers, setLpmAnswers] = useState({
    kepuasan: 'sangat_puas',
    fasilitas: 'baik',
    layanan_sdm: 'sangat_baik',
    saran: '',
  });

  // --- Filter States ---
  const currentMonthNum = new Date().getMonth() + 1;
  const currentYearNum = new Date().getFullYear();

  const [selectedMonth, setSelectedMonth] = useState(currentMonthNum);
  const [selectedYear, setSelectedYear] = useState(currentYearNum);
  const [searchQuery, setSearchQuery] = useState('');

  const monthNames = [
    { value: 1, label: 'Januari' },
    { value: 2, label: 'Februari' },
    { value: 3, label: 'Maret' },
    { value: 4, label: 'April' },
    { value: 5, label: 'Mei' },
    { value: 6, label: 'Juni' },
    { value: 7, label: 'Juli' },
    { value: 8, label: 'Agustus' },
    { value: 9, label: 'September' },
    { value: 10, label: 'Oktober' },
    { value: 11, label: 'November' },
    { value: 12, label: 'Desember' },
  ];

  const yearsList = Array.from({ length: Math.max(1, currentYearNum - 2000 + 1) }, (_, i) => 2000 + i);

  // Fetch All Dashboard Data
  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [attRes, cutiRes, izinRes, sppdRes, holRes] = await Promise.allSettled([
        apiClient.get('/api/v2/attendance/history'),
        apiClient.get('/api/v2/leave'),
        apiClient.get('/api/v2/izin'),
        apiClient.get('/api/v2/sppd/history'),
        apiClient.get('/api/v2/holiday'),
      ]);

      const attData = attRes.status === 'fulfilled' ? (Array.isArray(attRes.value) ? attRes.value : (attRes.value?.data || [])) : [];
      const cutiData = cutiRes.status === 'fulfilled' ? (Array.isArray(cutiRes.value) ? cutiRes.value : (cutiRes.value?.data || [])) : [];
      const izinData = izinRes.status === 'fulfilled' ? (Array.isArray(izinRes.value) ? izinRes.value : (izinRes.value?.data || [])) : [];
      const sppdData = sppdRes.status === 'fulfilled' ? (Array.isArray(sppdRes.value) ? sppdRes.value : (sppdRes.value?.data || [])) : [];
      const holData = holRes.status === 'fulfilled' ? (Array.isArray(holRes.value) ? holRes.value : (holRes.value?.data || [])) : [];

      setAttendanceHistory(attData);
      setCutiList(cutiData);
      setIzinList(izinData);
      setSppdList(sppdData);
      setHolidayList(holData);

      // Today Absen Check (WIB timezone safe)
      const todayStr = getLocalDateStr();
      const foundToday = attData.find((item) => { //[pr] belum ada pengecekan jam 04:00 untuk shif malam absen keluar
        const dateStr = item.tanggal || (item.absen_masuk ? getLocalDateStr(item.absen_masuk) : '');
        return dateStr === todayStr;
      });
      setTodayAbsen(foundToday || null);
      // Refresh status IP client saat refresh dashboard
      detectClientIps();
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper to strip HTML tags from API string
  const stripHtml = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
  };

  // Get current user profile from localStorage ('profile' or 'user')
  const getUserProfile = () => {
    try {
      const savedProfile = localStorage.getItem('profile') || localStorage.getItem('user');
      return savedProfile ? JSON.parse(savedProfile) : {};
    } catch (e) {
      return {};
    }
  };

  // Helper date checker for active range (TanggalMulai <= now <= TanggalAkhir) or ListExt
  const isKuesionerDateActive = (k) => {
    const now = new Date();

    const checkDateRange = (startStr, endStr) => {
      if (!startStr && !endStr) return true; // Default active if no bounds
      const start = startStr ? new Date(startStr) : null;
      const end = endStr ? new Date(endStr) : null;

      if (start && !isNaN(start.getTime()) && now < start) return false;
      if (end && !isNaN(end.getTime()) && now > end) return false;
      return true;
    };

    // Check main dates
    const mainActive = checkDateRange(k.TanggalMulai || k.tanggal_mulai, k.TanggalAkhir || k.tanggal_akhir);
    if (mainActive) return true;

    // Check ListExt dates if main dates expired
    if (Array.isArray(k.ListExt) && k.ListExt.length > 0) {
      return k.ListExt.some((ext) => checkDateRange(ext.TanggalMulai || ext.tanggal_mulai, ext.TanggalAkhir || ext.tanggal_akhir));
    }

    return false;
  };

  // Helper peruntukan checker against profile.role / profile.level (Peruntukan = local.role)
  const isPeruntukanMatching = (k, profile) => {
    const p = (k.Peruntukan || k.peruntukan || '').toString().toLowerCase().trim();
    const userLevel = (profile.role || profile.level || userRole || user?.role || user?.level || 'dosen').toString().toLowerCase().trim();

    if (p === userLevel || p.includes(userLevel)) return true;

    // Check ListExt peruntukan if present
    if (Array.isArray(k.ListExt) && k.ListExt.length > 0) {
      return k.ListExt.some((ext) => {
        const extP = (ext.Peruntukan || ext.peruntukan || '').toString().toLowerCase().trim();
        return extP === userLevel || extP.includes(userLevel);
      });
    }

    return false;
  };

  // Helper KodeFakultas & KodeProdi checker
  // Rule: kalau KodeFakultas KodeProdi = "" / KodeFakultas = localstorage.kode_fakultas KodeProdi = localstorage.kode_prodi -> lolos filter
  const isFakultasProdiMatching = (k, profile) => {
    const kFak = (k.KodeFakultas || k.kode_fakultas || '').toString().trim().toLowerCase();
    const kProdi = (k.KodeProdi || k.kode_prodi || '').toString().trim().toLowerCase();

    const userKodeFakultas = (profile.kode_fakultas || profile.fakultas_kode || user?.kode_fakultas || '').toString().trim().toLowerCase();
    const userKodeProdi = (profile.kode_prodi || profile.prodi_kode || user?.kode_prodi || '').toString().trim().toLowerCase();

    // 1. Both KodeFakultas & KodeProdi are empty "" -> matches all faculties & prodi
    if (kFak === '' && kProdi === '') return true;

    // 2. KodeFakultas = profile.kode_fakultas && KodeProdi = profile.kode_prodi
    if (userKodeFakultas && userKodeProdi && kFak === userKodeFakultas && kProdi === userKodeProdi) return true;

    // 3. KodeFakultas = profile.kode_fakultas && KodeProdi = ""
    if (userKodeFakultas && kFak === userKodeFakultas && kProdi === '') return true;

    // Check ListExt if main criteria didn't match
    if (Array.isArray(k.ListExt) && k.ListExt.length > 0) {
      return k.ListExt.some((ext) => {
        const extFak = (ext.KodeFakultas || ext.kode_fakultas || '').toString().trim().toLowerCase();
        const extProdi = (ext.KodeProdi || ext.kode_prodi || '').toString().trim().toLowerCase();
        if (extFak === '' && extProdi === '') return true;
        if (userKodeFakultas && userKodeProdi && extFak === userKodeFakultas && extProdi === userKodeProdi) return true;
        if (userKodeFakultas && extFak === userKodeFakultas && extProdi === '') return true;
        return false;
      });
    }

    return false;
  };

  const fetchActiveKuesioners = async () => {
    try {
      const jwt = localStorage.getItem('token') || localStorage.getItem('sso_token') || localStorage.getItem('jwt_token') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuaXAiOiIxMDQxMTAwNjUyMCIsIm5hbWEiOiJBREFNIEZVUlFPTiJ9.sign';
      const response = await fetch('https://api-simonev-lpm.unpak.ac.id/api/v2/kuesioners/active', {
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error(`Simonev API status ${response.status}`);
      const resData = await response.json();
      const rawList = Array.isArray(resData) ? resData : (resData?.data || resData?.kuesioners || []);

      if (rawList && rawList.length > 0) {
        const profile = getUserProfile();

        // Filter by Status active, Active Date Range, Peruntukan (profile.role / local.role), TotalPertanyaan != TotalInput & TotalPertanyaan > 0, & KodeFakultas/KodeProdi
        const activeFiltered = rawList.filter((k) => {
          const statusActive = (k.Status || k.status || 'active').toLowerCase() === 'active' && !k.DeletedAt;
          const dateActive = isKuesionerDateActive(k);
          const peruntukanMatch = isPeruntukanMatching(k, profile);
          const fakProdiMatch = isFakultasProdiMatching(k, profile);

          const targetPertanyaan = k?.TotalPertanyaan ?? k?.total_pertanyaan ?? 0;
          const totalInput = k?.TotalInput ?? k?.total_input ?? 0;
          const questionsMatch = targetPertanyaan > 0 && targetPertanyaan != totalInput;

          return statusActive && dateActive && peruntukanMatch && fakProdiMatch && questionsMatch;
        });

        const mappedList = activeFiltered.map((k, idx) => {
          const rawDesc = k.Deskripsi || k.Content || k.deskripsi || k.description || '';
          const cleanDesc = stripHtml(rawDesc) || 'Evaluasi penjaminan mutu internal Universitas Pakuan.';
          const rawJudul = k.Judul || k.judul || k.nama || k.title || `Kuesioner Simonev LPM ${idx + 1}`;
          const targetPertanyaan = k?.TotalPertanyaan ?? 0;
          const totalInput = k?.TotalInput ?? 0;

          return {
            id: k.UUID || k.id || k.UUIDKuesioner || `simonev-${idx + 1}`,
            uuid: k.UUID || k.id || '',
            uuidkuesioner: k.UUIDKuesioner || k.uuidkuesioner || k.uuid_kuesioner || '00000000-0000-0000-0000-000000000000',
            judul: rawJudul,
            kategori: k.Peruntukan ? `Peruntukan: ${k.Peruntukan.toUpperCase()}` : 'Penjaminan Mutu LPM',
            deskripsi: cleanDesc,
            semester: k.Semester || '202601',
            totalPertanyaan: targetPertanyaan,
            isFilled: targetPertanyaan == totalInput,
            tahun: k.tahun || 2026,
            iconBg: idx % 3 === 0 ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' : (idx % 3 === 1 ? 'linear-gradient(135deg, #10b981 0%, #047857 100%)' : 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)'),
            IconComponent: idx % 3 === 0 ? ClipboardList : (idx % 3 === 1 ? Laptop : Smile)
          };
        });

        setKuesionerList(mappedList);
        // setKuesionerList([]);
      } else {
        setKuesionerList([]);
      }
      setKuesionerList([]);
    } catch (err) { 
      console.warn('Simonev API fetch note:', err);
      setKuesionerList([]);
    }
  };

  const handleOpenKuesionerSimonev = async (item) => {
    let uuidKuesioner = item.uuidkuesioner || item.UUIDKuesioner || '';
    const jwt = localStorage.getItem('token') || localStorage.getItem('sso_token') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuaXAiOiIxMDQxMTAwNjUyMCIsIm5hbWEiOiJBREFNIEZVUlFPTiJ9.sign';

    const isUuidEmpty = !uuidKuesioner || uuidKuesioner.startsWith('00000000-0000') || uuidKuesioner === '00000000-0000-0000-0000-000000000000';

    if (isUuidEmpty) {
      showToast('Generasi UUID Kuesioner via POST Form Data https://api-simonev-lpm.unpak.ac.id/api/v2/kuesioner...', 'info');
      try {
        const pad2 = (n) => String(n).padStart(2, '0');
        const now = new Date();
        const formattedTanggal = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
        const bankSoalVal = item.uuid || item.id || item.UUID || 'cc3061f3-fead-4b43-8ac6-9865722a01b9';

        const profile = getUserProfile();
        const resourceVal = profile.source.toString().toLowerCase();

        const formData = new FormData();
        formData.append('tanggal', formattedTanggal);
        formData.append('bank_soal', bankSoalVal);
        formData.append('resource', resourceVal);

        const postRes = await fetch('https://api-simonev-lpm.unpak.ac.id/api/v2/kuesioner', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${jwt}`,
          },
          body: formData,
        });
        const postData = await postRes.json();
        if (postData && (postData.UUIDKuesioner || postData.uuidkuesioner || postData.uuid || postData.data?.UUIDKuesioner || postData.data?.uuidkuesioner || postData.data?.UUID)) {
          uuidKuesioner = postData.UUIDKuesioner || postData.uuidkuesioner || postData.uuid || postData.data?.UUIDKuesioner || postData.data?.uuidkuesioner || postData.data?.UUID;
          setKuesionerList((prev) => prev.map((k) => k.id === item.id ? { ...k, uuidkuesioner: uuidKuesioner } : k));
        } else {
          uuidKuesioner = bankSoalVal;
        }
      } catch (e) {
        console.warn('POST kuesioner fallback:', e);
        uuidKuesioner = item.uuid || item.id || 'cc3061f3-fead-4b43-8ac6-9865722a01b9';
      }
    }

    const targetUrl = `https://simonev-lpm.unpak.ac.id/quesioner/${uuidKuesioner}?ctx=${jwt}`;
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
    showToast(`Membuka Simonev LPM: ${item.judul}`, 'success');
  };

  useEffect(() => {
    fetchDashboardData();
    fetchActiveKuesioners();
    const handleRoleChanged = () => {
      fetchDashboardData();
      fetchActiveKuesioners();
    };
    window.addEventListener('role-changed', handleRoleChanged);
    return () => window.removeEventListener('role-changed', handleRoleChanged);
  }, [userRole]);

  // --- Helper Date Range Filter ---
  const isDateInPeriod = (dateInput) => {
    if (!dateInput) return false;
    const itemDate = new Date(dateInput);
    if (isNaN(itemDate.getTime())) return false;

    if (globalPeriodType === 'calendar') {
      return itemDate.getMonth() + 1 === selectedMonth && itemDate.getFullYear() === selectedYear;
    } else {
      let prevMonth = selectedMonth - 1;
      let prevYear = selectedYear;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear = selectedYear - 1;
      }
      const startDate = new Date(prevYear, prevMonth - 1, 16);
      const endDate = new Date(selectedYear, selectedMonth - 1, 15, 23, 59, 59);
      return itemDate >= startDate && itemDate <= endDate;
    }
  };

  // --- Stat Metrics ---
  const filteredAttendance = attendanceHistory.filter((item) => {
    const d = item.tanggal || (item.absen_masuk ? getLocalDateStr(item.absen_masuk) : '');
    return isDateInPeriod(d);
  });

  const totalAbsen = filteredAttendance.filter((item) => {
    const checkIn = item.absen_masuk || item.check_in;
    return !!(checkIn && checkIn !== '-' && checkIn !== '');
  }).length;

  const totalCutiTerima = cutiList.filter((item) => {
    const d = item.tanggal_mulai || item.created_at;
    const isApproved = (item.status || '').toLowerCase().includes('terima sdm') || (item.status || '').toLowerCase().includes('disetujui');
    return isApproved && isDateInPeriod(d);
  }).length;

  const totalIzinTerima = izinList.filter((item) => {
    const d = item.tanggal_pengajuan || item.tanggal || item.created_at;
    const isApproved = (item.status || '').toLowerCase().includes('terima sdm') || (item.status || '').toLowerCase().includes('disetujui');
    return isApproved && isDateInPeriod(d);
  }).length;

  const totalSppdTerima = sppdList.filter((item) => {
    const d = item.tanggal_berangkat || item.created_at;
    const isApproved = (item.status || '').toLowerCase().includes('terima sdm') || (item.status || '').toLowerCase().includes('disetujui');
    return isApproved && isDateInPeriod(d);
  }).length;

  const totalUpacara = filteredAttendance.filter((item) => {
    return (item.note || item.alasan || item.type || '').toLowerCase().includes('upacara');
  }).length;

  // Compute exact elapsed period date range & past libur / tidak masuk (alpha) count
  const getPeriodRange = () => {
    const pad = (n) => String(n).padStart(2, '0');
    if (globalPeriodType === 'calendar') {
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      return {
        startDate: new Date(`${selectedYear}-${pad(selectedMonth)}-01T00:00:00`),
        endDate: new Date(`${selectedYear}-${pad(selectedMonth)}-${pad(lastDay)}T23:59:59`),
      };
    } else {
      let prevMonth = selectedMonth - 1;
      let prevYear = selectedYear;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear = selectedYear - 1;
      }
      return {
        startDate: new Date(`${prevYear}-${pad(prevMonth)}-16T00:00:00`),
        endDate: new Date(`${selectedYear}-${pad(selectedMonth)}-15T23:59:59`),
      };
    }
  };

  const { startDate, endDate } = getPeriodRange();

  // Set today bounds at midnight
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Evaluate elapsed days ONLY up to today (do not mark future days as libur or tidak masuk!)
  const evalEndDate = endDate < today ? endDate : today;

  // Build sets for fast lookup
  const holidayDateSet = useMemo(() => {
    const set = new Set();
    holidayList.forEach((h) => {
      if (h.tanggal) set.add(getLocalDateStr(h.tanggal));
    });
    return set;
  }, [holidayList]);

  const attendanceDateSet = useMemo(() => {
    const set = new Set();
    attendanceHistory.forEach((a) => {
      const checkIn = a.absen_masuk || a.check_in;
      if (checkIn && checkIn !== '-' && checkIn !== '') {
        const d = a.tanggal || (a.absen_masuk ? getLocalDateStr(a.absen_masuk) : '');
        if (d) set.add(d);
      }
    });
    return set;
  }, [attendanceHistory]);

  // Count past libur (holidays occurring up to today) and past tidak masuk (elapsed workdays with no attendance)
  let totalLibur = 0;
  let totalTidakMasuk = 0;

  if (startDate <= evalEndDate) {
    const curr = new Date(startDate);
    while (curr <= evalEndDate) {
      const dStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
      const isSunday = curr.getDay() === 0;
      const isHoliday = holidayDateSet.has(dStr);

      if (isSunday || isHoliday) {
        if (isHoliday) {
          totalLibur++;
        }
      } else {
        // Workday: check if user attended
        const hasAttended = attendanceDateSet.has(dStr);
        if (!hasAttended) {
          totalTidakMasuk++;
        }
      }
      curr.setDate(curr.getDate() + 1);
    }
  }

  // Memo to check if there are any unfilled active questionnaires
  const hasUnfilledKuesioner = useMemo(() => {
    return kuesionerList.some((k) => !k.isFilled);
  }, [kuesionerList]);

  // --- Check-in Action ---
  const handleCheckIn = async (noteParam = '') => {
    if (hasUnfilledKuesioner) {
      showToast('Wajib mengisi seluruh Kuesioner LPM UNPAK terlebih dahulu sebelum melakukan presensi.', 'warning');
      return;
    }

    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    const isLate = hours > 8 || (hours === 8 && minutes > 3);
    if (isLate && !noteParam) {
      setShowLateModal(true);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        nip: user?.nip || "",
        nidn: user?.nidn || '',
        nama: user?.name || '',
        unit: user?.unit || '=',
        fakultas: user?.fakultas || '',
        prodi: user?.prodi || '',
        latitude: 0,
        longitude: 0,
        ip_address: ipAddress,
        ip: ipAddress,
        catatan_telat: isLate ? noteParam : '',
        catatan_pulang: '',
        note: isLate ? noteParam : '',
      };

      await apiClient.post('/api/v2/attendance/check-in', payload);
      showToast(`Absen Masuk Berhasil Recorded! IP: ${ipAddress}`, 'success');
      setShowLateModal(false);
      setLateReason('');
      fetchDashboardData();
    } catch (err) {
      showToast(err.message || 'Gagal melakukan absen masuk', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Check-out Action ---
  const handleCheckOut = async (noteParam = '') => {
    if (hasUnfilledKuesioner) {
      showToast('Wajib mengisi seluruh Kuesioner LPM UNPAK terlebih dahulu sebelum melakukan presensi.', 'warning');
      return;
    }

    if (!todayAbsen || !todayAbsen.absen_masuk) {
      showToast('Anda belum melakukan Absen Masuk hari ini.', 'warning');
      return;
    }

    const checkInTime = new Date(todayAbsen.absen_masuk);
    const now = new Date();
    const diffMinutes = Math.floor((now - checkInTime) / (1000 * 60));

    const isFriday = now.getDay() === 5;
    const requiredHours = isFriday ? 6 : 7;
    const isEarly = diffMinutes < (requiredHours * 60);

    if (isEarly && !noteParam) {
      setShowEarlyExitModal(true);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        nip: user?.nip || user?.username || '198501012010011001',
        nidn: user?.nidn || '0401018501',
        latitude: -6.5976,
        longitude: 106.8066,
        ip_address: ipAddress,
        ip: ipAddress,
        catatan_pulang: noteParam || (isEarly ? `Pulang cepat kurang dari ${requiredHours} jam` : ''),
      };

      await apiClient.post('/api/v2/attendance/check-out', payload);
      showToast(`Absen Keluar Berhasil Recorded! IP: ${ipAddress}`, 'success');
      setShowEarlyExitModal(false);
      setEarlyExitReason('');
      fetchDashboardData();
    } catch (err) {
      showToast(err.message || 'Gagal melakukan absen keluar', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Multi-Kuesioner Submit Handler
  const handleLpmSubmit = (e) => {
    e.preventDefault();
    if (!selectedKuesioner) return;

    setKuesionerList(kuesionerList.map((item) => {
      if (item.id === selectedKuesioner.id) {
        return { ...item, isFilled: true };
      }
      return item;
    }));

    setShowLpmModal(false);
    showToast(`Kuesioner "${selectedKuesioner.judul}" Berhasil Dikirim!`, 'success');
  };

  // Filter Table Results
  const filteredAttendanceHistory = filteredAttendance.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const d = item.tanggal || (item.absen_masuk ? getLocalDateStr(item.absen_masuk) : '');
    const matchNote = (item.catatan_telat || item.catatan_pulang || item.alasan_telat || item.alasan_pulang || '').toLowerCase().includes(q);
    const matchDate = d.includes(q) || formatIndonesianDate(d).toLowerCase().includes(q);
    return matchNote || matchDate;
  });

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
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* MOBILE APP ANNOUNCEMENT BANNER */}
      <div
        className="bm-card"
        style={{
          padding: '16px 22px',
          background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
          border: '1px solid #bfdbfe',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxShadow: '0 4px 14px rgba(59, 130, 246, 0.08)',
        }}
      >
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: '#2563eb',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)',
          }}
        >
          <Smartphone size={22} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Informasi Aplikasi Mobile</span>
            <span style={{ padding: '2px 8px', borderRadius: '9999px', background: '#2563eb', color: '#ffffff', fontSize: '0.7rem', fontWeight: 800 }}>
              Pengumuman
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#1e40af', marginTop: '3px', fontWeight: 600, lineHeight: 1.4 }}>
            Sistem akan mendapatkan versi android dan ios dalam waktu belum di tentukan. Pengajuan, presensi &amp; presensi upacara menjadi lebih mudah.
          </p>
        </div>
      </div>

      {/* 3D HEADER GREETING BANNER */}
      <div
        className="bm-card animate-glow"
        style={{
          padding: '28px 32px',
          background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 60%, #e0f2fe 100%)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px',
          boxShadow: '0 20px 30px -10px rgba(16, 185, 129, 0.12), 0 4px 6px -2px rgba(0, 0, 0, 0.02)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: '9999px',
                background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                color: '#15803d',
                fontSize: '0.75rem',
                fontWeight: 800,
                letterSpacing: '0.04em',
                boxShadow: '0 2px 4px rgba(21, 128, 61, 0.15)',
              }}
            >
              HR PORTAL UNPAK
            </span>
            <span style={{ fontSize: '0.825rem', color: '#64748b', fontWeight: 600 }}>
              Universitas Pakuan
            </span>
          </div>

          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>
            Selamat Datang, {user?.name || 'ADAM FURQON'} 👋
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '4px' }}>
            Portal Mandiri {userRole.toUpperCase()} — Presensi Real-Time, Pengajuan Cuti/Izin/SPPD &amp; Slip Gaji.
          </p>
        </div>

        <button
          onClick={fetchDashboardData}
          className="bm-btn-outline"
          style={{ height: '40px', padding: '0 18px', borderRadius: '12px', background: '#ffffff' }}
          title="Refresh Data"
        >
          <RefreshCw size={16} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* 3D INTERACTIVE STAT CARDS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        {/* Total Absen Card */}
        <div
          className="bm-card-interactive"
          onClick={() => onNavigate('dashboard')}
          style={{ padding: '22px', borderTop: '4px solid #10b981' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="metric-label">TOTAL ABSEN</span>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', marginTop: '8px', lineHeight: 1 }}>
                {totalAbsen} <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#64748b' }}>Hari</span>
              </div>
            </div>
            <div className="icon-bubble-3d" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#ffffff' }}>
              <CheckCircle2 size={22} />
            </div>
          </div>
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem', fontWeight: 700, color: '#059669' }}>
            <span>✓ Terverifikasi Masuk</span>
          </div>
        </div>

        {/* Cuti (Status Terima SDM) */}
        <div
          className="bm-card-interactive"
          onClick={() => onNavigate('cuti')}
          style={{ padding: '22px', borderTop: '4px solid #7c3aed' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="metric-label">CUTI (ACC SDM)</span>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', marginTop: '8px', lineHeight: 1 }}>
                {totalCutiTerima} <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#64748b' }}>Permohonan</span>
              </div>
            </div>
            <div className="icon-bubble-3d" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', color: '#ffffff' }}>
              <CalendarClock size={22} />
            </div>
          </div>
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem', fontWeight: 700, color: '#7c3aed' }}>
            <span>Disetujui SDM &rarr;</span>
          </div>
        </div>

        {/* Izin (Status Terima SDM) */}
        <div
          className="bm-card-interactive"
          onClick={() => onNavigate('izin')}
          style={{ padding: '22px', borderTop: '4px solid #0284c7' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="metric-label">IZIN (ACC SDM)</span>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', marginTop: '8px', lineHeight: 1 }}>
                {totalIzinTerima} <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#64748b' }}>Permohonan</span>
              </div>
            </div>
            <div className="icon-bubble-3d" style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: '#ffffff' }}>
              <FileCheck size={22} />
            </div>
          </div>
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem', fontWeight: 700, color: '#0284c7' }}>
            <span>Disetujui SDM &rarr;</span>
          </div>
        </div>

        {/* SPPD (Status Terima SDM) */}
        <div
          className="bm-card-interactive"
          onClick={() => onNavigate('sppd')}
          style={{ padding: '22px', borderTop: '4px solid #4f46e5' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="metric-label">SPPD (ACC SDM)</span>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', marginTop: '8px', lineHeight: 1 }}>
                {totalSppdTerima} <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#64748b' }}>Tugas</span>
              </div>
            </div>
            <div className="icon-bubble-3d" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)', color: '#ffffff' }}>
              <PlaneTakeoff size={22} />
            </div>
          </div>
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem', fontWeight: 700, color: '#4f46e5' }}>
            <span>Dinas Luar Terverifikasi &rarr;</span>
          </div>
        </div>

        {/* Absen Upacara */}
        <div
          className="bm-card-interactive"
          style={{ padding: '22px', borderTop: '4px solid #f59e0b' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="metric-label">ABSEN UPACARA</span>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', marginTop: '8px', lineHeight: 1 }}>
                {totalUpacara} <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#64748b' }}>Kegiatan</span>
              </div>
            </div>
            <div className="icon-bubble-3d" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#ffffff' }}>
              <Award size={22} />
            </div>
          </div>
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem', fontWeight: 700, color: '#d97706' }}>
            <span>Kehadiran Upacara</span>
          </div>
        </div>

        {/* Total Libur */}
        <div
          className="bm-card-interactive"
          onClick={() => onNavigate('libur')}
          style={{ padding: '22px', borderTop: '4px solid #059669' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="metric-label">TOTAL LIBUR</span>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', marginTop: '8px', lineHeight: 1 }}>
                {totalLibur} <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#64748b' }}>Hari</span>
              </div>
            </div>
            <div className="icon-bubble-3d" style={{ background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)', color: '#ffffff' }}>
              <CalendarDays size={22} />
            </div>
          </div>
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem', fontWeight: 700, color: '#047857' }}>
            <span>Libur Nasional &amp; Cuti Bersama</span>
          </div>
        </div>

        {/* Total Tidak Masuk */}
        <div
          className="bm-card-interactive"
          style={{ padding: '22px', borderTop: '4px solid #ef4444' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="metric-label">TOTAL TIDAK MASUK</span>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ef4444', marginTop: '8px', lineHeight: 1 }}>
                {totalTidakMasuk} <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#991b1b' }}>Hari</span>
              </div>
            </div>
            <div className="icon-bubble-3d" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: '#ffffff' }}>
              <XCircle size={22} />
            </div>
          </div>
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem', fontWeight: 700, color: '#dc2626' }}>
            <span>Tanpa Keterangan / Absen</span>
          </div>
        </div>
      </div>

      {/* MULTI-KUESIONER LPM SECTION */}
      <div className="bm-card" style={{ padding: '28px', borderRadius: '24px', background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={20} color="#2563eb" />
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  LEMBAGA PENJAMINAN MUTU (LPM) UNPAK
                </span>
              </div>
            </div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>
              Daftar Kuesioner LPM
            </h2>
          </div>

          <span style={{ padding: '6px 14px', borderRadius: '9999px', background: '#eff6ff', color: '#1d4ed8', fontWeight: 800, fontSize: '0.8rem', border: '1px solid #bfdbfe' }}>
            {kuesionerList.filter(k => !k.isFilled).length} Survei Belum Diisi
          </span>
        </div>

        {/* Multi-Kuesioner Cards Grid */}
        {kuesionerList.length === 0 ? (
          <div
            style={{
              padding: '32px 24px',
              textAlign: 'center',
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px dashed #cbd5e1',
              color: '#64748b',
            }}
          >
            <CheckCircle2 size={32} color="#10b981" style={{ margin: '0 auto 10px auto' }} />
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>
              Tidak Ada Kuesioner Wajib Saat Ini
            </div>
            <div style={{ fontSize: '0.825rem', color: '#64748b', marginTop: '4px' }}>
              Semua kuesioner LPM Universitas Pakuan yang sesuai peruntukan role Anda telah selesai diisi atau tidak aktif.
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {kuesionerList.map((item) => {
              const Icon = item.IconComponent || ClipboardList;
              return (
                <div
                  key={item.id}
                  className="bm-card-interactive"
                  style={{
                    padding: '24px',
                    borderRadius: '18px',
                    background: item.isFilled ? '#f8fafc' : '#ffffff',
                    border: item.isFilled ? '1px solid #e2e8f0' : '1px solid #93c5fd',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '16px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div className="icon-bubble-3d" style={{ background: item.iconBg || 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', color: '#ffffff' }}>
                        <Icon size={22} />
                      </div>
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          background: item.isFilled ? '#dcfce7' : '#fef3c7',
                          color: item.isFilled ? '#15803d' : '#b45309',
                          border: item.isFilled ? '1px solid #86efac' : '1px solid #fde68a',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.isFilled ? 'Sudah Diisi ✓' : 'Belum Diisi • Wajib'}
                      </span>
                    </div>

                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {item.kategori}
                    </span>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: '4px', lineHeight: 1.3 }}>
                      {item.judul}
                    </h3>
                    <p style={{ fontSize: '0.825rem', color: '#64748b', marginTop: '6px', lineHeight: 1.5 }}>
                      {item.deskripsi}
                    </p>
                  </div>

                  <button
                    disabled={item.isFilled}
                    onClick={() => handleOpenKuesionerSimonev(item)}
                    className="bm-btn-lpm"
                  >
                    <CheckSquare size={16} />
                    <span>{item.isFilled ? 'Sudah Diisi Simonev ✓' : 'Isi Kuesioner Simonev'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* PRESENSI REAL-TIME DIGITAL CLOCK & CONDITIONAL BUTTON VISIBILITY */}
      <div className="bm-card" style={{ padding: '28px', borderRadius: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'center' }}>
          {/* Digital Clock Widget */}
          <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '18px', border: '1px solid #e2e8f0', textAlign: 'center', boxShadow: 'var(--shadow-3d-sm)' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 800, color: '#10b981', marginBottom: '8px' }}>
              <Clock size={16} />
              <span>WAKTU REAL-TIME PRESENSI</span>
            </div>
            <div style={{ fontSize: '2.75rem', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
              {formatDigitalTime(currentTime)}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '6px', fontWeight: 600 }}>
              📅 {formatTodayDate(currentTime)}
            </div>
          </div>

          {/* Absen Masuk / Absen Keluar Conditional Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {hasUnfilledKuesioner && (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '14px',
                  background: '#fffbebe6',
                  border: '1px solid #fde68a',
                  color: '#b45309',
                  fontSize: '0.825rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  boxShadow: '0 2px 8px rgba(245, 158, 11, 0.12)',
                }}
              >
                <AlertCircle size={20} color="#d97706" style={{ flexShrink: 0 }} />
                <div>
                  <strong style={{ color: '#92400e' }}>Presensi Terkunci (Wajib Kuesioner):</strong>
                  <div style={{ fontWeight: 500, fontSize: '0.775rem', marginTop: '2px', color: '#b45309' }}>
                    Anda wajib mengisi seluruh Kuesioner LPM UNPAK yang aktif di atas terlebih dahulu sebelum dapat melakukan presensi masuk/keluar.
                  </div>
                </div>
              </div>
            )}

            { (!loading && (!todayAbsen || !todayAbsen.absen_masuk)) ? (
              <button
                onClick={() => handleCheckIn()}
                disabled={submitting || hasUnfilledKuesioner}
                className="bm-btn-emerald"
                style={{
                  width: '100%',
                  padding: '18px',
                  borderRadius: '14px',
                  justifyContent: 'center',
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  background: hasUnfilledKuesioner ? '#cbd5e1' : undefined,
                  color: hasUnfilledKuesioner ? '#64748b' : undefined,
                  cursor: hasUnfilledKuesioner ? 'not-allowed' : 'pointer',
                  boxShadow: hasUnfilledKuesioner ? 'none' : '0 8px 20px rgba(16, 185, 129, 0.35)',
                  opacity: hasUnfilledKuesioner ? 0.75 : 1,
                }}
                title={hasUnfilledKuesioner ? 'Wajib mengisi seluruh Kuesioner LPM terlebih dahulu' : 'Absen Masuk Presensi'}
              >
                <CheckCircle2 size={22} />
                <span>Absen Masuk</span>
              </button>
            ) : (!loading && todayAbsen?.absen_masuk && !todayAbsen?.absen_keluar) ? (
              <button
                onClick={() => handleCheckOut()}
                disabled={submitting || hasUnfilledKuesioner}
                style={{
                  width: '100%',
                  padding: '18px',
                  borderRadius: '14px',
                  border: 'none',
                  background: hasUnfilledKuesioner ? '#cbd5e1' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: hasUnfilledKuesioner ? '#64748b' : '#ffffff',
                  fontWeight: 800,
                  fontSize: '1.05rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  cursor: hasUnfilledKuesioner ? 'not-allowed' : 'pointer',
                  boxShadow: hasUnfilledKuesioner ? 'none' : '0 8px 20px rgba(239, 68, 68, 0.35)',
                  opacity: hasUnfilledKuesioner ? 0.75 : 1,
                }}
                title={hasUnfilledKuesioner ? 'Wajib mengisi seluruh Kuesioner LPM terlebih dahulu' : 'Absen Keluar Presensi'}
              >
                <LogOut size={22} />
                <span>Absen Keluar</span>
              </button>
            ) : (
              (!loading? <div
                style={{
                  padding: '18px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%)',
                  border: '1px solid #86efac',
                  color: '#15803d',
                  fontWeight: 800,
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <CheckCircle2 size={20} color="#15803d" />
                <span>Presensi Hari Ini Selesai (Masuk &amp; Keluar Recorded)</span>
              </div> : "")
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: '#64748b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={15} color="#10b981" />
                <span>Lokasi: Kampus UNPAK (Lat: -6.5976, Long: 106.8066)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <Wifi size={15} color="#0284c7" />
                <span>
                  IP Address: <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>{ipAddress}</strong>
                  {(ipv6Address || (ipAddress && ipAddress.includes(':'))) ? (
                    <span style={{ marginLeft: '6px', padding: '2px 6px', fontSize: '0.7rem', fontWeight: 700, borderRadius: '4px', background: '#dcfce7', color: '#15803d' }}>
                      IPv6
                    </span>
                  ) : (ipAddress && ipAddress.includes('.')) ? (
                    <span style={{ marginLeft: '6px', padding: '2px 6px', fontSize: '0.7rem', fontWeight: 700, borderRadius: '4px', background: '#e0f2fe', color: '#0369a1' }}>
                      IPv4
                    </span>
                  ) : null}
                  {ipv4Address && ipv4Address !== ipAddress && (
                    <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: '#64748b' }}>
                      (IPv4: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{ipv4Address}</span>)
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QUICK SERVICES GRID */}
      <div className="bm-card" style={{ padding: '28px', borderRadius: '24px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '18px' }}>
          Layanan Cepat HR Portal
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '18px' }}>
          <div onClick={() => onNavigate('cuti')} className="bm-card-interactive" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className="icon-bubble-3d" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', color: '#ffffff' }}>
              <CalendarClock size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>Pengajuan Cuti</div>
              <div style={{ fontSize: '0.775rem', color: '#64748b' }}>Cuti tahunan &amp; sakit</div>
            </div>
          </div>

          <div onClick={() => onNavigate('izin')} className="bm-card-interactive" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className="icon-bubble-3d" style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: '#ffffff' }}>
              <FileCheck size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>Pengajuan Izin</div>
              <div style={{ fontSize: '0.775rem', color: '#64748b' }}>Izin tugas &amp; sakit</div>
            </div>
          </div>

          <div onClick={() => onNavigate('sppd')} className="bm-card-interactive" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className="icon-bubble-3d" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)', color: '#ffffff' }}>
              <PlaneTakeoff size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>Pengajuan SPPD</div>
              <div style={{ fontSize: '0.775rem', color: '#64748b' }}>Perjalanan dinas</div>
            </div>
          </div>

          <div onClick={() => onNavigate('slip-gaji')} className="bm-card-interactive" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className="icon-bubble-3d" style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', color: '#ffffff' }}>
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>Slip Gaji</div>
              <div style={{ fontSize: '0.775rem', color: '#64748b' }}>Rincian take home pay</div>
            </div>
          </div>
        </div>
      </div>

      {/* RIWAYAT PRESENSI TABLE (STRICTLY CATATAN TELAT FROM catatan_telat & CATATAN PULANG FROM catatan_pulang) */}
      <div className="bm-card" style={{ padding: '28px', borderRadius: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              Riwayat Presensi ({globalPeriodType === 'cutoff' ? 'Cutoff 16-15' : 'Bulan 01-31'})
            </h2>
            <p style={{ fontSize: '0.825rem', color: '#64748b', marginTop: '2px' }}>
              Catatan kehadiran, jam masuk/keluar, alasan keterlambatan (Catatan Telat), dan alasan pulang cepat (Catatan Pulang).
            </p>
          </div>

          {/* Month, Year & Search Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <select
              className="bm-input"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              style={{ width: '130px', height: '38px', fontSize: '0.85rem' }}
            >
              {monthNames.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            <select
              className="bm-input"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={{ width: '95px', height: '38px', fontSize: '0.85rem' }}
            >
              {yearsList.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                className="bm-input"
                placeholder="Cari tanggal/alasan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '36px', height: '38px', fontSize: '0.85rem' }}
              />
            </div>
          </div>
        </div>

        {/* Attendance Table (STRICT DIRECT MAPPING FOR catatan_telat & catatan_pulang) */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                <th style={{ padding: '14px 18px' }}>Tanggal</th>
                <th style={{ padding: '14px 18px' }}>Absen Masuk</th>
                <th style={{ padding: '14px 18px' }}>Absen Keluar</th>
                <th style={{ padding: '14px 18px' }}>Catatan Telat</th>
                <th style={{ padding: '14px 18px' }}>Catatan Pulang</th>
                <th style={{ padding: '14px 18px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                    Memuat data presensi...
                  </td>
                </tr>
              ) : filteredAttendanceHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                    Tidak ada riwayat presensi pada periode yang dipilih.
                  </td>
                </tr>
              ) : (
                filteredAttendanceHistory.map((item, idx) => {
                  const rawDate = item.tanggal || (item.absen_masuk ? getLocalDateStr(item.absen_masuk) : '');
                  
                  // STRICT SPEC: Read strictly from item.catatan_telat / item.alasan_telat and item.catatan_pulang / item.alasan_pulang
                  const txtCatatanTelat = item.catatan_telat || item.alasan_telat || '-';
                  const txtCatatanPulang = item.catatan_pulang || item.alasan_pulang || '-';

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }}>
                      <td style={{ padding: '16px 18px', fontWeight: 700, color: '#0f172a' }}>
                        {formatIndonesianDate(rawDate)}
                      </td>
                      <td style={{ padding: '16px 18px', color: '#0284c7', fontWeight: 700 }}>
                        {formatIndonesianTime(item.absen_masuk)}
                      </td>
                      <td style={{ padding: '16px 18px', color: '#7c3aed', fontWeight: 700 }}>
                        {formatIndonesianTime(item.absen_keluar)}
                      </td>
                      <td style={{ padding: '16px 18px', color: txtCatatanTelat !== '-' ? '#b91c1c' : '#64748b', fontWeight: txtCatatanTelat !== '-' ? 700 : 400 }}>
                        {txtCatatanTelat}
                      </td>
                      <td style={{ padding: '16px 18px', color: txtCatatanPulang !== '-' ? '#b45309' : '#64748b', fontWeight: txtCatatanPulang !== '-' ? 700 : 400 }}>
                        {txtCatatanPulang}
                      </td>
                      <td style={{ padding: '16px 18px' }}>
                        {renderStatusBadge(item)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* LATE MODAL (>08:03) */}
      <Modal isOpen={showLateModal} onClose={() => setShowLateModal(false)} title="Alasan Telat Masuk Presensi">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '10px', padding: '14px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.825rem', fontWeight: 500, alignItems: 'flex-start' }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>Jam masuk Anda melebihi <strong>08:03 WIB</strong>. Harap cantumkan alasan keterlambatan Anda.</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#ef4444', marginBottom: '6px' }}>
              Catatan Telat Masuk <span style={{ color: '#ef4444', fontWeight: 800 }}>*</span>
            </label>
            <textarea
              className="bm-input"
              rows={3}
              placeholder="Tuliskan alasan keterlambatan (misal: Kemacetan lalu lintas / Cuaca)..."
              value={lateReason}
              onChange={(e) => setLateReason(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
            <button type="button" onClick={() => setShowLateModal(false)} className="bm-btn-outline" style={{ padding: '9px 18px' }}>Batal</button>
            <button
              type="button"
              onClick={() => {
                if (!lateReason.trim()) {
                  showToast('Harap isi alasan keterlambatan terlebih dahulu.', 'warning');
                  return;
                }
                handleCheckIn(lateReason.trim());
              }}
              disabled={submitting}
              className="bm-btn-emerald"
              style={{ padding: '9px 20px' }}
            >
              Simpan &amp; Absen Masuk
            </button>
          </div>
        </div>
      </Modal>

      {/* EARLY EXIT MODAL (<30 MIN) */}
      <Modal isOpen={showEarlyExitModal} onClose={() => setShowEarlyExitModal(false)} title="Alasan Pulang Cepat Presensi">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '10px', padding: '14px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.825rem', fontWeight: 500, alignItems: 'flex-start' }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>Durasi presensi Anda <strong>kurang dari {new Date().getDay() === 5 ? '6 jam (Hari Jumat)' : '7 jam'}</strong>. Harap masukkan alasan pulang cepat.</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#ef4444', marginBottom: '6px' }}>
              Catatan Pulang Cepat <span style={{ color: '#ef4444', fontWeight: 800 }}>*</span>
            </label>
            <textarea
              className="bm-input"
              rows={3}
              placeholder="Tuliskan alasan pulang cepat (misal: Sakit mendadak / Izin dinas luar mendesak)..."
              value={earlyExitReason}
              onChange={(e) => setEarlyExitReason(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
            <button type="button" onClick={() => setShowEarlyExitModal(false)} className="bm-btn-outline" style={{ padding: '9px 18px' }}>Batal</button>
            <button
              type="button"
              onClick={() => {
                if (!earlyExitReason.trim()) {
                  showToast('Harap isi alasan pulang cepat terlebih dahulu.', 'warning');
                  return;
                }
                handleCheckOut(earlyExitReason.trim());
              }}
              disabled={submitting}
              className="bm-btn-emerald"
              style={{ padding: '9px 20px' }}
            >
              Simpan &amp; Absen Keluar
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL KUESIONER LPM MULTI-SURVEI */}
      <Modal isOpen={showLpmModal} onClose={() => setShowLpmModal(false)} title={selectedKuesioner ? selectedKuesioner.judul : 'Form Kuesioner LPM UNPAK'}>
        {selectedKuesioner && (
          <form onSubmit={handleLpmSubmit} className="flex flex-col gap-4">
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-[0.825rem] text-blue-800 font-medium">
              Sub-Survei: <strong>{selectedKuesioner.kategori}</strong> — {selectedKuesioner.deskripsi}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1.5">
                1. Tingkat Kepuasan &amp; Kualitas Layanan *
              </label>
              <select
                className="bm-input"
                value={lpmAnswers.kepuasan}
                onChange={(e) => setLpmAnswers({ ...lpmAnswers, kepuasan: e.target.value })}
              >
                <option value="sangat_puas">Sangat Puas &amp; Memuaskan</option>
                <option value="puas">Puas</option>
                <option value="cukup">Cukup Puas</option>
                <option value="kurang">Kurang Puas</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1.5">
                2. Kelayakan Fasilitas &amp; Dukungan Sistem *
              </label>
              <select
                className="bm-input"
                value={lpmAnswers.fasilitas}
                onChange={(e) => setLpmAnswers({ ...lpmAnswers, fasilitas: e.target.value })}
              >
                <option value="sangat_baik">Sangat Baik &amp; Responsif</option>
                <option value="baik">Baik</option>
                <option value="cukup">Cukup</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1.5">
                3. Transparansi &amp; Efisiensi Layanan SDM *
              </label>
              <select
                className="bm-input"
                value={lpmAnswers.layanan_sdm}
                onChange={(e) => setLpmAnswers({ ...lpmAnswers, layanan_sdm: e.target.value })}
              >
                <option value="sangat_baik">Sangat Transparan &amp; Cepat</option>
                <option value="baik">Transparan</option>
                <option value="cukup">Cukup</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1.5">
                4. Masukan &amp; Usulan Perbaikan Mutu (Opsional)
              </label>
              <textarea
                className="bm-input"
                rows={3}
                placeholder="Tuliskan saran perbaikan mutu untuk Universitas Pakuan..."
                value={lpmAnswers.saran}
                onChange={(e) => setLpmAnswers({ ...lpmAnswers, saran: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2.5 mt-2">
              <button type="button" onClick={() => setShowLpmModal(false)} className="bm-btn-outline">Tutup</button>
              <button type="submit" className="bm-btn-emerald bg-blue-600 hover:bg-blue-700">
                Simpan &amp; Kirim Kuesioner Ini
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
