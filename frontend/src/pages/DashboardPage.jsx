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
  WifiOff,
  Activity,
  Gauge,
  Zap,
  Coffee,
  AlertTriangle,
  Timer,
  Signal,
  ShieldCheck,
  BookOpen,
  Laptop,
  Smile,
  Globe,
  ExternalLink,
  FileSpreadsheet,
  Smartphone,
  Flag,
  Lock
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { formatIndonesianDate, formatIndonesianTime, getLocalDateStr } from '../utils/dateFormatter';
import { checkAttendanceLocation, getCurrentCoordinates, isWithinCampus, isWithinCeremonyLocation, checkCeremonyLocation } from '../utils/locationHelper';
import AttendanceMap from '../components/AttendanceMap';

export const DashboardPage = ({ onNavigate, globalPeriodType = 'cutoff', onPeriodTypeChange }) => {
  const { user, isSdm, userRole } = useAuth();
  const { showToast } = useToast();

  const [periodType, setPeriodType] = useState(() => {
    return localStorage.getItem('hrportal_period_type') || globalPeriodType || 'calendar';
  });

  useEffect(() => {
    if (globalPeriodType) {
      setPeriodType(globalPeriodType);
    }
  }, [globalPeriodType]);

  const handlePeriodChange = (newType) => {
    setPeriodType(newType);
    localStorage.setItem('hrportal_period_type', newType);
    if (onPeriodTypeChange) onPeriodTypeChange(newType);
  };

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

  // --- Granular Fetch Progress States ---
  const [fetchSteps, setFetchSteps] = useState({
    presensi: { label: 'Data Presensi', desc: 'Riwayat absen & status hari ini', status: 'pending' },
    cuti: { label: 'Pengajuan Cuti', desc: 'Status cuti tahunan & sakit', status: 'pending' },
    izin: { label: 'Permohonan Izin', desc: 'Izin dinas/terlambat/meninggalkan tugas', status: 'pending' },
    sppd: { label: 'Perjalanan SPPD', desc: 'Riwayat tugas & surat jalan', status: 'pending' },
    holiday: { label: 'Kalender Libur', desc: 'Kalender hari libur UNPAK & nasional', status: 'pending' },
  });
  const [fetchElapsed, setFetchElapsed] = useState(0);
  const [fetchErrorMsg, setFetchErrorMsg] = useState(null);

  // --- Real-Time Network Quality & Rick and Morty Multiverse Roast Engine ---
  // SEPARASI: Roasting ke Pengguna (trouble di sisi user/jaringan) vs Roasting ke Developer (trouble di sisi backend/API server, tidak terpengaruh koneksi user)
  const ROAST_QUOTES = {
    // 1. Trouble di Sisi PENGGUNA: Jaringan Lemot / Ping Tinggi
    slow_network: [
      'Dengar ya Morty... *burp* di antara jutaan realitas di multiverse, cuma di dimensi ini kita harus nunggu paket datamu jalan kaki ({ping}ms / {speed} Mbps)!',
      'Morty! Kamu pikir kuotamu bisa nembus server kalau sinyal cuma {speed} Mbps?! Kamu lagi tethering dari kalkulator jadul apa gimana?!',
      'Wubba Lubba Dub Dub! Ping {ping}ms ini bukan delay biasa Morty, ini bukti kamu lagi mojok di tempat yang kehalang tembok tebal! Geser ke dekat jendela gih!',
      'Secara sains kecepatan cahaya itu mutlak, Morty. Tapi paket data hematmu ({ping}ms) berhasil membantah hukum fisika kuantum dengan jadi selambat ini!',
      'Morty, jangan tatap layar dengan muka sedih gitu! Pindah posisi, cari sinyal! Kecepatan {speed} Mbps ini bikin portal gun ikutan ngelag!',
      'Bahkan baterai portal gun yang bocor dan karatan masih punya transfer rate lebih waras daripada tethering {speed} Mbps kamu, Morty! *burp*',
      'Kamu mau presensi hari ini atau nunggu kiamat multiverse dulu, Morty?! Beli paket data yang stabil, jangan numpang hotspot yang orangnya sudah jalan pulang!',
      'Sabar Morty... Bit datamu lagi ngos-ngosan mendaki bukit bawa paket presensi ({ping}ms). Lain kali cari tempat dengan sinyal yang lebih bagus!',
      'Koneksi {ping}ms... Ini semesta lagi menyindir kamu, Morty: "Mending kamu jalan ke dekat access point daripada bengong di pojokan lorong".',
      'Alien di planet Blips and Chitz saja punya WiFi 5G antardimensi, sedangkan kuotamu di sini ({ping}ms) ngos-ngosan seperti habis lari maraton!',
      'Morty, tarik napas... *burp* Sinyalmu {speed} Mbps ini butuh pertolongan darurat. Jangan buka streaming video dulu kalau mau presensi!',
      'Fisika kuantum geleng-geleng kepala melihat ping {ping}ms kamu, Morty. Paket datamu lagi mampir ngopi di warung kabel optik apa gimana?!',
    ],
    // 2. Trouble di Sisi PENGGUNA: Offline Total / Internet Terputus
    offline: [
      'Morty! *burp* Kamu cabut colokan router atau paket datamu habis?! Kita offline total! Jangan harap presensi tembus pakai telepati batin! 🔌',
      'Bagus sekali Morty, offline total. Sekarang kamu mau presensi pakai sinyal morse? Cek kuota atau aktifkan Wi-Fi kamu sebelum portalnya tertutup! 🛑',
      'Matrix-nya putus, Morty! Kamu sekarang terdampar di dimensi offline tanpa kuota. Coba cek mode pesawat di HP kamu sebelum panik! 📡',
      'Wubba Lubba Dub Dub! Koneksi internetmu lenyap ditelan void antardimensi! Cepat periksa router atau paket data sebelum jam absen berakhir! 🛸',
      'Morty, kamu tidak bisa menyalahkan portal HR kalau perangkatmu sendiri tidak ada sinyal! Keluar dari ruangan tertutup atau aktifkan koneksimu sekarang! 📶',
      'Tenang Morty, jangan panik dulu... *burp* Cek sambungan Wi-Fi atau paket datamu. Sinyalmu sedang bermasalah atau kuotanya habis tak bersisa?! 🔌',
      'Morty, kamu mau presensi di dimensi nyata tapi internetmu ada di dimensi gaib! Sambungkan lagi koneksimu sebelum Rick pusing! 🧪',
      'Di semesta lain alien sudah pakai transmisi kuantum antargalaksi, Morty! Sedangkan kamu di bumi lupa menyalakan paket data! Ayo aktifkan dulu! ⚡',
    ],
    // 3. Jaringan Cepat & Stabil (Pengguna Prima)
    fast: [
      'Boom! Wubba Lubba Dub Dub! Koneksi multiverse level dewa ({ping}ms / {speed} Mbps)! Secepat portal gun nembus dimensi C-137! ⚡🚀',
      'Akhirnya kamu pakai koneksi yang prima, Morty! Ping {ping}ms! Data terkirim secepat kecepatan cahaya, dewan Rick bangga! 🏎️💨',
      'Wusss! {speed} Mbps tanpa kompromi! Server HR Portal takluk dalam satu detik. Sekarang presensi sebelum dimensi ini glitch! 🧪✨',
      'Koneksi galaktik terdeteksi ({ping}ms)! Presensi mulus tanpa hambatan ruang dan waktu, kerja bagus Morty! 🌟',
    ],
    // 4. Trouble di Sisi DEVELOPER: Beberapa API Gagal (Internet Pengguna Aman & Online)
    // Sesuai aturan: Tidak terpengaruh koneksi jaringan pengguna, murni mengkritik server/backend code!
    dev_error_partial: [
      'Morty! *burp* Internet kamu sangat kencang ({speed} Mbps), tapi request {tasks} gagal! Ini murni ulah developernya yang push kode Jumat sore tanpa unit test!',
      'Dengar ya Morty, koneksimu aman sentosa, tapi endpoint {tasks} tumbang. Developernya pasti sedang beralasan: "Di localhost saya jalan normal kok!". Klasik!',
      'Astaga Morty, sinyalmu prima tapi API {tasks} error! Developernya menulis query database pakai satu jari sambil mengantuk apa bagaimana?!',
      'Morty! *burp* Bahkan Jerry bisa membuat endpoint {tasks} lebih stabil dari ini! Sinyalmu tidak salah sama sekali, developernya yang lupa pasang try-catch!',
      'Wubba Lubba Dub Dub! Jaringanmu 100% sehat, tapi route backend {tasks} bermasalah! Developernya pasti belajar backend dari tutorial kilat tanpa membaca dokumentasi!',
      'Jangan sentuh router kamu, Morty! Wi-Fi kamu sehat walafiat! Yang bermasalah itu logika route {tasks} di server backend developernya!',
      'Morty, lihat kan? Kuotamu aman terkendali, tapi respon {tasks} amblas. Developernya kebanyakan ngopi tapi lupa memantau error log di server!',
      'Sinyalmu mulus seperti jalan tol ({ping}ms), Morty! Tapi server backend developernya mogok di tanjakan {tasks}. Salahkan developernya, bukan Wi-Fi kamu!',
    ],
    // 5. Trouble di Sisi DEVELOPER: Seluruh API Gagal Total (Internet Pengguna Aman & Online)
    dev_error_all: [
      'SEMUANYA AMBRUK, MORTY! *burp* Internetmu lancar jaya, tapi server developernya mati total! Pasti developernya sedang migrasi database langsung di server production!',
      'Wubba Lubba Dub Dub! Koneksimu hijau prima ({speed} Mbps), tapi semua API rontok! Ini developernya sedang cosplay jadi black hole apa bagaimana?!',
      'Morty! *burp* Jangan salahkan kuotamu! Ini 100% mahakarya spaghetti-code dari developernya yang membuat server backend kewalahan!',
      'Semua endpoint menolak koneksi, Morty! Padahal internetmu sangat cepat! Developernya pasti sedang panik keringat dingin mengetik "git reset --hard"!',
      'Bahkan peradaban primitif di semesta C-137 punya backend lebih tangguh dari ini, Morty! Server HR Portal tumbang berjamaah gara-gara bug developernya!',
      'Morty, koneksi kita terhubung sempurna ({ping}ms), tapi server developernya tidak ada tanda-tanda kehidupan. Pasti developernya ketiduran di atas keyboard!',
    ],
  };

  const getRandomRoast = useCallback((type, pingVal, speedVal, tasksVal = '') => {
    let key = type;
    if (key === 'user_slow') key = 'slow_network';
    if (key === 'user_offline') key = 'offline';
    const list = ROAST_QUOTES[key] || ROAST_QUOTES.slow_network;
    const raw = list[Math.floor(Math.random() * list.length)];
    return raw
      .replace('{ping}', pingVal ? `${pingVal}` : '999+')
      .replace('{speed}', speedVal ? `${speedVal}` : '< 0.5')
      .replace('{tasks}', tasksVal || 'modul');
  }, []);

  const [networkInfo, setNetworkInfo] = useState({
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    ping: null,
    speedMbps: null,
    effectiveType: null,
    quality: 'checking', // 'good' | 'fair' | 'poor' | 'offline'
    lastTested: null,
  });
  const [userRoastMessage, setUserRoastMessage] = useState('');
  const [devRoastMessage, setDevRoastMessage] = useState('');
  const [roastMessage, setRoastMessage] = useState('');
  const [failedModules, setFailedModules] = useState([]);

  // Measure Realtime Latency & Connection Speed from Device Hardware/Network Stack
  const checkNetworkQuality = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setNetworkInfo({
        online: false,
        ping: null,
        speedMbps: 0,
        effectiveType: 'none',
        quality: 'offline',
        lastTested: new Date(),
      });
      const roast = getRandomRoast('offline', 0, 0);
      setUserRoastMessage(roast);
      setRoastMessage(roast);
      return { quality: 'offline', ping: null, speed: 0 };
    }

    const conn = typeof navigator !== 'undefined' ? (navigator.connection || navigator.mozConnection || navigator.webkitConnection) : null;
    const deviceDownlink = conn?.downlink ? Number(conn.downlink) : null;
    const effectiveType = conn?.effectiveType || '4g';
    const deviceRtt = conn?.rtt ? Number(conn.rtt) : null;

    // Prioritaskan nilai RTT dan Downlink langsung dari device
    let ping = deviceRtt;
    let speed = deviceDownlink;

    // Jika browser (misal Safari) belum mengimplementasikan conn.rtt, lakukan micro-ping cepat ke favicon/local asset dengan timeout ketat 600ms
    if (ping === null) {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 600);
        const startPing = performance.now();
        await fetch(window.location.origin + '/favicon.ico?_ping=' + Date.now(), { method: 'HEAD', cache: 'no-store', signal: ctrl.signal });
        clearTimeout(tid);
        ping = Math.round(performance.now() - startPing);
      } catch (_) {
        ping = 25; // default lokal latensi cepat
      }
    }

    if (speed === null) {
      speed = ping < 80 ? 15.0 : ping < 200 ? 5.2 : 1.2;
    }

    let quality = 'good';
    if (ping > 350 || speed < 1.0 || effectiveType === '2g' || effectiveType === 'slow-2g') {
      quality = 'poor';
    } else if (ping > 150 || speed < 3.0 || effectiveType === '3g') {
      quality = 'fair';
    } else {
      quality = 'good';
    }

    const roast = (quality === 'poor')
      ? getRandomRoast('slow_network', ping, speed)
      : (quality === 'fair')
      ? `Jaringan agak lambat nih (Ping: ${ping}ms, Speed: ${speed} Mbps). Sabar ya!`
      : getRandomRoast('fast', ping, speed);

    setNetworkInfo({
      online: true,
      ping,
      speedMbps: speed,
      effectiveType,
      quality,
      lastTested: new Date(),
    });
    if (quality === 'poor' || quality === 'fair') {
      setUserRoastMessage(roast);
    }
    setRoastMessage(roast);

    return { quality, ping, speed };
  }, [getRandomRoast]);

  // Online / Offline, Device Network Change & Real-Time Auto Monitoring Listener
  useEffect(() => {
    const updateConnectionStatus = () => {
      checkNetworkQuality();
    };

    const conn = typeof navigator !== 'undefined' ? (navigator.connection || navigator.mozConnection || navigator.webkitConnection) : null;
    if (conn && conn.addEventListener) {
      conn.addEventListener('change', updateConnectionStatus);
    }

    const handleOnline = () => {
      checkNetworkQuality();
    };
    const handleOffline = () => {
      const roast = getRandomRoast('offline', 0, 0);
      setNetworkInfo((prev) => ({ ...prev, online: false, quality: 'offline' }));
      setUserRoastMessage(roast);
      setRoastMessage(roast);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    checkNetworkQuality();

    // Pemantauan otomatis real-time dari device setiap 5 detik
    const netInterval = setInterval(() => {
      checkNetworkQuality();
    }, 5000);

    return () => {
      if (conn && conn.removeEventListener) {
        conn.removeEventListener('change', updateConnectionStatus);
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(netInterval);
    };
  }, [checkNetworkQuality, getRandomRoast]);

  // Real-time Loading Timer & Roasting Alert Trigger
  useEffect(() => {
    let timer;
    if (loading) {
      setFetchElapsed(0);
      timer = setInterval(() => {
        setFetchElapsed((prev) => {
          const next = prev + 1;
          if (next === 4) {
            const roast = getRandomRoast('slow_network', networkInfo.ping || 420, networkInfo.speedMbps || 0.6);
            setUserRoastMessage(roast);
            setRoastMessage(roast);
          }
          return next;
        });
      }, 1000);
    } else {
      setFetchElapsed(0);
    }
    return () => clearInterval(timer);
  }, [loading, networkInfo.ping, networkInfo.speedMbps, getRandomRoast]);

  // --- GPS Geolocation & Campus Detection (Real-Time Watcher) ---
  const [currentCoords, setCurrentCoords] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);

  const refreshGps = useCallback(() => {
    setGeoLoading(true);
    getCurrentCoordinates().then((coords) => {
      if (coords) setCurrentCoords(coords);
      setGeoLoading(false);
    });
  }, []);

  useEffect(() => {
    setGeoLoading(true);
    getCurrentCoordinates().then((coords) => {
      if (coords) setCurrentCoords(coords);
      setGeoLoading(false);
    });

    let watchId = null;
    if (typeof window !== 'undefined' && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (pos?.coords) {
            setCurrentCoords({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: Date.now(),
            });
            setGeoLoading(false);
          }
        },
        (err) => {
          if (err.code !== 3) {
            console.warn('Geolocation notice:', err.message);
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      );
    }

    return () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  const locationStatus = useMemo(() => {
    const lat = currentCoords?.latitude || 0;
    const lon = currentCoords?.longitude || 0;
    const accuracy = currentCoords?.accuracy || 0;
    return checkAttendanceLocation(lat, lon, ipAddress, accuracy);
  }, [currentCoords, ipAddress]);

  // --- Ceremony Attendance (Upacara Bendera) States & Memos ---
  const [todayCeremonyData, setTodayCeremonyData] = useState(null);
  const [hasCheckedInCeremony, setHasCheckedInCeremony] = useState(false);
  const [todayCeremonyRecord, setTodayCeremonyRecord] = useState(null);
  const [submittingCeremony, setSubmittingCeremony] = useState(false);
  const [ceremonyHistoryList, setCeremonyHistoryList] = useState([]);
  const [masterCeremoniesList, setMasterCeremoniesList] = useState([]);
  const [ceremonySearchQuery, setCeremonySearchQuery] = useState('');

  const isTanggal17 = currentTime.getDate() === 17;
  const hasCeremonyToday = isTanggal17 || Boolean(todayCeremonyData?.has_ceremony);

  const activeCeremonyInfo = useMemo(() => {
    if (todayCeremonyData?.ceremony) {
      return todayCeremonyData.ceremony;
    }
    if (isTanggal17) {
      return {
        nama: 'Upacara Bendera Rutin Tanggal 17',
        tanggal: getLocalDateStr(),
        jam_mulai: '08:00',
        jam_selesai: '09:00',
        lokasi: 'Lapangan Utama UNPAK',
        deskripsi: 'Upacara bendera bulanan civitas akademika Universitas Pakuan.',
      };
    }
    return {
      nama: 'Presensi Upacara Bendera UNPAK',
      tanggal: getLocalDateStr(),
      jam_mulai: '08:00',
      jam_selesai: '09:00',
      lokasi: 'Lapangan Utama UNPAK',
      deskripsi: 'Upacara bendera rutin setiap tanggal 17 atau jadwal resmi Master Upacara.',
    };
  }, [todayCeremonyData, isTanggal17]);

  const ceremonyTimeStatus = useMemo(() => {
    const rawStart = (activeCeremonyInfo?.jam_mulai || '08:00').trim() || '08:00';
    const rawEnd = (activeCeremonyInfo?.jam_selesai || '09:00').trim() || '09:00';

    const [startH, startM] = rawStart.split(':').map((v) => parseInt(v, 10) || 0);
    const [endH, endM] = rawEnd.split(':').map((v) => parseInt(v, 10) || 0);

    const startTimeStr = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
    const endTimeStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Rule: aktif dari jam_mulai hingga jam_selesai
    const isCeremonyTime = nowMinutes >= startMinutes && nowMinutes <= endMinutes;
    const isBefore = nowMinutes < startMinutes;
    const isAfter = nowMinutes > endMinutes;

    return {
      isCeremonyTime,
      isBefore,
      isAfter,
      startTimeStr,
      endTimeStr,
    };
  }, [currentTime, activeCeremonyInfo]);

  const ceremonyLocationStatus = useMemo(() => {
    const lat = currentCoords?.latitude || 0;
    const lon = currentCoords?.longitude || 0;
    const accuracy = currentCoords?.accuracy || 0;
    return checkCeremonyLocation(lat, lon, accuracy);
  }, [currentCoords]);

  // --- Modal Conditions (Rules 1, 1.a, 2, 2.a, 3, 3.a, 4) ---
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [checkInConditions, setCheckInConditions] = useState({ isLate: false, isOutside: false });
  const [lateReason, setLateReason] = useState('');
  const [outsideReason, setOutsideReason] = useState('');

  const [showCheckOutModal, setShowCheckOutModal] = useState(false);
  const [checkOutConditions, setCheckOutConditions] = useState({ isEarly: false, isOutside: false });
  const [earlyExitReason, setEarlyExitReason] = useState('');
  const [outsideResult, setOutsideResult] = useState('');

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

  // Daftar Layanan Cepat HR Portal (Sesuai Gambar 2: Cuti, Izin, SPPD, Slip Gaji)
  const quickServiceList = useMemo(() => [
    {
      tabKey: 'cuti',
      title: 'Pengajuan Cuti',
      description: 'Cuti tahunan & sakit',
      gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
      accentColor: '#8b5cf6',
      icon: <CalendarClock size={20} />,
    },
    {
      tabKey: 'izin',
      title: 'Pengajuan Izin',
      description: 'Izin tugas & sakit',
      gradient: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
      accentColor: '#0284c7',
      icon: <FileCheck size={20} />,
    },
    {
      tabKey: 'sppd',
      title: 'Pengajuan SPPD',
      description: 'Perjalanan dinas',
      gradient: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
      accentColor: '#4f46e5',
      icon: <PlaneTakeoff size={20} />,
    },
    {
      tabKey: 'slip-gaji',
      title: 'Slip Gaji',
      description: 'Rincian take home pay',
      gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
      accentColor: '#2563eb',
      icon: <FileSpreadsheet size={20} />,
    },
  ], []);

  // Fetch All Dashboard Data with Granular Tracking & Network Diagnostics
  const fetchDashboardData = async () => {
    setLoading(true);
    setFetchErrorMsg(null);
    const startTime = performance.now();

    setFetchSteps({
      presensi: { label: 'Data Presensi', desc: 'Riwayat absen & status hari ini', status: 'loading' },
      cuti: { label: 'Pengajuan Cuti', desc: 'Status cuti tahunan & sakit', status: 'loading' },
      izin: { label: 'Permohonan Izin', desc: 'Izin dinas & meninggalkan tugas', status: 'loading' },
      sppd: { label: 'Perjalanan SPPD', desc: 'Riwayat tugas & surat jalan', status: 'loading' },
      holiday: { label: 'Kalender Libur', desc: 'Kalender hari libur UNPAK & nasional', status: 'loading' },
    });

    const executeTask = async (key, label, desc, promise) => {
      try {
        const res = await promise;
        setFetchSteps((prev) => ({
          ...prev,
          [key]: { label, desc, status: 'success' },
        }));
        return { key, status: 'fulfilled', value: res };
      } catch (err) {
        setFetchSteps((prev) => ({
          ...prev,
          [key]: { label, desc, status: 'error', error: err?.message || 'Gagal memuat' },
        }));
        return { key, status: 'rejected', reason: err };
      }
    };

    try {
      const [attRes, cutiRes, izinRes, sppdRes, holRes] = await Promise.allSettled([
        executeTask('presensi', 'Data Presensi', 'Riwayat absen & status hari ini', apiClient.get('/api/v2/attendance/history')),
        executeTask('cuti', 'Pengajuan Cuti', 'Status cuti tahunan & sakit', apiClient.get('/api/v2/leave')),
        executeTask('izin', 'Permohonan Izin', 'Izin dinas & meninggalkan tugas', apiClient.get('/api/v2/izin')),
        executeTask('sppd', 'Perjalanan SPPD', 'Riwayat tugas & surat jalan', apiClient.get('/api/v2/sppd/history')),
        executeTask('holiday', 'Kalender Libur', 'Kalender hari libur UNPAK & nasional', apiClient.get('/api/v2/holiday')),
      ]);

      const attVal = attRes.status === 'fulfilled' && attRes.value?.status === 'fulfilled' ? attRes.value.value : null;
      const cutiVal = cutiRes.status === 'fulfilled' && cutiRes.value?.status === 'fulfilled' ? cutiRes.value.value : null;
      const izinVal = izinRes.status === 'fulfilled' && izinRes.value?.status === 'fulfilled' ? izinRes.value.value : null;
      const sppdVal = sppdRes.status === 'fulfilled' && sppdRes.value?.status === 'fulfilled' ? sppdRes.value.value : null;
      const holVal = holRes.status === 'fulfilled' && holRes.value?.status === 'fulfilled' ? holRes.value.value : null;

      const attData = Array.isArray(attVal) ? attVal : (attVal?.data || []);
      const cutiData = Array.isArray(cutiVal) ? cutiVal : (cutiVal?.data || []);
      const izinData = Array.isArray(izinVal) ? izinVal : (izinVal?.data || []);
      const sppdData = Array.isArray(sppdVal) ? sppdVal : (sppdVal?.data || []);
      const holData = Array.isArray(holVal) ? holVal : (holVal?.data || []);

      if (attVal) setAttendanceHistory(attData);
      if (cutiVal) setCutiList(cutiData);
      if (izinVal) setIzinList(izinData);
      if (sppdVal) setSppdList(sppdData);
      if (holVal) setHolidayList(holData);

      // Today Absen Check (WIB timezone safe)
      const isUserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

      if (attVal) {
        const todayStr = getLocalDateStr();
        const foundToday = attData.find((item) => {
          const dateStr = item.tanggal || (item.absen_masuk ? getLocalDateStr(item.absen_masuk) : '');
          return dateStr === todayStr;
        });
        setTodayAbsen(foundToday || null);
      } else {
        const isPresensiNetworkErr = !isUserOnline || 
          String(fetchSteps.presensi.error || '').toLowerCase().includes('failed to fetch') ||
          String(fetchSteps.presensi.error || '').toLowerCase().includes('network');
        setFetchErrorMsg(
          isPresensiNetworkErr
            ? 'Koneksi internet Anda terputus (Offline). Periksa kembali sambungan Wi-Fi atau paket data Anda.'
            : 'Gagal mengambil data riwayat presensi dari server. Server backend sedang bermasalah.'
        );
      }

      // Check Master Upacara & Ceremony Attendance History
      try {
        const [upacaraTodayRes, ceremonyAttRes, allMasterUpacaraRes] = await Promise.allSettled([
          apiClient.get('/api/v2/master-upacara/today'),
          apiClient.get('/api/v2/ceremony-attendance'),
          apiClient.get('/api/v2/master-upacara'),
        ]);

        if (upacaraTodayRes.status === 'fulfilled' && upacaraTodayRes.value) {
          setTodayCeremonyData(upacaraTodayRes.value);
        }

        if (allMasterUpacaraRes.status === 'fulfilled' && allMasterUpacaraRes.value) {
          const mVal = allMasterUpacaraRes.value;
          const mList = Array.isArray(mVal) ? mVal : (mVal?.data || []);
          setMasterCeremoniesList(mList);
        }

        if (ceremonyAttRes.status === 'fulfilled' && ceremonyAttRes.value) {
          const val = ceremonyAttRes.value;
          let cList = [];
          if (Array.isArray(val)) cList = val;
          else if (val?.data && Array.isArray(val.data)) cList = val.data;

          const todayStr = getLocalDateStr();
          const userNip = String(user?.nip || '').trim().toLowerCase();
          const userNidn = String(user?.nidn || '').trim().toLowerCase();
          const userUsername = String(user?.username || '').trim().toLowerCase();
          const userName = String(user?.name || user?.nama || '').trim().toLowerCase();

          const userRecords = cList.filter((item) => {
            const itemNip = String(item.nip || '').trim().toLowerCase();
            const itemNidn = String(item.nidn || '').trim().toLowerCase();
            const itemName = String(item.nama || '').trim().toLowerCase();

            // Match by NIP / NIDN / Username across both fields
            if (userNip && (itemNip === userNip || itemNidn === userNip)) return true;
            if (userNidn && (itemNip === userNidn || itemNidn === userNidn)) return true;
            if (userUsername && (itemNip === userUsername || itemNidn === userUsername)) return true;

            // Fallback match by Name if both NIP and NIDN were missing in record
            if (!itemNip && !itemNidn && userName && itemName && userName === itemName) return true;

            // If user has no identifiers, include
            if (!userNip && !userNidn && !userUsername) return true;

            return false;
          });

          setCeremonyHistoryList(userRecords);

          const found = userRecords.find((item) => {
            const cleanTanggal = String(item.tanggal || '').trim().slice(0, 10);
            const cleanCreatedAt = item.created_at ? getLocalDateStr(item.created_at) : '';
            return cleanTanggal === todayStr || cleanCreatedAt === todayStr;
          });
          setTodayCeremonyRecord(found || null);
          setHasCheckedInCeremony(Boolean(found));
        }
      } catch (err) {
        console.warn('Gagal memuat status upacara hari ini:', err);
      }

      // Track failed requests for Rick's developer roasting
      const failedList = [];
      if (!attVal) failedList.push('Presensi');
      if (!cutiVal) failedList.push('Cuti');
      if (!izinVal) failedList.push('Izin');
      if (!sppdVal) failedList.push('SPPD');
      if (!holVal) failedList.push('Hari Libur');
      setFailedModules(failedList);

      // Calculate Duration & Network Diagnostics
      const durationMs = Math.round(performance.now() - startTime);
      const durationSec = durationMs / 1000;
      const totalBytes = JSON.stringify([attData, cutiData, izinData, sppdData, holData]).length;
      const measuredSpeed = Number(((totalBytes * 8) / (durationSec * 1024 * 1024)).toFixed(2)) || (durationSec > 3 ? 0.6 : 3.5);
      const measuredPing = Math.max(30, Math.round(durationMs / 4));

      setNetworkInfo((prev) => {
        const ping = prev.ping || measuredPing;
        const speed = prev.speedMbps || measuredSpeed;
        let quality = 'good';
        if (!isUserOnline) quality = 'offline';
        else if (durationSec > 3.5 || ping > 350 || speed < 1.2) quality = 'poor';
        else if (durationSec > 2 || ping > 150) quality = 'fair';
        return { ...prev, online: isUserOnline, ping: isUserOnline ? ping : null, speedMbps: isUserOnline ? speed : 0, quality, lastTested: new Date() };
      });

      // SEPARASI ROASTING PENGGUNA VS DEVELOPER:
      // A. Jika trouble di sisi PENGGUNA (Offline / Internet Mati):
      if (!isUserOnline) {
        const uRoast = getRandomRoast('offline', 0, 0);
        setUserRoastMessage(uRoast);
        setRoastMessage(uRoast);
      }
      // B. Jika pengguna ONLINE, tapi request API gagal (Trouble di sisi DEVELOPER, tidak terpengaruh koneksi jaringan):
      else if (failedList.length === 5) {
        const devRoast = getRandomRoast('dev_error_all', measuredPing, measuredSpeed);
        setDevRoastMessage(devRoast);
        setRoastMessage(devRoast);
      } else if (failedList.length > 0) {
        const devRoast = getRandomRoast('dev_error_partial', measuredPing, measuredSpeed, failedList.join(', '));
        setDevRoastMessage(devRoast);
        setRoastMessage(devRoast);
      }
      // C. Jika semua request API sukses, tapi jaringan pengguna lemot:
      else if (durationSec > 3.5 || measuredPing > 350 || measuredSpeed < 1.2) {
        const uRoast = getRandomRoast('slow_network', measuredPing, measuredSpeed);
        setUserRoastMessage(uRoast);
        setRoastMessage(uRoast);
      }

      // Refresh status IP client saat refresh dashboard
      detectClientIps();
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setFetchErrorMsg(err?.message || 'Terjadi kesalahan sistem saat memuat data dashboard.');
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
  }, [userRole, user?.nip, user?.nidn, user?.username]);

  // --- Helper Date Range Filter ---
  const getPeriodDates = useCallback(() => {
    const pad = (n) => String(n).padStart(2, '0');
    if (periodType === 'calendar') {
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      return {
        startStr: `${selectedYear}-${pad(selectedMonth)}-01`,
        endStr: `${selectedYear}-${pad(selectedMonth)}-${pad(lastDay)}`,
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
        startStr: `${prevYear}-${pad(prevMonth)}-16`,
        endStr: `${selectedYear}-${pad(selectedMonth)}-15`,
        startDate: new Date(`${prevYear}-${pad(prevMonth)}-16T00:00:00`),
        endDate: new Date(`${selectedYear}-${pad(selectedMonth)}-15T23:59:59`),
      };
    }
  }, [periodType, selectedMonth, selectedYear]);

  const isDateInPeriod = useCallback((dateInput) => {
    if (!dateInput) return false;
    const dStr = getLocalDateStr(dateInput);
    if (!dStr) return false;
    const { startStr, endStr } = getPeriodDates();
    return dStr >= startStr && dStr <= endStr;
  }, [getPeriodDates]);

  // Build sets & maps for fast lookup
  const holidayMap = useMemo(() => {
    const map = new Map();
    holidayList.forEach((h) => {
      const d = h.tanggal ? getLocalDateStr(h.tanggal) : '';
      if (d) map.set(d, h);
    });
    return map;
  }, [holidayList]);

  const holidayDateSet = useMemo(() => {
    const set = new Set();
    holidayList.forEach((h) => {
      if (h.tanggal) set.add(getLocalDateStr(h.tanggal));
    });
    return set;
  }, [holidayList]);

  const attendanceMap = useMemo(() => {
    const map = new Map();
    attendanceHistory.forEach((a) => {
      const d = a.tanggal || (a.absen_masuk ? getLocalDateStr(a.absen_masuk) : '');
      if (d) {
        const existing = map.get(d);
        const checkIn = a.absen_masuk || a.check_in;
        const hasCheckIn = !!(checkIn && checkIn !== '-' && checkIn !== '');
        if (!existing || hasCheckIn) {
          map.set(d, a);
        }
      }
    });
    return map;
  }, [attendanceHistory]);

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

  // Approved leave / permit / official travel lookup maps
  const approvedCutiMap = useMemo(() => {
    const map = new Map();
    cutiList.forEach((item) => {
      const status = (item.status || '').toLowerCase();
      const isApproved = status.includes('terima sdm') || status.includes('disetujui');
      if (!isApproved) return;
      const start = item.tanggal_mulai ? getLocalDateStr(item.tanggal_mulai) : '';
      const end = (item.tanggal_selesai || item.tanggal_akhir || item.tanggal_mulai) 
        ? getLocalDateStr(item.tanggal_selesai || item.tanggal_akhir || item.tanggal_mulai) 
        : start;
      if (start) {
        let curr = new Date(start + 'T00:00:00');
        const endObj = new Date((end || start) + 'T00:00:00');
        while (curr <= endObj) {
          map.set(getLocalDateStr(curr), item);
          curr.setDate(curr.getDate() + 1);
        }
      }
    });
    return map;
  }, [cutiList]);

  const approvedIzinMap = useMemo(() => {
    const map = new Map();
    izinList.forEach((item) => {
      const status = (item.status || '').toLowerCase();
      const isApproved = status.includes('terima sdm') || status.includes('disetujui');
      if (!isApproved) return;
      const d = item.tanggal_pengajuan || item.tanggal || item.created_at;
      if (d) map.set(getLocalDateStr(d), item);
    });
    return map;
  }, [izinList]);

  const approvedSppdMap = useMemo(() => {
    const map = new Map();
    sppdList.forEach((item) => {
      const status = (item.status || '').toLowerCase();
      const isApproved = status.includes('terima sdm') || status.includes('disetujui');
      if (!isApproved) return;
      const start = item.tanggal_berangkat ? getLocalDateStr(item.tanggal_berangkat) : '';
      const end = item.tanggal_kembali ? getLocalDateStr(item.tanggal_kembali) : start;
      if (start) {
        let curr = new Date(start + 'T00:00:00');
        const endObj = new Date((end || start) + 'T00:00:00');
        while (curr <= endObj) {
          map.set(getLocalDateStr(curr), item);
          curr.setDate(curr.getDate() + 1);
        }
      }
    });
    return map;
  }, [sppdList]);

  // --- Full History List Generation: All dates in period appear (Goal 1) ---
  const fullHistoryList = useMemo(() => {
    const { startStr, endStr } = getPeriodDates();
    const todayStr = getLocalDateStr();

    // Determine latest date to include: today if within period, or period end if in the past
    let maxDateStr = endStr < todayStr ? endStr : todayStr;

    // Check if there are any attendance or leave records beyond today within the period
    attendanceHistory.forEach((a) => {
      const d = a.tanggal || (a.absen_masuk ? getLocalDateStr(a.absen_masuk) : '');
      if (d && d >= startStr && d <= endStr && d > maxDateStr) {
        maxDateStr = d;
      }
    });

    if (startStr > maxDateStr) {
      return [];
    }

    const rows = [];
    let curr = new Date(maxDateStr + 'T00:00:00');
    const startObj = new Date(startStr + 'T00:00:00');

    while (curr >= startObj) {
      const dStr = getLocalDateStr(curr);
      const isSunday = curr.getDay() === 0;
      const holiday = holidayMap.get(dStr);
      const isHoliday = !!holiday;
      const att = attendanceMap.get(dStr);

      const checkIn = att?.absen_masuk || att?.check_in;
      const checkOut = att?.absen_keluar || att?.check_out;
      const hasMasuk = !!(checkIn && checkIn !== '-' && checkIn !== '');
      const hasKeluar = !!(checkOut && checkOut !== '-' && checkOut !== '');

      const cuti = approvedCutiMap.get(dStr);
      const izin = approvedIzinMap.get(dStr);
      const sppd = approvedSppdMap.get(dStr);

      if (hasMasuk || hasKeluar) {
        // Actual attendance record
        const rawStatus = (att?.status || att?.type || att?.note || '').toLowerCase();
        const txtCatatanTelat = att?.catatan_telat || att?.alasan_telat || '-';
        const txtCatatanPulang = att?.catatan_pulang || att?.alasan_pulang || '-';

        let statusText = 'Hadir';
        if ((txtCatatanTelat && txtCatatanTelat !== '-') || rawStatus.includes('telat') || rawStatus.includes('terlambat')) {
          statusText = 'Terlambat';
        } else if ((txtCatatanPulang && txtCatatanPulang !== '-') || rawStatus.includes('pulang cepat')) {
          statusText = 'Pulang Cepat';
        }

        rows.push({
          ...att,
          tanggal: dStr,
          absen_masuk: checkIn || '-',
          absen_keluar: checkOut || '-',
          catatan_telat: txtCatatanTelat,
          catatan_pulang: txtCatatanPulang,
          status: statusText,
          isGenerated: false,
        });
      } else if (cuti) {
        rows.push({
          tanggal: dStr,
          absen_masuk: '-',
          absen_keluar: '-',
          catatan_telat: '-',
          catatan_pulang: '-',
          status: 'Cuti',
          note: cuti.alasan || cuti.jenis_cuti || 'Cuti Disetujui',
          isGenerated: true,
        });
      } else if (izin) {
        rows.push({
          tanggal: dStr,
          absen_masuk: '-',
          absen_keluar: '-',
          catatan_telat: '-',
          catatan_pulang: '-',
          status: 'Izin',
          note: izin.tujuan || izin.alasan || 'Izin Disetujui',
          isGenerated: true,
        });
      } else if (sppd) {
        rows.push({
          tanggal: dStr,
          absen_masuk: '-',
          absen_keluar: '-',
          catatan_telat: '-',
          catatan_pulang: '-',
          status: 'SPPD',
          note: sppd.maksud_perjalanan || 'Dinas Luar SPPD',
          isGenerated: true,
        });
      } else if (isSunday) {
        rows.push({
          tanggal: dStr,
          absen_masuk: '-',
          absen_keluar: '-',
          catatan_telat: '-',
          catatan_pulang: '-',
          status: 'Hari Minggu',
          isGenerated: true,
        });
      } else if (isHoliday) {
        rows.push({
          tanggal: dStr,
          absen_masuk: '-',
          absen_keluar: '-',
          catatan_telat: '-',
          catatan_pulang: '-',
          status: 'Libur',
          note: holiday.nama || holiday.keterangan || 'Libur Nasional',
          isGenerated: true,
        });
      } else {
        // Normal workday (Monday - Saturday) without attendance
        rows.push({
          tanggal: dStr,
          absen_masuk: '-',
          absen_keluar: '-',
          catatan_telat: '-',
          catatan_pulang: '-',
          status: 'Tidak Masuk',
          isGenerated: true,
        });
      }

      curr.setDate(curr.getDate() - 1);
    }

    return rows;
  }, [
    getPeriodDates,
    attendanceHistory,
    attendanceMap,
    holidayMap,
    approvedCutiMap,
    approvedIzinMap,
    approvedSppdMap,
  ]);

  // --- Metrics strictly derived from the evaluated period & full history (Goal 2) ---
  const totalAbsen = useMemo(() => {
    return fullHistoryList.filter((item) => {
      const checkIn = item.absen_masuk;
      return checkIn && checkIn !== '-' && checkIn !== '';
    }).length;
  }, [fullHistoryList]);

  const totalTidakMasuk = useMemo(() => {
    return fullHistoryList.filter((item) => item.status === 'Tidak Masuk').length;
  }, [fullHistoryList]);

  const totalLibur = useMemo(() => {
    const { startStr, endStr } = getPeriodDates();
    const todayStr = getLocalDateStr();
    const evalEndStr = endStr < todayStr ? endStr : todayStr;

    let count = 0;
    holidayMap.forEach((h, dStr) => {
      if (dStr >= startStr && dStr <= evalEndStr) {
        const dObj = new Date(dStr + 'T00:00:00');
        if (dObj.getDay() !== 0) {
          count++;
        }
      }
    });
    return count;
  }, [getPeriodDates, holidayMap]);

  const totalCutiTerima = useMemo(() => {
    return cutiList.filter((item) => {
      const d = item.tanggal_mulai || item.created_at;
      const isApproved = (item.status || '').toLowerCase().includes('terima sdm') || (item.status || '').toLowerCase().includes('disetujui');
      return isApproved && isDateInPeriod(d);
    }).length;
  }, [cutiList, isDateInPeriod]);

  const totalIzinTerima = useMemo(() => {
    return izinList.filter((item) => {
      const d = item.tanggal_pengajuan || item.tanggal || item.created_at;
      const isApproved = (item.status || '').toLowerCase().includes('terima sdm') || (item.status || '').toLowerCase().includes('disetujui');
      return isApproved && isDateInPeriod(d);
    }).length;
  }, [izinList, isDateInPeriod]);

  const totalSppdTerima = useMemo(() => {
    return sppdList.filter((item) => {
      const d = item.tanggal_berangkat || item.created_at;
      const isApproved = (item.status || '').toLowerCase().includes('terima sdm') || (item.status || '').toLowerCase().includes('disetujui');
      return isApproved && isDateInPeriod(d);
    }).length;
  }, [sppdList, isDateInPeriod]);

  const totalUpacara = useMemo(() => {
    return attendanceHistory.filter((item) => {
      const d = item.tanggal || (item.absen_masuk ? getLocalDateStr(item.absen_masuk) : '');
      const isUpacara = (item.note || item.alasan || item.type || '').toLowerCase().includes('upacara');
      return isUpacara && isDateInPeriod(d);
    }).length;
  }, [attendanceHistory, isDateInPeriod]);

  // Debug Log for Inspection (ensures all dates up to today are logged, including hasAttended on 16)
  useEffect(() => {
    const { startStr, endStr } = getPeriodDates();
    const todayStr = getLocalDateStr();
    const evalEndStr = endStr < todayStr ? endStr : todayStr;

    if (startStr <= evalEndStr) {
      let curr = new Date(startStr + 'T00:00:00');
      const endObj = new Date(evalEndStr + 'T00:00:00');

      while (curr <= endObj) {
        const dStr = getLocalDateStr(curr);
        const isSunday = curr.getDay() === 0;
        const isHoliday = holidayMap.has(dStr);
        const att = attendanceMap.get(dStr);
        const checkIn = att?.absen_masuk || att?.check_in;
        const hasAttended = !!(checkIn && checkIn !== '-' && checkIn !== '');

        if (isSunday) {
          console.log(`${dStr} = isSunday`);
        } else if (isHoliday) {
          console.log(`${dStr} = isHoliday${hasAttended ? ' (hasAttended)' : ''}`);
        } else if (!hasAttended) {
          console.log(`${dStr} = !hasAttended`);
        } else {
          console.log(`${dStr} = hasAttended`);
        }

        curr.setDate(curr.getDate() + 1);
      }
    }
  }, [getPeriodDates, holidayMap, attendanceMap]);

  // Memo to check if there are any unfilled active questionnaires
  const hasUnfilledKuesioner = useMemo(() => {
    return kuesionerList.some((k) => !k.isFilled);
  }, [kuesionerList]);

  // --- Check-in Action (Rules 1, 1.a, 2, 2.a) ---
  const handleCheckIn = async (customNote = null) => {
    if (hasUnfilledKuesioner) {
      showToast('Wajib mengisi seluruh Kuesioner LPM UNPAK terlebih dahulu sebelum melakukan presensi.', 'warning');
      return;
    }

    // Refresh GPS coordinates if not already available
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
    const hours = now.getHours();
    const minutes = now.getMinutes();

    // Rule definitions:
    // On-time: <= 08:00 WIB (Rule 1 & 1.a)
    // Late: > 08:00 WIB (Rule 2 & 2.a)
    const isLate = hours > 8 || (hours === 8 && minutes > 0);
    const isOutside = !locCheck.inRange;

    // If modal required and user hasn't submitted through modal yet:
    if (customNote === null) {
      if (isLate || isOutside) {
        setCheckInConditions({ isLate, isOutside });
        setShowCheckInModal(true);
        return;
      }
    }

    const noteTelat = customNote?.lateReason ?? (isLate ? lateReason : '');
    const noteLuar = customNote?.outsideReason ?? (isOutside ? outsideReason : '');

    setSubmitting(true);
    try {
      const payload = {
        nip: user?.nip || "",
        nidn: user?.nidn || '',
        nama: user?.name || '',
        unit: user?.unit || '',
        fakultas: user?.fakultas || '',
        prodi: user?.prodi || '',
        latitude: coords?.latitude || 0,
        longitude: coords?.longitude || 0,
        ip_address: ipAddress,
        ip: ipAddress,
        catatan_telat: isLate ? noteTelat : '',
        catatan_luar_unpak: isOutside ? noteLuar : '',
        catatan_pulang: '',
        note: [isLate ? noteTelat : '', isOutside ? noteLuar : ''].filter(Boolean).join(' | '),
      };

      await apiClient.post('/api/v2/attendance/check-in', payload);
      showToast(`Absen Masuk Berhasil! Lokasi: ${locCheck.locationName}`, 'success');
      setShowCheckInModal(false);
      setLateReason('');
      setOutsideReason('');
      fetchDashboardData();
    } catch (err) {
      showToast(err.message || 'Gagal melakukan absen masuk', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Check-out Action (Rules 3, 3.a, 4, 4-outside) ---
  const handleCheckOut = async (customNote = null) => {
    if (hasUnfilledKuesioner) {
      showToast('Wajib mengisi seluruh Kuesioner LPM UNPAK terlebih dahulu sebelum melakukan presensi.', 'warning');
      return;
    }

    if (!todayAbsen || !todayAbsen.absen_masuk) {
      showToast('Anda belum melakukan Absen Masuk hari ini.', 'warning');
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
    const checkInTime = new Date(todayAbsen.absen_masuk);
    const diffMinutes = Math.floor((now - checkInTime) / (1000 * 60));

    const isFriday = now.getDay() === 5;
    const requiredHours = isFriday ? 6 : 7;
    const isEarly = diffMinutes < (requiredHours * 60);

    // Check if worked outside UNPAK (determined by check-in status, NOT check-out location)
    const wasOutside = Boolean(
      (todayAbsen?.catatan_luar_unpak && todayAbsen.catatan_luar_unpak.trim() !== '') || 
      (todayAbsen?.latitude && todayAbsen?.longitude && !isWithinCampus(todayAbsen.latitude, todayAbsen.longitude) && !todayAbsen?.ip_address?.includes('103.169'))
    );
    const isOutsideWork = wasOutside;

    // Rule 3, 3.a, 4: early check out (< 15:00) requires modal
    if (customNote === null) {
      if (isEarly) {
        setCheckOutConditions({ isEarly, isOutside: isOutsideWork });
        setShowCheckOutModal(true);
        return;
      }
    }

    const notePulang = customNote?.earlyExitReason ?? (isEarly ? earlyExitReason : '');
    const noteHasil = customNote?.outsideResult ?? ((isEarly && isOutsideWork) ? outsideResult : '');

    setSubmitting(true);
    try {
      const payload = {
        nip: user?.nip || user?.username || '',
        nidn: user?.nidn || '',
        ip_address: ipAddress,
        ip: ipAddress,
        catatan_pulang: isEarly ? notePulang : '',
        catatan_hasil_luar_unpak: (isEarly && isOutsideWork) ? noteHasil : '',
      };

      await apiClient.post('/api/v2/attendance/check-out', payload);
      showToast(`Absen Keluar Berhasil! Lokasi: ${locCheck.locationName}`, 'success');
      setShowCheckOutModal(false);
      setEarlyExitReason('');
      setOutsideResult('');
      fetchDashboardData();
    } catch (err) {
      showToast(err.message || 'Gagal melakukan absen keluar', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Absen Upacara Bendera Action ---
  const handleCeremonyCheckIn = async () => {
    if (submittingCeremony) return;

    if (!hasCeremonyToday) {
      showToast('Hari ini tidak terdapat jadwal upacara bendera.', 'warning');
      return;
    }

    if (!ceremonyTimeStatus.isCeremonyTime) {
      showToast(
        ceremonyTimeStatus.isBefore
          ? `Absen Upacara belum dibuka. Presensi dibuka pukul ${ceremonyTimeStatus.startTimeStr} - ${ceremonyTimeStatus.endTimeStr} WIB.`
          : `Waktu pelaksanaan Absen Upacara telah berakhir (${ceremonyTimeStatus.startTimeStr} - ${ceremonyTimeStatus.endTimeStr} WIB).`,
        'warning'
      );
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

    const lat = coords?.latitude || 0;
    const lon = coords?.longitude || 0;
    const inRange = isWithinCeremonyLocation(lat, lon);

    if (!inRange) {
      showToast(
        'Gagal Presensi Upacara: Anda wajib berada di Area Lapangan Utama UNPAK.',
        'error'
      );
      return;
    }

    setSubmittingCeremony(true);
    try {
      const todayStr = getLocalDateStr();
      await apiClient.post('/api/v2/ceremony-attendance', {
        nip: String(user?.nip || user?.username || '').trim(),
        nidn: String(user?.nidn || '').trim(),
        nama: user?.nama || user?.name || '',
        unit: user?.unit || user?.unit_kerja || '',
        fakultas: user?.fakultas || '',
        prodi: user?.prodi || '',
        tanggal: todayStr,
      });

      showToast('Berhasil melakukan Presensi Upacara Bendera!', 'success');
      setHasCheckedInCeremony(true);
      fetchDashboardData();
    } catch (err) {
      const errMsg = String(err?.message || '').toLowerCase();
      if (errMsg.includes('sudah absen upacara') || errMsg.includes('already') || errMsg.includes('tercatat')) {
        showToast('Presensi Upacara Anda telah tercatat untuk hari ini.', 'info');
        setHasCheckedInCeremony(true);
        fetchDashboardData();
        return;
      }
      showToast(err.message || 'Gagal melakukan absen upacara', 'error');
    } finally {
      setSubmittingCeremony(false);
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
  const filteredAttendanceHistory = useMemo(() => {
    return fullHistoryList.filter((item) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const d = item.tanggal || (item.absen_masuk ? getLocalDateStr(item.absen_masuk) : '');
      const matchNote = (item.catatan_telat || item.catatan_pulang || item.alasan_telat || item.alasan_pulang || item.note || '').toLowerCase().includes(q);
      const matchDate = d.includes(q) || formatIndonesianDate(d).toLowerCase().includes(q);
      const matchStatus = (item.status || '').toLowerCase().includes(q);
      return matchNote || matchDate || matchStatus;
    });
  }, [fullHistoryList, searchQuery]);

  // Filtered Ceremony Attendance History
  const filteredCeremonyHistory = useMemo(() => {
    return ceremonyHistoryList
      .filter((item) => {
        if (!ceremonySearchQuery.trim()) return true;
        const q = ceremonySearchQuery.toLowerCase();
        const rawDate = String(item.tanggal || (item.created_at ? getLocalDateStr(item.created_at) : '')).slice(0, 10);
        const matchDate = rawDate.includes(q) || formatIndonesianDate(rawDate).toLowerCase().includes(q);
        const matchName = (item.nama || '').toLowerCase().includes(q);
        const matchUnit = (item.unit || item.fakultas || item.prodi || '').toLowerCase().includes(q);
        return matchDate || matchName || matchUnit;
      })
      .sort((a, b) => {
        const dateA = String(a.tanggal || (a.created_at ? getLocalDateStr(a.created_at) : '')).slice(0, 10);
        const dateB = String(b.tanggal || (b.created_at ? getLocalDateStr(b.created_at) : '')).slice(0, 10);
        return dateB.localeCompare(dateA);
      });
  }, [ceremonyHistoryList, ceremonySearchQuery]);

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
    if (rawStatus.includes('minggu')) {
      return <Badge variant="secondary">Hari Minggu</Badge>;
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
          disabled={loading}
          className="bm-btn-outline"
          style={{
            height: '40px',
            padding: '0 18px',
            borderRadius: '12px',
            background: '#ffffff',
            opacity: loading ? 0.75 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
          title="Refresh Data & Sinkronisasi"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>{loading ? `Memuat (${fetchElapsed}s)...` : 'Refresh Data'}</span>
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

      {/* CARD ABSEN UPACARA BENDERA (Selalu ditampilkan, jika bukan jadwal upacara maka berstatus terkunci) */}
      <div
        className="bm-card"
        style={{
          padding: '24px 28px',
          borderRadius: '24px',
          background: hasCeremonyToday
            ? 'linear-gradient(135deg, #fff1f2 0%, #ffffff 60%, #fff7ed 100%)'
            : 'linear-gradient(135deg, #f8fafc 0%, #ffffff 60%, #f1f5f9 100%)',
          border: hasCeremonyToday ? '1.5px solid #fecdd3' : '1.5px solid #e2e8f0',
          boxShadow: hasCeremonyToday
            ? '0 8px 24px -4px rgba(225, 29, 72, 0.12)'
            : '0 8px 24px -4px rgba(100, 116, 139, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          animation: 'fadeIn 0.25s ease',
        }}
      >
        {/* Card Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '14px',
                background: hasCeremonyToday
                  ? 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)'
                  : 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: hasCeremonyToday
                  ? '0 4px 14px rgba(225, 29, 72, 0.35)'
                  : '0 4px 14px rgba(71, 85, 105, 0.25)',
                flexShrink: 0,
              }}
            >
              {hasCeremonyToday ? <Flag size={22} /> : <Lock size={20} />}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: hasCeremonyToday ? '#9f1239' : '#334155',
                  }}
                >
                  {activeCeremonyInfo?.nama || 'Presensi Upacara Bendera UNPAK'}
                </h3>
                {hasCeremonyToday ? (
                  <span
                    style={{
                      fontSize: '0.725rem',
                      fontWeight: 800,
                      padding: '3px 10px',
                      borderRadius: '9999px',
                      background: '#ffe4e6',
                      color: '#be123c',
                      border: '1px solid #fecdd3',
                    }}
                  >
                    Wajib Upacara
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: '0.725rem',
                      fontWeight: 800,
                      padding: '3px 10px',
                      borderRadius: '9999px',
                      background: '#f1f5f9',
                      color: '#64748b',
                      border: '1px solid #cbd5e1',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Lock size={11} /> Tidak Ada Jadwal Hari Ini (Terkunci)
                  </span>
                )}
              </div>
              <p
                style={{
                  margin: '4px 0 0 0',
                  fontSize: '0.835rem',
                  color: hasCeremonyToday ? '#881337' : '#64748b',
                }}
              >
                {hasCeremonyToday ? (
                  <>
                    Waktu: <strong>{ceremonyTimeStatus.startTimeStr} - {ceremonyTimeStatus.endTimeStr} WIB</strong> • Lokasi: <strong>{activeCeremonyInfo?.lokasi || 'Lapangan Utama UNPAK'}</strong>
                  </>
                ) : (
                  <>
                    Jadwal Rutin: <strong>Setiap Tanggal 17 ({ceremonyTimeStatus.startTimeStr} - {ceremonyTimeStatus.endTimeStr} WIB)</strong> • Lokasi: <strong>{activeCeremonyInfo?.lokasi || 'Lapangan Utama UNPAK'}</strong>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Google Map with Ceremony Polygons & Real-time GPS Tracking */}
        <div style={{ width: '100%' }}>
          <AttendanceMap
            userCoords={currentCoords}
            isRefreshingGps={geoLoading}
            onRefreshGps={refreshGps}
            height="280px"
          />
        </div>

        {/* Bottom Action & Feedback Section */}
        {hasCheckedInCeremony ? (
          <button
              type="button"
              disabled={true}
              style={{
                width: '100%',
                padding: '15px 20px',
                borderRadius: '14px',
                border: '1.5px solid #86efac',
                background: '#dcfce7',
                color: '#15803d',
                fontWeight: 800,
                fontSize: '0.975rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                cursor: 'not-allowed',
                boxShadow: 'none',
              }}
            >
              <CheckCircle2 size={18} color="#16a34a" />
              <span>Sudah Absen Upacara Hari Ini ({todayCeremonyRecord?.created_at ? formatIndonesianTime(todayCeremonyRecord.created_at) : 'Tercatat'})</span>
            </button>
        ) : !hasCeremonyToday ? (
          /* Non-Ceremony Day (All locked state) */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Informational Locked Notice */}
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '14px',
                background: '#f8fafc',
                border: '1.5px solid #e2e8f0',
                color: '#475569',
                fontSize: '0.835rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                lineHeight: 1.5,
              }}
            >
              <Lock size={18} color="#64748b" style={{ flexShrink: 0 }} />
              <span>
                Hari ini tidak terdapat jadwal upacara bendera. Seluruh fitur presensi upacara dikunci. Presensi upacara hanya dapat dilakukan pada tanggal 17 setiap bulan (pukul 08:00 - 09:00 WIB) atau sesuai jadwal resmi di Master Upacara.
              </span>
            </div>

            {/* Locked Action Button */}
            <button
              type="button"
              disabled={true}
              style={{
                width: '100%',
                padding: '15px 20px',
                borderRadius: '14px',
                border: 'none',
                background: '#e2e8f0',
                color: '#64748b',
                fontWeight: 800,
                fontSize: '0.975rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                cursor: 'not-allowed',
                boxShadow: 'none',
              }}
            >
              <Lock size={18} />
              <span>Presensi Upacara Terkunci (Tidak Ada Jadwal Hari Ini)</span>
            </button>
          </div>
        ) : (
          /* Ceremony Day (Active workflow) */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Contextual Notice */}
            {(!ceremonyTimeStatus.isCeremonyTime || !ceremonyLocationStatus.inRange) && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: !ceremonyTimeStatus.isCeremonyTime ? '#fff1f2' : '#fffbeb',
                  border: `1px solid ${!ceremonyTimeStatus.isCeremonyTime ? '#fecdd3' : '#fde68a'}`,
                  color: !ceremonyTimeStatus.isCeremonyTime ? '#9f1239' : '#92400e',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>
                  {!ceremonyTimeStatus.isCeremonyTime
                    ? (ceremonyTimeStatus.isBefore
                        ? `Presensi upacara dibuka tepat pukul ${ceremonyTimeStatus.startTimeStr} hingga ${ceremonyTimeStatus.endTimeStr} WIB.`
                        : `Waktu pelaksanaan presensi upacara telah berakhir (${ceremonyTimeStatus.startTimeStr} - ${ceremonyTimeStatus.endTimeStr} WIB).`)
                    : 'Posisi GPS Anda berada di luar area upacara. Silakan menuju area Lapangan Utama UNPAK yang ditandai pada peta di atas.'}
                </span>
              </div>
            )}

            {/* Action Button */}
            <button
              type="button"
              onClick={handleCeremonyCheckIn}
              disabled={submittingCeremony || hasCheckedInCeremony || !ceremonyTimeStatus.isCeremonyTime || !ceremonyLocationStatus.inRange}
              style={{
                width: '100%',
                padding: '15px 20px',
                borderRadius: '14px',
                border: hasCheckedInCeremony ? '1.5px solid #86efac' : 'none',
                background: hasCheckedInCeremony
                  ? '#dcfce7'
                  : (!ceremonyTimeStatus.isCeremonyTime || !ceremonyLocationStatus.inRange)
                  ? '#cbd5e1'
                  : 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
                color: hasCheckedInCeremony
                  ? '#15803d'
                  : (!ceremonyTimeStatus.isCeremonyTime || !ceremonyLocationStatus.inRange)
                  ? '#475569'
                  : '#ffffff',
                fontWeight: 800,
                fontSize: '0.975rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                cursor: (hasCheckedInCeremony || !ceremonyTimeStatus.isCeremonyTime || !ceremonyLocationStatus.inRange) ? 'not-allowed' : 'pointer',
                boxShadow: (hasCheckedInCeremony || !ceremonyTimeStatus.isCeremonyTime || !ceremonyLocationStatus.inRange) ? 'none' : '0 6px 20px rgba(225, 29, 72, 0.35)',
                transition: 'all 0.2s ease',
              }}
            >
              {hasCheckedInCeremony ? <CheckCircle2 size={18} color="#16a34a" /> : <Flag size={18} />}
              <span>
                {hasCheckedInCeremony
                  ? `Sudah Absen Upacara Hari Ini (${todayCeremonyRecord?.created_at ? formatIndonesianTime(todayCeremonyRecord.created_at) : 'Tercatat'})`
                  : submittingCeremony
                  ? 'Memproses Absen Upacara...'
                  : !ceremonyTimeStatus.isCeremonyTime
                  ? (ceremonyTimeStatus.isBefore ? `Presensi Upacara Dibuka Pukul ${ceremonyTimeStatus.startTimeStr} WIB` : `Waktu Absen Upacara Telah Berakhir (${ceremonyTimeStatus.startTimeStr} - ${ceremonyTimeStatus.endTimeStr} WIB)`)
                  : !ceremonyLocationStatus.inRange
                  ? 'Di Luar Area Upacara (Menuju Lapangan Utama UNPAK)'
                  : 'Absen Upacara Sekarang'}
              </span>
            </button>
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

            { loading ? (
              <div
                style={{
                  padding: '20px',
                  borderRadius: '16px',
                  background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                  border: '1.5px solid #e2e8f0',
                  boxShadow: 'var(--shadow-3d-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  animation: 'fadeIn 0.25s ease',
                }}
              >
                {/* Loading Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                    <RefreshCw size={18} className="animate-spin" color="#0284c7" />
                    <span>Sedang Mengambil Data Dashboard...</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: '#f1f5f9', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Timer size={13} color="#0284c7" />
                      <span>{fetchElapsed} detik</span>
                    </span>
                    {networkInfo.ping && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: networkInfo.ping > 300 ? '#fef2f2' : '#f0fdf4',
                          color: networkInfo.ping > 300 ? '#dc2626' : '#15803d',
                        }}
                      >
                        Ping: {networkInfo.ping}ms
                      </span>
                    )}
                  </div>
                </div>

                {/* Subtitle penjelasan */}
                <p style={{ fontSize: '0.785rem', color: '#64748b', margin: 0 }}>
                  Menghubungi server HR Portal &amp; sinkronisasi data presensi, izin, cuti, sppd, serta hari libur:
                </p>

                {/* Granular Task Checklist Pills */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                  {[
                    { key: 'presensi', label: 'Presensi', desc: 'Absen masuk/keluar' },
                    { key: 'cuti', label: 'Cuti', desc: 'Status cuti tahunan/sakit' },
                    { key: 'izin', label: 'Izin', desc: 'Permohonan izin dinas' },
                    { key: 'sppd', label: 'SPPD', desc: 'Riwayat tugas luar' },
                    { key: 'holiday', label: 'Hari Libur', desc: 'Kalender libur UNPAK' },
                  ].map((item) => {
                    const step = fetchSteps[item.key] || { status: 'loading' };
                    const isSuccess = step.status === 'success';
                    const isError = step.status === 'error';

                    return (
                      <div
                        key={item.key}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '10px',
                          background: isSuccess ? '#f0fdf4' : isError ? '#fef2f2' : '#f8fafc',
                          border: `1px solid ${isSuccess ? '#bbf7d0' : isError ? '#fecaca' : '#e2e8f0'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '6px',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: isSuccess ? '#15803d' : isError ? '#b91c1c' : '#334155' }}>
                            {item.label}
                          </span>
                          <span style={{ fontSize: '0.675rem', color: isSuccess ? '#16a34a' : isError ? '#dc2626' : '#64748b' }}>
                            {isSuccess ? 'Siap ✓' : isError ? 'Gagal ✕' : 'Mengambil...'}
                          </span>
                        </div>
                        {isSuccess ? (
                          <CheckCircle2 size={15} color="#16a34a" />
                        ) : isError ? (
                          <AlertCircle size={15} color="#dc2626" />
                        ) : (
                          <RefreshCw size={13} className="animate-spin" color="#0284c7" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Roasting Alert Box (Muncul jika loading >= 3 detik atau jaringan lambat/offline) */}
                {(fetchElapsed >= 3 || networkInfo.quality === 'poor' || !networkInfo.online) && (
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: '12px',
                      background: !networkInfo.online ? '#fef2f2' : '#fffbeb',
                      border: `1px solid ${!networkInfo.online ? '#fecaca' : '#fde68a'}`,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      animation: 'fadeIn 0.25s ease',
                    }}
                  >
                    <div style={{ fontSize: '1.35rem', lineHeight: 1 }}>
                      {!networkInfo.online ? '🔌' : fetchElapsed >= 5 ? '🧪' : '🛸'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <strong style={{ fontSize: '0.785rem', color: !networkInfo.online ? '#991b1b' : '#92400e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>{!networkInfo.online ? 'Rick Sanchez to Kamu (Offline):' : 'Rick Sanchez to Kamu (Jaringan Lemot):'}</span>
                        </strong>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: !networkInfo.online ? '#b91c1c' : '#b45309', lineHeight: 1.45 }}>
                        {!networkInfo.online
                          ? (userRoastMessage || getRandomRoast('offline', 0, 0))
                          : (userRoastMessage || getRandomRoast('slow_network', networkInfo.ping, networkInfo.speedMbps))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Jika proses berlangsung lebih dari 6 detik, berikan tombol retry darurat */}
                {fetchElapsed >= 6 && (
                  <button
                    onClick={() => fetchDashboardData()}
                    className="bm-btn-outline"
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '10px',
                      justifyContent: 'center',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      background: '#ffffff',
                      color: '#0284c7',
                      border: '1px solid #bae6fd',
                    }}
                  >
                    <RefreshCw size={14} />
                    <span>Jaringan terasa macet? Klik untuk Coba Sinkron Ulang</span>
                  </button>
                )}
              </div>
            ) : (fetchSteps.presensi.status === 'error' && !todayAbsen) ? (
              /* Fallback Error Presensi jika gagal request presensi */
              (() => {
                const isUserOnline = typeof navigator !== 'undefined' ? navigator.onLine : networkInfo.online;
                const isPresensiNetworkErr = !isUserOnline || 
                  !networkInfo.online ||
                  String(fetchSteps.presensi.error || '').toLowerCase().includes('failed to fetch') ||
                  String(fetchSteps.presensi.error || '').toLowerCase().includes('network');

                return (
                  <div
                    style={{
                      padding: '18px',
                      borderRadius: '16px',
                      background: isPresensiNetworkErr ? '#fef2f2' : '#fff1f2',
                      border: `1.5px solid ${isPresensiNetworkErr ? '#fecaca' : '#fecdd3'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      textAlign: 'center',
                      boxShadow: 'var(--shadow-3d-sm)',
                      animation: 'fadeIn 0.25s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: isPresensiNetworkErr ? '#b91c1c' : '#9f1239', fontWeight: 800 }}>
                      {isPresensiNetworkErr ? <WifiOff size={20} /> : <AlertCircle size={20} />}
                      <span>{isPresensiNetworkErr ? 'Koneksi Internet Terputus (Offline)' : 'Gagal Memuat Status Presensi Hari Ini'}</span>
                    </div>

                    {/* Roasting Box: Pengguna (Trouble Jaringan) vs Developer (Trouble Server/API) */}
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: '#ffffff',
                        border: `1px solid ${isPresensiNetworkErr ? '#fecaca' : '#fecdd3'}`,
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ fontSize: '1.25rem', lineHeight: 1 }}>
                        {isPresensiNetworkErr ? '🔌' : '🧪'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <strong style={{ fontSize: '0.775rem', color: isPresensiNetworkErr ? '#991b1b' : '#9f1239' }}>
                            {isPresensiNetworkErr ? 'Rick Sanchez to Kamu (Pengguna):' : 'Rick Sanchez to Backend Developer:'}
                          </strong>
                        </div>
                        <div style={{ fontSize: '0.76rem', color: isPresensiNetworkErr ? '#991b1b' : '#881337', lineHeight: 1.45, fontStyle: 'italic' }}>
                          &quot;{
                            isPresensiNetworkErr
                              ? (userRoastMessage || getRandomRoast('offline', 0, 0))
                              : (devRoastMessage || getRandomRoast('dev_error_partial', networkInfo.ping, networkInfo.speedMbps, 'Presensi'))
                          }&quot;
                        </div>
                      </div>
                    </div>

                    <p style={{ fontSize: '0.785rem', color: isPresensiNetworkErr ? '#991b1b' : '#7f1d1d', margin: 0 }}>
                      {isPresensiNetworkErr
                        ? 'Perangkat Anda sedang tidak terhubung ke internet. Aktifkan Wi-Fi atau paket data untuk memuat data presensi.'
                        : (fetchSteps.presensi.error || 'Server backend presensi sedang tidak merespon.')}
                    </p>

                    <button
                      onClick={() => fetchDashboardData()}
                      className="bm-btn-emerald"
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '10px',
                        justifyContent: 'center',
                        fontSize: '0.9rem',
                        fontWeight: 700,
                      }}
                    >
                      <RefreshCw size={16} />
                      <span>{isPresensiNetworkErr ? 'Coba Sambungkan Kembali' : 'Coba Panggil Ulang Server'}</span>
                    </button>
                  </div>
                );
              })()
            ) : (!todayAbsen || !todayAbsen.absen_masuk) ? (
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
                ) : (todayAbsen?.absen_masuk && !todayAbsen?.absen_keluar) ? (
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
                  <div
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
                  </div>
                )}

            {/* REAL-TIME NETWORK DIAGNOSTICS & ROASTING BAR */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem', color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={15} color={locationStatus.inRange ? "#10b981" : "#f59e0b"} />
                  <span>
                    Lokasi: <strong style={{ color: locationStatus.inRange ? '#15803d' : '#b45309' }}>{locationStatus.locationName}</strong>
                    {currentCoords ? (
                      <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '4px' }}>
                        (Lat: {currentCoords.latitude.toFixed(4)}, Lon: {currentCoords.longitude.toFixed(4)})
                      </span>
                    ) : geoLoading ? (
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '4px' }}>
                        (Mendeteksi GPS...)
                      </span>
                    ) : null}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <Wifi size={15} color="#0284c7" />
                  <span>
                    IP: <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>{ipAddress}</strong>
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
                      <span style={{ marginLeft: '6px', fontSize: '0.75rem', color: '#64748b' }}>
                        (IPv4: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{ipv4Address}</span>)
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Live Latency, Speed Mbps & Network Quality Bar */}
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  background: networkInfo.quality === 'poor' ? '#fff7ed' : !networkInfo.online ? '#fef2f2' : '#f8fafc',
                  border: `1px solid ${networkInfo.quality === 'poor' ? '#fed7aa' : !networkInfo.online ? '#fecaca' : '#e2e8f0'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {/* Quality Pill */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: !networkInfo.online
                          ? '#ef4444'
                          : networkInfo.quality === 'poor'
                          ? '#f97316'
                          : networkInfo.quality === 'fair'
                          ? '#eab308'
                          : '#10b981',
                        display: 'inline-block',
                      }}
                    />
                    <strong style={{ fontSize: '0.75rem', color: '#0f172a' }}>
                      {!networkInfo.online
                        ? 'Offline (Terputus 🔌)'
                        : networkInfo.quality === 'poor'
                        ? 'Jaringan Lemot (Mode Keong 🐌)'
                        : networkInfo.quality === 'fair'
                        ? 'Jaringan Cukup'
                        : 'Koneksi Prima ⚡'}
                    </strong>
                  </div>

                  {/* Ping Metric */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#475569' }}>
                    <Activity size={13} color="#0284c7" />
                    <span>Ping: <strong style={{ fontFamily: 'monospace' }}>{networkInfo.ping !== null ? `${networkInfo.ping} ms` : '...'}</strong></span>
                  </div>

                  {/* Speed Metric */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#475569' }}>
                    <Gauge size={13} color="#10b981" />
                    <span>Speed: <strong style={{ fontFamily: 'monospace' }}>{networkInfo.speedMbps !== null ? `${networkInfo.speedMbps} Mbps` : '...'}</strong></span>
                  </div>
                </div>

                {/* Real-time Device Sync Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.725rem', color: '#64748b' }}>
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: !networkInfo.online ? '#ef4444' : '#10b981',
                      boxShadow: !networkInfo.online ? '0 0 6px #ef4444' : '0 0 6px #10b981',
                      display: 'inline-block',
                    }}
                  />
                  <span>Real-time Device {networkInfo.effectiveType ? `(${networkInfo.effectiveType.toUpperCase()})` : ''}</span>
                </div>
              </div>

              {/* Roasting Pill di Bawah Bar jika Jaringan Sedang Kurang Bagus / Gagal API */}
              {/* Rick & Morty Multiverse Sarcasm Bar (Hanya tampil jika kartu error presensi di atas tidak sedang aktif, menghindari duplikasi) */}
              {!(fetchSteps.presensi.status === 'error' && !todayAbsen) && (networkInfo.quality === 'poor' || !networkInfo.online || (networkInfo.online && failedModules.length > 0)) && (
                (() => {
                  const isUserOnline = typeof navigator !== 'undefined' ? navigator.onLine : networkInfo.online;
                  const isOffline = !isUserOnline || !networkInfo.online;
                  const isDevError = isUserOnline && failedModules.length > 0;

                  const roastTitle = isOffline 
                    ? 'Rick Sanchez to Kamu (Offline):' 
                    : isDevError 
                    ? 'Rick Sanchez to Developer:' 
                    : 'Rick Sanchez to Kamu (Jaringan Lemot):';

                  const displayedRoast = isOffline
                    ? (userRoastMessage || getRandomRoast('offline', 0, 0))
                    : isDevError
                    ? (devRoastMessage || (failedModules.length === 5 ? getRandomRoast('dev_error_all', networkInfo.ping, networkInfo.speedMbps) : getRandomRoast('dev_error_partial', networkInfo.ping, networkInfo.speedMbps, failedModules.join(', '))))
                    : (userRoastMessage || getRandomRoast('slow_network', networkInfo.ping, networkInfo.speedMbps));

                  return (
                    <div
                      style={{
                        fontSize: '0.74rem',
                        fontStyle: 'italic',
                        color: isOffline ? '#991b1b' : isDevError ? '#9f1239' : '#c2410c',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        background: isOffline ? '#fef2f2' : isDevError ? '#fff1f2' : '#fff7ed',
                        border: `1px solid ${isOffline ? '#fecaca' : isDevError ? '#fecdd3' : '#fed7aa'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                      }}
                    >
                      <span>
                        {isOffline ? '🔌' : isDevError ? '🧪' : '🐌'}{' '}
                        <strong>{roastTitle}</strong> &quot;{displayedRoast}&quot;
                      </span>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      </div>

      {/* QUICK SERVICES - SPLIT VIEW WITH MODERN ILLUSTRATION & VERTICALLY SCROLLABLE MENU */}
      <div
        className="bm-card"
        style={{
          borderRadius: '24px',
          background: '#ffffff',
          boxShadow: 'var(--shadow-3d)',
        }}
      >
        <div className="quick-services-layout">
          {/* SISI KIRI: FULL COVER IMAGE (TANPA CARD, TANPA TEKS, OTOMATIS HILANG DI MOBILE) */}
          <div className="quick-services-hero">
            <img
              src="/illustrations/ilustrasi.webp"
              alt="HR Portal Mission"
              className="quick-services-img"
            />
          </div>

          {/* SISI KANAN: DAFTAR MENU SCROLL VERTICAL MODERN (4 LAYANAN SESUAI GAMBAR 2) */}
          <div className="quick-services-menu">
            {/* Header Daftar Menu */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: '14px',
                borderBottom: '1px solid #e2e8f0',
                marginBottom: '4px',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                  Layanan Cepat HR Portal
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', display: 'block' }}>
                  Akses instan formulir administrasi kepegawaian
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  padding: '5px 12px',
                  borderRadius: '9999px',
                  background: '#eff6ff',
                  color: '#2563eb',
                  border: '1px solid #bfdbfe',
                }}
              >
                4 Layanan Utama
              </span>
            </div>

            {/* Scrollable Container with Custom Styled Scrollbar */}
            <div
              className="custom-v-scroll"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                maxHeight: '280px',
                overflowY: 'auto',
                paddingRight: '6px',
                paddingTop: '2px',
                paddingBottom: '2px',
              }}
            >
              {quickServiceList.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => onNavigate(item.tabKey)}
                  className="quick-service-item"
                  style={{
                    padding: '12px 16px',
                    borderRadius: '14px',
                    background: '#f8fafc',
                    border: '1.5px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'translateX(4px)';
                    e.currentTarget.style.borderColor = item.accentColor || '#6366f1';
                    e.currentTarget.style.boxShadow = '0 6px 16px -4px rgba(15, 23, 42, 0.08)';
                    e.currentTarget.style.background = '#ffffff';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'translateX(0)';
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.02)';
                    e.currentTarget.style.background = '#f8fafc';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                    <div
                      className="icon-bubble-3d"
                      style={{
                        background: item.gradient,
                        color: '#ffffff',
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.12)',
                        flexShrink: 0,
                      }}
                    >
                      {item.icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.925rem', color: '#0f172a' }}>
                        {item.title}
                      </div>
                      <div
                        style={{
                          fontSize: '0.785rem',
                          color: '#64748b',
                          marginTop: '2px',
                        }}
                      >
                        {item.description}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '10px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#64748b',
                      flexShrink: 0,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <ChevronRight size={16} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* RIWAYAT PRESENSI TABLE (STRICTLY CATATAN TELAT FROM catatan_telat & CATATAN PULANG FROM catatan_pulang) */}
      <div className="bm-card" style={{ padding: '28px', borderRadius: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              Riwayat Presensi ({periodType === 'cutoff' ? 'Cutoff 16-15' : 'Bulan 01-31'})
            </h2>
            <p style={{ fontSize: '0.825rem', color: '#64748b', marginTop: '2px' }}>
              Catatan kehadiran, jam masuk/keluar, alasan keterlambatan (Catatan Telat), dan alasan pulang cepat (Catatan Pulang).
            </p>
          </div>

          {/* Month, Year & Search Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <button
                type="button"
                onClick={() => handlePeriodChange('calendar')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '0.775rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: periodType === 'calendar' ? '#ffffff' : 'transparent',
                  color: periodType === 'calendar' ? '#0f172a' : '#64748b',
                  boxShadow: periodType === 'calendar' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                01-31
              </button>
              <button
                type="button"
                onClick={() => handlePeriodChange('cutoff')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '0.775rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: periodType === 'cutoff' ? '#ffffff' : 'transparent',
                  color: periodType === 'cutoff' ? '#0f172a' : '#64748b',
                  boxShadow: periodType === 'cutoff' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                16-15
              </button>
            </div>

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
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <RefreshCw size={24} className="animate-spin" color="#0284c7" />
                      <span style={{ fontWeight: 700, color: '#334155', fontSize: '0.9rem' }}>
                        Sedang sinkronisasi data presensi, cuti, izin, sppd &amp; hari libur...
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        Waktu tunggu: {fetchElapsed}s {networkInfo.ping ? `• Latensi: ${networkInfo.ping}ms` : ''} {networkInfo.speedMbps ? `• Kecepatan: ${networkInfo.speedMbps} Mbps` : ''}
                      </span>
                      {fetchElapsed >= 4 && (
                        <span style={{ fontSize: '0.78rem', color: '#d97706', maxWidth: '480px', fontStyle: 'italic', marginTop: '2px' }}>
                          💬 {roastMessage}
                        </span>
                      )}
                    </div>
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
                  const rawDate = item.tanggal || (item.absen_masuk && item.absen_masuk !== '-' ? getLocalDateStr(item.absen_masuk) : '');
                  
                  // STRICT SPEC: Read strictly from item.catatan_telat / item.alasan_telat and item.catatan_pulang / item.alasan_pulang
                  const txtCatatanTelat = item.catatan_telat || item.alasan_telat || '-';
                  const txtCatatanPulang = item.catatan_pulang || item.alasan_pulang || '-';

                  return (
                    <tr key={item.tanggal || idx} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }}>
                      <td style={{ padding: '16px 18px', fontWeight: 700, color: '#0f172a' }}>
                        {formatIndonesianDate(rawDate)}
                      </td>
                      <td style={{ padding: '16px 18px', color: item.absen_masuk && item.absen_masuk !== '-' ? '#0284c7' : '#64748b', fontWeight: item.absen_masuk && item.absen_masuk !== '-' ? 700 : 400 }}>
                        {item.absen_masuk && item.absen_masuk !== '-' ? formatIndonesianTime(item.absen_masuk) : '-'}
                      </td>
                      <td style={{ padding: '16px 18px', color: item.absen_keluar && item.absen_keluar !== '-' ? '#7c3aed' : '#64748b', fontWeight: item.absen_keluar && item.absen_keluar !== '-' ? 700 : 400 }}>
                        {item.absen_keluar && item.absen_keluar !== '-' ? formatIndonesianTime(item.absen_keluar) : '-'}
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

      {/* RIWAYAT PRESENSI UPACARA BENDERA TABLE */}
      <div className="bm-card" style={{ padding: '28px', borderRadius: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #ffe4e6 0%, #fecdd3 100%)',
                color: '#e11d48',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(225, 29, 72, 0.15)',
                flexShrink: 0,
              }}
            >
              <Flag size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Riwayat Presensi Upacara
                </h2>
                <span
                  style={{
                    fontSize: '0.725rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    background: '#ffe4e6',
                    color: '#be123c',
                    border: '1px solid #fecdd3',
                  }}
                >
                  {filteredCeremonyHistory.length} Rekaman
                </span>
              </div>
              <p style={{ fontSize: '0.825rem', color: '#64748b', marginTop: '2px', margin: 0 }}>
                Rekaman partisipasi upacara bendera rutin tanggal 17 dan agenda upacara resmi Universitas Pakuan.
              </p>
            </div>
          </div>

          {/* Search Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '240px' }}>
              <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                className="bm-input"
                placeholder="Cari tanggal / upacara..."
                value={ceremonySearchQuery}
                onChange={(e) => setCeremonySearchQuery(e.target.value)}
                style={{ paddingLeft: '36px', height: '38px', fontSize: '0.85rem' }}
              />
            </div>
          </div>
        </div>

        {/* Ceremony Attendance Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                <th style={{ padding: '14px 18px', width: '50px' }}>No</th>
                <th style={{ padding: '14px 18px' }}>Tanggal Upacara</th>
                <th style={{ padding: '14px 18px' }}>Waktu Presensi</th>
                <th style={{ padding: '14px 18px' }}>Nama Upacara</th>
                <th style={{ padding: '14px 18px' }}>Lokasi / Sektor</th>
                <th style={{ padding: '14px 18px' }}>Unit / Fakultas</th>
                <th style={{ padding: '14px 18px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <RefreshCw size={24} className="animate-spin" color="#e11d48" />
                      <span style={{ fontWeight: 700, color: '#334155', fontSize: '0.9rem' }}>
                        Memuat riwayat presensi upacara...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filteredCeremonyHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <Flag size={28} color="#cbd5e1" />
                      <span style={{ fontWeight: 600, color: '#475569', fontSize: '0.9rem' }}>
                        Belum ada riwayat presensi upacara tercatat.
                      </span>
                      <span style={{ fontSize: '0.775rem', color: '#94a3b8' }}>
                        Presensi upacara yang Anda lakukan pada agenda upacara bendera akan tersimpan otomatis di sini.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCeremonyHistory.map((item, idx) => {
                  const rawDate = String(item.tanggal || (item.created_at ? getLocalDateStr(item.created_at) : '')).slice(0, 10);
                  const masterCeremony = masterCeremoniesList.find((m) => {
                    const mTgl = m.tanggal ? m.tanggal.substring(0, 10) : '';
                    return mTgl === rawDate;
                  });
                  const is17 = rawDate ? new Date(rawDate).getDate() === 17 : false;
                  const ceremonyName = masterCeremony?.nama || (rawDate === todayCeremonyData?.ceremony?.tanggal ? todayCeremonyData?.ceremony?.nama : (is17 ? 'Upacara Bendera Rutin Tanggal 17' : 'Upacara Bendera UNPAK'));
                  const ceremonyLocation = masterCeremony?.lokasi || (rawDate === todayCeremonyData?.ceremony?.tanggal ? todayCeremonyData?.ceremony?.lokasi : 'Lapangan Utama UNPAK');

                  return (
                    <tr key={item.id || idx} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }}>
                      <td style={{ padding: '16px 18px', color: '#64748b', fontWeight: 600 }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '16px 18px', fontWeight: 700, color: '#0f172a' }}>
                        {formatIndonesianDate(rawDate)}
                      </td>
                      <td style={{ padding: '16px 18px', color: '#0284c7', fontWeight: 700 }}>
                        {item.created_at ? formatIndonesianTime(item.created_at) : '-'}
                      </td>
                      <td style={{ padding: '16px 18px', fontWeight: 700, color: '#be123c' }}>
                        {ceremonyName}
                      </td>
                      <td style={{ padding: '16px 18px', color: '#475569' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <MapPin size={13} color="#e11d48" />
                          {ceremonyLocation}
                        </span>
                      </td>
                      <td style={{ padding: '16px 18px', color: '#64748b' }}>
                        {item.unit || item.fakultas || item.prodi || '-'}
                      </td>
                      <td style={{ padding: '16px 18px' }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: '#dcfce7',
                            color: '#15803d',
                            border: '1px solid #86efac',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <CheckCircle2 size={13} color="#16a34a" />
                          Hadir Upacara
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
                className="bm-input"
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
                className="bm-input"
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
              className="bm-btn-outline" 
              style={{ padding: '9px 18px' }}
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
                handleCheckIn({ lateReason: lateReason.trim(), outsideReason: outsideReason.trim() });
              }}
              disabled={submitting}
              className="bm-btn-emerald"
              style={{ padding: '9px 20px' }}
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
              className="bm-input"
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
                className="bm-input"
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
              className="bm-btn-outline" 
              style={{ padding: '9px 18px' }}
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
                handleCheckOut({
                  earlyExitReason: earlyExitReason.trim(),
                  outsideResult: outsideResult.trim(),
                });
              }}
              disabled={submitting}
              className="bm-btn-emerald"
              style={{ padding: '9px 20px' }}
            >
              {submitting ? 'Menyimpan...' : 'Simpan & Absen Keluar'}
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
