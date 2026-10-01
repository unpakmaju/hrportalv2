import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Search, 
  Download, 
  Calendar, 
  RefreshCw, 
  Award, 
  Filter,
  Building,
  GraduationCap,
  Users,
  CheckCircle2,
  CalendarDays,
  Clock,
  Printer,
  FileText
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useToast } from '../components/Toast';
import { Pagination } from '../components/Pagination';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { SearchableSelect } from '../components/SearchableSelect';
import { formatIndonesianDate, getLocalDateStr } from '../utils/dateFormatter';

const BULAN_LIST = [
  { value: 1, name: 'Januari', short: 'Jan' },
  { value: 2, name: 'Februari', short: 'Feb' },
  { value: 3, name: 'Maret', short: 'Mar' },
  { value: 4, name: 'April', short: 'Apr' },
  { value: 5, name: 'Mei', short: 'Mei' },
  { value: 6, name: 'Juni', short: 'Jun' },
  { value: 7, name: 'Juli', short: 'Jul' },
  { value: 8, name: 'Agustus', short: 'Agu' },
  { value: 9, name: 'September', short: 'Sep' },
  { value: 10, name: 'Oktober', short: 'Okt' },
  { value: 11, name: 'November', short: 'Nov' },
  { value: 12, name: 'Desember', short: 'Des' },
];

const currentYearNum = new Date().getFullYear();
const TAHUN_LIST = Array.from({ length: Math.max(1, currentYearNum - 2000 + 1) }, (_, i) => 2000 + i);

const formatJamMasuk = (str) => {
  if (!str) return '';
  if (str.includes(' ')) {
    const timePart = str.split(' ')[1];
    return timePart.substring(0, 5);
  }
  if (str.includes('T')) {
    const timePart = str.split('T')[1];
    if (timePart.startsWith('00:00')) return '07:00';
    return timePart.substring(0, 5);
  }
  if (str.length >= 5) {
    return str.substring(0, 5);
  }
  return str;
};

const formatJamAbsen = (masukStr, keluarStr) => {
  const masuk = formatJamMasuk(masukStr);
  const keluar = formatJamMasuk(keluarStr);

  if (masuk && keluar) {
    return `${masuk} - ${keluar}`;
  }
  if (masuk) {
    return `${masuk} - -`;
  }
  if (keluar) {
    return `- - ${keluar}`;
  }
  return 'Hadir';
};

export const ReportPage = ({ globalPeriodType = 'cutoff', onPeriodTypeChange }) => {
  const { showToast } = useToast();

  // Top Main Tab: 'presensi' (Reguler Bulanan) vs 'upacara' (Presensi Upacara Tahunan)
  const [mainReportTab, setMainReportTab] = useState('presensi');

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [periodType, setPeriodType] = useState(globalPeriodType);

  useEffect(() => {
    setPeriodType(globalPeriodType);
  }, [globalPeriodType]);

  // Master Filters State (Default null for SearchableSelect)
  const [selectedFakultas, setSelectedFakultas] = useState(null);
  const [selectedProdi, setSelectedProdi] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Master Data Lists
  const [fakultasList, setFakultasList] = useState([]);
  const [prodiList, setProdiList] = useState([]);
  const [unitList, setUnitList] = useState([]);

  // Data States
  const [loading, setLoading] = useState(true);
  const [rawEmployees, setRawEmployees] = useState([]);
  const [holidays, setHolidays] = useState(new Set());
  const [ceremonyList, setCeremonyList] = useState([]);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Modal Cell State
  const [selectedCell, setSelectedCell] = useState(null);
  const [isCellModalOpen, setIsCellModalOpen] = useState(false);

  // Exporting state
  const [isExporting, setIsExporting] = useState(false);

  // Fetch Master Data Fakultas, Prodi & Unit Kerja (from ModuleMasterData Go Backend endpoints: /api/masterdata & /api/v2/masterdata)
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        let fakData = [];
        try {
          const resFak = await apiClient.get('/api/v2/masterdata/fakultas');
          fakData = Array.isArray(resFak) ? resFak : (resFak?.data || resFak?.list_data || []);
        } catch (e) {
          const v1Fak = await apiClient.get('/api/masterdata/fakultas').catch(() => []);
          fakData = Array.isArray(v1Fak) ? v1Fak : (v1Fak?.data || v1Fak?.list_data || []);
        }

        let prodData = [];
        try {
          const resProd = await apiClient.get('/api/v2/masterdata/prodi');
          prodData = Array.isArray(resProd) ? resProd : (resProd?.data || resProd?.list_data || []);
        } catch (e) {
          const v1Prod = await apiClient.get('/api/masterdata/prodi').catch(() => []);
          prodData = Array.isArray(v1Prod) ? v1Prod : (v1Prod?.data || v1Prod?.list_data || []);
        }

        let uData = [];
        try {
          const resUnit = await apiClient.get('/api/v2/masterdata/unit');
          uData = Array.isArray(resUnit) ? resUnit : (resUnit?.data || resUnit?.list_data || []);
        } catch (e) {
          const v1Unit = await apiClient.get('/api/masterdata/unit').catch(() => []);
          uData = Array.isArray(v1Unit) ? v1Unit : (v1Unit?.data || v1Unit?.list_data || []);
        }

        setFakultasList(
          fakData
            .map((f) => (typeof f === 'string' ? { nama: f, name: f } : f))
            .filter((f) => f && (f.nama || f.nama_fakultas || f.fakultas || f.kode))
        );
        setProdiList(
          prodData
            .map((p) => (typeof p === 'string' ? { nama: p, name: p } : p))
            .filter((p) => p && (p.nama || p.nama_prodi || p.prodi || p.kode))
        );
        setUnitList(
          uData
            .map((u) => (typeof u === 'string' ? { nama: u, nama_unit: u } : u))
            .filter((u) => u && (u.nama || u.nama_unit || u.unit || u.kode_unit))
        );
      } catch (err) {
        console.warn('Masterdata fetch error:', err);
      }
    };
    fetchMasterData();
  }, []);

  const getPeriodDates = () => {
    if (mainReportTab === 'upacara') {
      return {
        startStr: `${selectedYear}-01-01`,
        endStr: `${selectedYear}-12-31`,
        daysInPeriod: 365,
      };
    }

    if (periodType === 'calendar') {
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      const pad = (n) => String(n).padStart(2, '0');
      return {
        startStr: `${selectedYear}-${pad(selectedMonth)}-01`,
        endStr: `${selectedYear}-${pad(selectedMonth)}-${pad(lastDay)}`,
        daysInPeriod: lastDay,
      };
    } else {
      const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
      const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
      const pad = (n) => String(n).padStart(2, '0');
      return {
        startStr: `${prevYear}-${pad(prevMonth)}-16`,
        endStr: `${selectedYear}-${pad(selectedMonth)}-15`,
        daysInPeriod: 31,
      };
    }
  };

  const getDatesList = () => {
    const { startStr, endStr } = getPeriodDates();
    const dates = [];
    const curr = new Date(startStr);
    const end = new Date(endStr);
    while (curr <= end) {
      dates.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  };

  const fetchAllData = async () => {
    setLoading(true);
    const { startStr, endStr } = getPeriodDates();
    try {
      const [reportRes, holidayRes, ceremonyRes] = await Promise.allSettled([
        apiClient.get('/api/v2/laporan/all', { tanggal_mulai: startStr, tanggal_akhir: endStr }),
        apiClient.get('/api/v2/holiday', { year: selectedYear }),
        apiClient.get('/api/v2/ceremony-attendance'),
      ]);

      let empList = [];
      if (reportRes.status === 'fulfilled' && reportRes.value) {
        const val = reportRes.value;
        if (val.list_data && Array.isArray(val.list_data)) empList = val.list_data;
        else if (val.pegawai && Array.isArray(val.pegawai)) empList = val.pegawai;
        else if (Array.isArray(val)) empList = val;
        else if (val.data && Array.isArray(val.data)) empList = val.data;
      }

      const holidaySet = new Set();
      if (holidayRes.status === 'fulfilled' && holidayRes.value) {
        const hList = Array.isArray(holidayRes.value) ? holidayRes.value : (holidayRes.value?.data || []);
        hList.forEach((h) => {
          if (h.tanggal) holidaySet.add(getLocalDateStr(h.tanggal));
        });
      }

      let cList = [];
      if (ceremonyRes.status === 'fulfilled' && ceremonyRes.value) {
        const val = ceremonyRes.value;
        if (Array.isArray(val)) cList = val;
        else if (val.data && Array.isArray(val.data)) cList = val.data;
      }

      setHolidays(holidaySet);
      setRawEmployees(empList);
      setCeremonyList(cList);
    } catch (err) {
      showToast(err.message || 'Gagal memuat rekap data laporan', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    setCurrentPage(1);
  }, [mainReportTab, selectedMonth, selectedYear, periodType]);

  // Format options for SearchableSelect
  const fakultasOptions = useMemo(() => {
    const list = [...fakultasList];
    const existingNames = new Set(
      list.map((f) => String(f.nama || f.nama_fakultas || f.fakultas || f.kode || '').toLowerCase().trim())
    );

    // Extract fakultas from rawEmployees as fallback/enrichment
    rawEmployees.forEach((item) => {
      const p = item.pengguna || {};
      const fak = p.fakultas;
      if (fak && fak.trim() && fak.trim() !== '-') {
        const lower = fak.trim().toLowerCase();
        if (!existingNames.has(lower)) {
          existingNames.add(lower);
          list.push({ nama: fak.trim(), nama_fakultas: fak.trim(), fakultas: fak.trim() });
        }
      }
    });

    return list
      .filter((f) => f && (f.nama || f.nama_fakultas || f.fakultas || f.kode))
      .map((f, i) => {
        const name = f.nama || f.nama_fakultas || f.fakultas || f.kode || `Fakultas ${i + 1}`;
        const sub = f.kode || f.kode_fakultas || f.id ? `Kode: ${f.kode || f.kode_fakultas || f.id}` : 'Fakultas UNPAK';
        return { value: name, label: name, subtitle: sub };
      });
  }, [fakultasList, rawEmployees]);

  const prodiOptions = useMemo(() => {
    // Map of prodi from masterdata for quick lookup of jenjang and nama_fakultas
    const masterProdiMap = new Map();
    prodiList.forEach((p) => {
      const pName = String(p.nama_prodi || p.prodi || p.nama || '').trim().toLowerCase();
      const pFak = String(p.nama_fakultas || p.fakultas || p.kode_fakultas || '').trim().toLowerCase();
      if (pName) {
        masterProdiMap.set(`${pName}:::${pFak}`, p);
        if (!masterProdiMap.has(pName)) {
          masterProdiMap.set(pName, p);
        }
      }
    });

    const list = [...prodiList];
    const existingKeys = new Set(
      list.map((p) => {
        const n = String(p.nama_prodi || p.prodi || p.nama || '')
          .replace(/^(S1|S2|S3|D3|D4|Profesi)\s*[-:]?\s*/i, '')
          .trim()
          .toLowerCase();
        const f = String(p.nama_fakultas || p.fakultas || p.kode_fakultas || '').trim().toLowerCase();
        return `${n}:::${f}`;
      })
    );

    // Also extract prodi from rawEmployees to ensure all prodis present in current data are available
    rawEmployees.forEach((item) => {
      const p = item.pengguna || {};
      const prd = p.prodi;
      const fak = p.fakultas;
      if (prd && prd.trim() && prd.trim() !== '-' && !prd.toLowerCase().includes('isi nama ps')) {
        const cleanPrd = prd.replace(/^(S1|S2|S3|D3|D4|Profesi)\s*[-:]?\s*/i, '').trim();
        const fakTrim = (fak || '').trim();
        const key = `${cleanPrd.toLowerCase()}:::${fakTrim.toLowerCase()}`;
        if (!existingKeys.has(key)) {
          existingKeys.add(key);

          // Find if master data has jenjang for this prodi
          const matchedMaster = masterProdiMap.get(key) || masterProdiMap.get(cleanPrd.toLowerCase());
          const jenjang = matchedMaster?.jenjang || p.jenjang || '';
          const namaFak = matchedMaster?.nama_fakultas || fakTrim;

          list.push({
            nama: cleanPrd,
            nama_prodi: cleanPrd,
            prodi: cleanPrd,
            fakultas: namaFak,
            nama_fakultas: namaFak,
            jenjang: jenjang,
            kode_jenjang: matchedMaster?.kode_jenjang,
          });
        }
      }
    });

    let filtered = list.filter((p) => {
      const name = String(p.nama_prodi || p.prodi || p.nama || '').toLowerCase().trim();
      return name && !name.includes('isi nama ps');
    });

    // If a Fakultas is selected, filter prodi to that Fakultas
    if (selectedFakultas) {
      const sf = selectedFakultas.toLowerCase().trim();
      const matched = filtered.filter((p) => {
        const fak = String(p.nama_fakultas || p.fakultas || p.kode_fakultas || '').toLowerCase().trim();
        if (fak && (fak.includes(sf) || sf.includes(fak))) return true;
        // Check if any employee in this fakultas has this prodi
        const prdName = String(p.nama_prodi || p.prodi || p.nama || '').toLowerCase().trim();
        return rawEmployees.some((item) => {
          const emp = item.pengguna || {};
          const empFak = String(emp.fakultas || '').toLowerCase();
          const empPrd = String(emp.prodi || '').toLowerCase();
          return empFak.includes(sf) && empPrd.includes(prdName);
        });
      });
      if (matched.length > 0) {
        filtered = matched;
      }
    }

    const options = [];
    const seenValues = new Set();
    const seenLabels = new Set();

    filtered.forEach((p, i) => {
      const baseName = (p.nama_prodi || p.prodi || p.nama || `Prodi ${i + 1}`).trim();
      const cleanName = baseName.replace(/^(S1|S2|S3|D3|D4|Profesi)\s*[-:]?\s*/i, '').trim();

      // Resolve jenjang dynamically
      let jenjang = p.jenjang || '';
      if (!jenjang) {
        const m = (p.nama || baseName).match(/^(S1|S2|S3|D3|D4|Profesi)\b/i);
        if (m) jenjang = m[1].toUpperCase();
      }

      const fakName = (p.nama_fakultas || p.fakultas || '').trim() || 'Fakultas UNPAK';
      const displayName = jenjang ? `${jenjang} - ${cleanName}` : cleanName;
      const optVal = `${cleanName}:::${fakName}`;

      if (seenValues.has(optVal) || seenLabels.has(displayName)) {
        return;
      }
      seenValues.add(optVal);
      seenLabels.add(displayName);

      options.push({
        value: optVal,
        label: displayName,
        subtitle: fakName,
        prodi: cleanName,
        jenjang: jenjang,
        fakultas: fakName,
        kode: p.kode_prodi || p.kode,
      });
    });

    return options;
  }, [prodiList, rawEmployees, selectedFakultas]);

  const unitOptions = useMemo(() => {
    const list = [...unitList];
    const existingNames = new Set(
      list.map((u) => String(u.nama_unit || u.nama || u.unit || u.kode_unit || '').toLowerCase().trim())
    );

    // Extract unit from rawEmployees
    rawEmployees.forEach((item) => {
      const p = item.pengguna || {};
      const u = p.unit || p.unit_kerja;
      if (u && u.trim() && u.trim() !== '-') {
        const lower = u.trim().toLowerCase();
        if (!existingNames.has(lower)) {
          existingNames.add(lower);
          list.push({ nama_unit: u.trim(), nama: u.trim(), unit: u.trim(), fakultas: p.fakultas });
        }
      }
    });

    let filtered = list.filter((u) => u && (u.nama_unit || u.nama || u.unit || u.kode_unit));

    // If a Fakultas is selected, filter units matching that Fakultas
    if (selectedFakultas) {
      const sf = selectedFakultas.toLowerCase().trim();
      const matched = filtered.filter((u) => {
        const name = String(u.nama_unit || u.nama || u.unit || '').toLowerCase().trim();
        const fak = String(u.fakultas || '').toLowerCase().trim();
        if (name.includes(sf) || sf.includes(name) || (fak && (fak.includes(sf) || sf.includes(fak)))) return true;
        // Check if employees in this unit belong to the selected fakultas
        return rawEmployees.some((item) => {
          const emp = item.pengguna || {};
          const empFak = String(emp.fakultas || '').toLowerCase();
          const empUnit = String(emp.unit || emp.unit_kerja || '').toLowerCase();
          return empFak.includes(sf) && empUnit.includes(name);
        });
      });
      if (matched.length > 0) {
        filtered = matched;
      }
    }

    return filtered.map((u, i) => {
      const name = u.nama_unit || u.nama || u.unit || u.kode_unit || `Unit ${i + 1}`;
      return { value: name, label: name, subtitle: u.kode_unit ? `Kode Unit: ${u.kode_unit}` : 'Unit Kerja' };
    });
  }, [unitList, rawEmployees, selectedFakultas]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return rawEmployees.filter((item) => {
      const p = item.pengguna || {};
      const nip = (p.nip || item.kode || '').toLowerCase();
      const nama = (p.nama || '').toLowerCase();
      const unit = (p.unit_kerja || p.unit || '').toLowerCase();
      const fakultas = (p.fakultas || '').toLowerCase();
      const prodi = (p.prodi || '').toLowerCase();

      if (q && !nama.includes(q) && !nip.includes(q) && !unit.includes(q) && !fakultas.includes(q) && !prodi.includes(q)) {
        return false;
      }
      if (selectedFakultas && !fakultas.includes(selectedFakultas.toLowerCase())) {
        return false;
      }
      if (selectedProdi) {
        if (selectedProdi.includes(':::')) {
          const [selPrd, selFak] = selectedProdi.split(':::');
          const lowerPrd = selPrd.toLowerCase().trim();
          const lowerFak = selFak.toLowerCase().trim();
          if (!prodi.includes(lowerPrd) && !lowerPrd.includes(prodi)) {
            return false;
          }
          if (lowerFak) {
            const empFak = fakultas || unit;
            if (empFak && !lowerFak.includes(empFak) && !empFak.includes(lowerFak)) {
              const cleanA = lowerFak.replace(/fakultas|sekolah|dan|&/gi, ' ').trim().replace(/\s+/g, ' ');
              const cleanB = empFak.replace(/fakultas|sekolah|dan|&/gi, ' ').trim().replace(/\s+/g, ' ');
              if (cleanA && cleanB && !cleanA.includes(cleanB) && !cleanB.includes(cleanA)) {
                return false;
              }
            }
          }
        } else {
          const lower = selectedProdi.toLowerCase().trim();
          if (!prodi.includes(lower) && !lower.includes(prodi)) {
            return false;
          }
        }
      }
      if (selectedUnit && !unit.includes(selectedUnit.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [rawEmployees, searchQuery, selectedFakultas, selectedProdi, selectedUnit]);

  const handleExportCSV = () => {
    try {
      setIsExporting(true);
      const dates = getDatesList();
      const monthName = BULAN_LIST.find((b) => b.value === selectedMonth)?.name || selectedMonth;
      const periodLabel = periodType === 'calendar' ? 'Bulan_Penuh' : 'Cutoff_Payroll';

      const dateHeaders = dates.map((d) => `${d.getDate()}/${d.getMonth() + 1}`);
      const headers = ['No', 'NIP', 'Nama Pegawai', 'Unit Kerja', 'Fakultas', 'Prodi', 'Total Hadir', ...dateHeaders];

      const rows = filteredEmployees.map((item, idx) => {
        const p = item.pengguna || {};
        const nip = p.nip || item.kode || '';
        const nama = p.nama || `Pegawai ${nip}`;
        const unit = p.unit_kerja || p.unit || '';
        const fak = p.fakultas || '';
        const prd = p.prodi || '';
        const records = item.records || [];

        const totalHadir = records.filter((r) => r.type === 'absen' && (r.info?.masuk || r.info?.keluar)).length;

        const dayValues = dates.map((d) => {
          const dKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const isSunday = d.getDay() === 0;
          const isHoliday = holidays.has(dKey);

          const rec = records.find((r) => r.tanggal === dKey);
          if (rec) {
            if (rec.type === 'absen') return `"${formatJamAbsen(rec.info?.masuk, rec.info?.keluar)}"`;
            if (rec.type === 'izin') return '"Izin"';
            if (rec.type === 'cuti') return '"Cuti"';
            if (rec.type === 'sppd') return '"SPPD"';
          }
          if (isSunday || isHoliday) return '"Libur"';
          return '"-"';
        });

        return [idx + 1, `"${nip}"`, `"${nama.replace(/"/g, '""')}"`, `"${unit.replace(/"/g, '""')}"`, `"${fak.replace(/"/g, '""')}"`, `"${prd.replace(/"/g, '""')}"`, totalHadir, ...dayValues].join(',');
      });

      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Laporan_Presensi_${monthName}_${selectedYear}_${periodLabel}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`File Excel Laporan Presensi ${monthName} ${selectedYear} berhasil diunduh!`, 'success');
    } catch (e) {
      showToast('Gagal mengunduh file laporan presensi', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const totalItems = filteredEmployees.length;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedEmployees = filteredEmployees.slice(startIndex, startIndex + itemsPerPage);
  const datesList = getDatesList();

  const getRecordForDate = (records, dateStr) => {
    if (!records || !Array.isArray(records)) return null;
    return records.find((r) => r.tanggal === dateStr);
  };

  const handleCellClick = (emp, dateStr, record, isUpacara = false) => {
    setSelectedCell({ emp, dateStr, record, isUpacara });
    setIsCellModalOpen(true);
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 3D Header Banner */}
      <div
        className="bm-card"
        style={{
          padding: '24px 28px',
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <span style={{ padding: '4px 10px', borderRadius: '4px', background: '#dcfce7', color: '#15803d', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', display: 'inline-block' }}>
            Rekapitulasi Kehadiran
          </span>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111827' }}>
            Laporan Presensi Pegawai
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '2px' }}>
            Matriks Rekapitulasi Presensi Reguler ({periodType === 'cutoff' ? 'Cutoff 16-15' : 'Bulan 01-31'}) &amp; Presensi Upacara Tahunan UNPAK.
          </p>
        </div>

        {/* Top Report Tab Switcher */}
        <div style={{ display: 'flex', gap: '4px', background: '#f7f8f6', padding: '4px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <button
            onClick={() => { setMainReportTab('presensi'); setCurrentPage(1); }}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: mainReportTab === 'presensi' ? '#ffffff' : 'transparent',
              color: mainReportTab === 'presensi' ? '#111827' : '#6b7280',
              fontWeight: mainReportTab === 'presensi' ? 700 : 500,
              fontSize: '0.825rem',
              cursor: 'pointer',
              boxShadow: mainReportTab === 'presensi' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <FileSpreadsheet size={16} color="#10b981" />
            <span>Presensi Reguler</span>
          </button>

          <button
            onClick={() => { setMainReportTab('upacara'); setCurrentPage(1); }}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: mainReportTab === 'upacara' ? '#ffffff' : 'transparent',
              color: mainReportTab === 'upacara' ? '#111827' : '#6b7280',
              fontWeight: mainReportTab === 'upacara' ? 700 : 500,
              fontSize: '0.825rem',
              cursor: 'pointer',
              boxShadow: mainReportTab === 'upacara' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Award size={16} color="#f59e0b" />
            <span>Presensi Upacara</span>
          </button>
        </div>
      </div>

      {/* Filter Bar Controls Card */}
      <div className="bm-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Row 1: Month, Year, Cutoff Toggle, Export Excel */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {mainReportTab === 'presensi' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.825rem', fontWeight: 700, color: '#374151' }}>Bulan:</span>
                <select
                  className="bm-input"
                  value={selectedMonth}
                  onChange={(e) => { setSelectedMonth(Number(e.target.value)); setCurrentPage(1); }}
                  style={{ width: '130px', height: '38px', fontSize: '0.85rem' }}
                >
                  {BULAN_LIST.map((b) => (
                    <option key={b.value} value={b.value}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.825rem', fontWeight: 700, color: '#374151' }}>Tahun:</span>
              <select
                className="bm-input"
                value={selectedYear}
                onChange={(e) => { setSelectedYear(Number(e.target.value)); setCurrentPage(1); }}
                style={{ width: '95px', height: '38px', fontSize: '0.85rem' }}
              >
                {TAHUN_LIST.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Export Action Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={fetchAllData}
              className="bm-btn-outline"
              style={{ height: '38px', padding: '0 14px' }}
              title="Refresh Data"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            <button
              onClick={handleExportCSV}
              disabled={isExporting || loading}
              className="bm-btn-emerald"
              style={{ height: '38px', padding: '0 16px' }}
            >
              <Download size={16} />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Row 2: SEARCHABLE SELECT FOR FAKULTAS, PRODI, AND UNIT KERJA (FROM BACKEND MASTERDATA ENDPOINTS: /api/masterdata/unit & master_units) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
          {/* FAKULTAS SEARCHABLE SELECT */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#111827', marginBottom: '6px' }}>
              Fakultas
            </label>
            <SearchableSelect
              options={fakultasOptions}
              value={selectedFakultas}
              onChange={(val) => { setSelectedFakultas(val); setCurrentPage(1); }}
              placeholder="Semua Fakultas"
              searchPlaceholder="Cari Fakultas UNPAK..."
            />
          </div>

          {/* PROGRAM STUDI SEARCHABLE SELECT */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#111827', marginBottom: '6px' }}>
              Program Studi
            </label>
            <SearchableSelect
              options={prodiOptions}
              value={selectedProdi}
              onChange={(val) => { setSelectedProdi(val); setCurrentPage(1); }}
              placeholder="Semua Program Studi"
              searchPlaceholder="Cari Prodi UNPAK..."
            />
          </div>

          {/* UNIT KERJA SEARCHABLE SELECT (FETCHED FROM unpak_newsimpeg.master_units) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#111827', marginBottom: '6px' }}>
              Unit Kerja
            </label>
            <SearchableSelect
              options={unitOptions}
              value={selectedUnit}
              onChange={(val) => { setSelectedUnit(val); setCurrentPage(1); }}
              placeholder="Semua Unit Kerja"
              searchPlaceholder="Cari Unit Kerja (master_units)..."
            />
          </div>

          {/* PENCARIAN PEGAWAI INPUT */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#111827', marginBottom: '6px' }}>
              Pencarian Pegawai
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                className="bm-input"
                placeholder="Cari nama/NIP..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                style={{ paddingLeft: '36px', height: '42px', fontSize: '0.85rem' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Data Table Matrix Section */}
      {mainReportTab === 'presensi' ? (
        <div className="bm-card" style={{ padding: '24px' }}>
          <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem', minWidth: '1350px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f8fafc', color: '#475569' }}>
                  <th style={{ width: '45px', padding: '12px', textAlign: 'center', position: 'sticky', left: 0, zIndex: 10, background: '#f8fafc' }}>
                    NO
                  </th>
                  <th style={{ minWidth: '180px', padding: '12px', position: 'sticky', left: '45px', zIndex: 10, background: '#f8fafc' }}>
                    PEGAWAI &amp; NIP
                  </th>
                  <th style={{ minWidth: '130px', padding: '12px' }}>UNIT KERJA</th>
                  <th style={{ minWidth: '160px', padding: '12px' }}>FAKULTAS &amp; PRODI</th>
                  <th style={{ width: '80px', padding: '12px', textAlign: 'center', color: '#10b981' }}>TOTAL HADIR</th>

                  {datesList.map((d) => {
                    const dayNum = d.getDate();
                    const isSunday = d.getDay() === 0;
                    const dKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    const isHoliday = holidays.has(dKey);

                    return (
                      <th
                        key={dKey}
                        style={{
                          minWidth: '85px',
                          textAlign: 'center',
                          padding: '8px 4px',
                          background: isSunday || isHoliday ? '#fef2f2' : undefined,
                          color: isSunday || isHoliday ? '#ef4444' : undefined,
                        }}
                      >
                        <div style={{ fontWeight: 800 }}>{dayNum}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={datesList.length + 5} style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                      Memuat matriks presensi pegawai...
                    </td>
                  </tr>
                ) : paginatedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={datesList.length + 5} style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                      Tidak ada data pegawai pada kriteria filter terpilih.
                    </td>
                  </tr>
                ) : (
                  paginatedEmployees.map((item, index) => {
                    const globalIndex = startIndex + index + 1;
                    const p = item.pengguna || {};
                    const nip = p.nip || item.kode || '-';
                    const nama = p.nama || `Pegawai ${nip}`;
                    const unit = p.unit_kerja || p.unit || '-';
                    const fakultas = p.fakultas || '-';
                    const prodi = p.prodi || '';
                    const records = item.records || [];

                    const totalHadir = records.filter((r) => r.type === 'absen' && (r.info?.masuk || r.info?.keluar)).length;

                    return (
                      <tr key={item.kode || index} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ textAlign: 'center', fontWeight: 600, position: 'sticky', left: 0, zIndex: 5, background: '#ffffff', padding: '12px' }}>
                          {globalIndex}
                        </td>
                        <td style={{ position: 'sticky', left: '45px', zIndex: 5, background: '#ffffff', padding: '12px', boxShadow: '2px 0 4px rgba(0,0,0,0.02)' }}>
                          <div style={{ fontWeight: 800, color: '#111827' }}>{nama}</div>
                          <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>NIP: {nip}</div>
                        </td>
                        <td style={{ padding: '12px', color: '#4b5563' }}>{unit}</td>
                        <td style={{ padding: '12px', color: '#111827', fontWeight: 600 }}>
                          {fakultas}
                          {prodi && <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 400 }}>Prodi: {prodi}</div>}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 800, color: '#10b981' }}>
                          {totalHadir}
                        </td>

                        {datesList.map((d) => {
                          const dKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                          const isSunday = d.getDay() === 0;
                          const isHoliday = holidays.has(dKey);

                          let bg = 'transparent';
                          let text = '-';
                          let textColor = '#9ca3af';
                          let cellRecord = null;
                          let isHadir = false;

                          if (isSunday || isHoliday) {
                            bg = '#fef2f2';
                            text = 'L';
                            textColor = '#ef4444';
                          }

                          const rec = getRecordForDate(records, dKey);
                          cellRecord = rec;
                          if (rec) {
                            if (rec.type === 'absen') {
                              isHadir = true;
                              bg = '#dcfce7';
                              text = formatJamAbsen(rec.info?.masuk, rec.info?.keluar);
                              textColor = '#15803d';
                            } else if (rec.type === 'izin') {
                              bg = '#e0f2fe';
                              text = 'I';
                              textColor = '#0369a1';
                            } else if (rec.type === 'cuti') {
                              bg = '#f3e8ff';
                              text = 'C';
                              textColor = '#6d28d9';
                            } else if (rec.type === 'sppd') {
                              bg = '#e0e7ff';
                              text = 'S';
                              textColor = '#4338ca';
                            }
                          }

                          return (
                            <td
                              key={dKey}
                              onClick={() => handleCellClick(p, dKey, cellRecord, false)}
                              style={{
                                textAlign: 'center',
                                backgroundColor: bg,
                                color: textColor,
                                fontWeight: isHadir ? 800 : 700,
                                fontSize: isHadir ? '0.70rem' : '0.78rem',
                                padding: '6px 4px',
                                whiteSpace: 'nowrap',
                                cursor: 'pointer',
                              }}
                              title={`Klik detail ${dKey}`}
                            >
                              {text}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!loading && totalItems > 0 && (
            <div style={{ marginTop: '18px' }}>
              <Pagination
                currentPage={currentPage}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                onPageChange={(p) => setCurrentPage(p)}
                onItemsPerPageChange={(limit) => { setItemsPerPage(limit); setCurrentPage(1); }}
              />
            </div>
          )}
        </div>
      ) : (
        /* Presensi Upacara Matrix */
        <div className="bm-card" style={{ padding: '24px' }}>
          <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem', minWidth: '1150px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f8fafc', color: '#475569' }}>
                  <th style={{ width: '45px', padding: '12px', textAlign: 'center', position: 'sticky', left: 0, zIndex: 10, background: '#f8fafc' }}>
                    NO
                  </th>
                  <th style={{ minWidth: '180px', padding: '12px', position: 'sticky', left: '45px', zIndex: 10, background: '#f8fafc' }}>
                    PEGAWAI &amp; NIP
                  </th>
                  <th style={{ minWidth: '130px', padding: '12px' }}>UNIT KERJA</th>
                  <th style={{ minWidth: '160px', padding: '12px' }}>FAKULTAS &amp; PRODI</th>
                  <th style={{ width: '85px', padding: '12px', textAlign: 'center', color: '#d97706' }}>TOTAL HADIR</th>

                  {BULAN_LIST.map((b) => (
                    <th key={b.value} style={{ width: '60px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontWeight: 800 }}>{b.value}</div>
                      <div style={{ fontSize: '0.68rem', color: '#6b7280' }}>{b.short}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="17" style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                      Memuat matriks presensi upacara tahun {selectedYear}...
                    </td>
                  </tr>
                ) : paginatedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan="17" style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                      Tidak ada data presensi upacara pada kriteria filter terpilih.
                    </td>
                  </tr>
                ) : (
                  paginatedEmployees.map((item, index) => {
                    const globalIndex = startIndex + index + 1;
                    const p = item.pengguna || {};
                    const nip = p.nip || item.kode || '-';
                    const nama = p.nama || `Pegawai ${nip}`;
                    const unit = p.unit_kerja || p.unit || '-';
                    const fakultas = p.fakultas || '-';
                    const prodi = p.prodi || '';

                    const empCeremonies = ceremonyList.filter((c) => {
                      const cDate = new Date(c.tanggal);
                      const isMatchingEmp = (c.nip && c.nip === nip) || (c.nidn && c.nidn === p.nidn);
                      return isMatchingEmp && cDate.getFullYear() === selectedYear;
                    });

                    const totalHadir = empCeremonies.length;

                    return (
                      <tr key={item.kode || index} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ textAlign: 'center', fontWeight: 600, position: 'sticky', left: 0, zIndex: 5, background: '#ffffff', padding: '12px' }}>
                          {globalIndex}
                        </td>
                        <td style={{ position: 'sticky', left: '45px', zIndex: 5, background: '#ffffff', padding: '12px', boxShadow: '2px 0 4px rgba(0,0,0,0.02)' }}>
                          <div style={{ fontWeight: 800, color: '#111827' }}>{nama}</div>
                          <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>NIP: {nip}</div>
                        </td>
                        <td style={{ padding: '12px', color: '#4b5563' }}>{unit}</td>
                        <td style={{ padding: '12px', color: '#111827', fontWeight: 600 }}>
                          {fakultas}
                          {prodi && <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 400 }}>Prodi: {prodi}</div>}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 800, color: '#d97706' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '9999px', background: '#fef3c7', color: '#b45309' }}>
                            {totalHadir}
                          </span>
                        </td>

                        {BULAN_LIST.map((b) => {
                          const monthCeremonies = empCeremonies.filter((c) => {
                            const cDate = new Date(c.tanggal);
                            return (cDate.getMonth() + 1) === b.value;
                          });

                          const isAttended = monthCeremonies.length > 0;
                          const firstRecord = monthCeremonies[0];
                          const displayTime = isAttended ? (formatJamMasuk(firstRecord.created_at || firstRecord.tanggal) || '07:00') : '-';

                          return (
                            <td
                              key={b.value}
                              onClick={() => isAttended && handleCellClick(p, firstRecord.tanggal, firstRecord, true)}
                              style={{
                                textAlign: 'center',
                                fontWeight: isAttended ? 800 : 400,
                                fontSize: isAttended ? '0.75rem' : '0.8rem',
                                color: isAttended ? '#15803d' : '#9ca3af',
                                backgroundColor: isAttended ? '#dcfce7' : 'transparent',
                                cursor: isAttended ? 'pointer' : 'default',
                                padding: '6px 2px',
                              }}
                            >
                              {displayTime}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!loading && totalItems > 0 && (
            <div style={{ marginTop: '18px' }}>
              <Pagination
                currentPage={currentPage}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                onPageChange={(p) => setCurrentPage(p)}
                onItemsPerPageChange={(limit) => { setItemsPerPage(limit); setCurrentPage(1); }}
              />
            </div>
          )}
        </div>
      )}

      {/* Cell Detail Modal */}
      <Modal
        isOpen={isCellModalOpen}
        onClose={() => setIsCellModalOpen(false)}
        title={selectedCell?.isUpacara ? 'Detail Presensi Upacara' : 'Detail Presensi Pegawai'}
      >
        {selectedCell && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '14px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#111827' }}>{selectedCell.emp?.nama || selectedCell.emp?.nip}</div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '2px' }}>
                NIP: {selectedCell.emp?.nip || '-'} &bull; Unit: {selectedCell.emp?.unit_kerja || selectedCell.emp?.unit || '-'}
              </div>
              <div style={{ fontSize: '0.825rem', fontWeight: 700, color: '#10b981', marginTop: '6px' }}>
                📅 {formatIndonesianDate(selectedCell.dateStr)}
              </div>
            </div>

            {selectedCell.record ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f3f4f6', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.85rem', color: '#4b5563' }}>Status Presensi:</span>
                  <strong style={{ textTransform: 'uppercase', fontSize: '0.85rem', color: '#10b981' }}>
                    {selectedCell.isUpacara ? 'HADIR UPACARA' : selectedCell.record.type}
                  </strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#dcfce7', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.85rem', color: '#15803d' }}>Jam Masuk:</span>
                  <strong style={{ fontSize: '0.85rem', color: '#14532d' }}>
                    {selectedCell.isUpacara 
                      ? (formatJamMasuk(selectedCell.record.created_at || selectedCell.record.tanggal) || '07:00 WIB')
                      : (selectedCell.record.info?.masuk || '-')}
                  </strong>
                </div>

                {!selectedCell.isUpacara && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#e0f2fe', borderRadius: '8px' }}>
                    <span style={{ fontSize: '0.85rem', color: '#0369a1' }}>Jam Keluar:</span>
                    <strong style={{ fontSize: '0.85rem', color: '#0c4a6e' }}>{selectedCell.record.info?.keluar || '-'}</strong>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '16px', color: '#6b7280', fontSize: '0.85rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                {holidays.has(selectedCell.dateStr) ? 'Hari Libur Kalender / Universitas' : (selectedCell.isUpacara ? 'Tidak ada catatan presensi upacara.' : 'Tidak ada catatan presensi / Tanpa Keterangan.')}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
