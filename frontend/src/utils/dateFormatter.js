// Utility for formatting dates and times in standard Indonesian format (WIB / Asia/Jakarta)

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/**
 * Get current or given date as YYYY-MM-DD string in WIB (Asia/Jakarta) timezone
 */
export const getLocalDateStr = (dateInput = new Date()) => {
  if (!dateInput) return '';
  let dObj = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(dObj.getTime())) {
    if (typeof dateInput === 'string') {
      const match = dateInput.trim().match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
    }
    return '';
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(dObj);
};

/**
 * Format a date string or Date object into "17 Agustus 2026" or "Senin, 17 Agustus 2026" in WIB timezone
 */
export const formatIndonesianDate = (dateInput, includeDayName = false) => {
  if (!dateInput || dateInput === '-') return '-';

  let dateObj;
  if (typeof dateInput === 'string') {
    const cleaned = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      dateObj = new Date(`${cleaned}T00:00:00+07:00`);
    } else {
      dateObj = new Date(cleaned);
    }
  } else if (dateInput instanceof Date) {
    dateObj = dateInput;
  } else {
    return String(dateInput);
  }

  if (isNaN(dateObj.getTime())) {
    return String(dateInput);
  }

  const dtf = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: includeDayName ? 'long' : undefined,
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return dtf.format(dateObj);
};

/**
 * Format a timestamp into time format "17:45 WIB" in WIB timezone
 */
export const formatIndonesianTime = (dateInput) => {
  if (!dateInput || dateInput === '-') return '-';

  let dateObj;
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      return trimmed.substring(0, 5) + ' WIB';
    }
    dateObj = new Date(trimmed);
  } else if (dateInput instanceof Date) {
    dateObj = dateInput;
  } else {
    return String(dateInput);
  }

  if (isNaN(dateObj.getTime())) {
    return String(dateInput);
  }

  const timeStr = dateObj.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).replace('.', ':');

  return `${timeStr} WIB`;
};

/**
 * Calculate duration in days between two dates
 */
export const calculateDurationDays = (startDateInput, endDateInput) => {
  if (!startDateInput) return 1;
  if (!endDateInput || startDateInput === endDateInput) return 1;

  const start = new Date(startDateInput);
  const end = new Date(endDateInput);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 1;

  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays > 0 ? diffDays : 1;
};

/**
 * Normalize any date input string to standard HTML5 date input format "YYYY-MM-DD" in WIB timezone
 */
export const formatInputDate = (dateInput) => {
  if (!dateInput) return '';
  const str = String(dateInput).trim();
  if (!str) return '';

  // Case 1: YYYY-MM-DD... (e.g. "2026-09-04" or "2026-09-04 00:00:00")
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch && !str.includes('T')) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Case 2: DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  // Case 3: ISO timestamps or Date object parsing with Asia/Jakarta timezone
  return getLocalDateStr(str);
};

/**
 * Format date range into "17 Agustus 2026 s/d 20 Agustus 2026"
 */
export const formatIndonesianDateRange = (startDateInput, endDateInput, showDuration = false) => {
  const startStr = startDateInput || endDateInput || '';
  const endStr = endDateInput || startDateInput || '';
  if (!startStr) return '-';

  const startFormatted = formatIndonesianDate(startStr);
  const endFormatted = formatIndonesianDate(endStr);
  const days = calculateDurationDays(startStr, endStr);

  const rangeText = `${startFormatted} s/d ${endFormatted}`;
  return showDuration ? `${rangeText} (${days} Hari)` : rangeText;
};

/**
 * Mendapatkan rentang tanggal 2 bulan (awal bulan lalu s/d akhir bulan ini)
 * Contoh: Sekarang tanggal 06-10-2026 -> { tanggal_mulai: '2026-09-01', tanggal_akhir: '2026-10-31' }
 */
export const getTwoMonthDateRange = (baseDate = new Date()) => {
  const localStr = getLocalDateStr(baseDate) || getLocalDateStr();
  const [yStr, mStr] = localStr.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10) - 1; // 0-indexed

  // Awal bulan lalu: tanggal 1 dari bulan sebelumnya
  const startDate = new Date(year, month - 1, 1);
  const startY = startDate.getFullYear();
  const startM = String(startDate.getMonth() + 1).padStart(2, '0');
  const tanggal_mulai = `${startY}-${startM}-01`;

  // Akhir bulan ini: hari terakhir dari bulan sekarang
  const endDate = new Date(year, month + 1, 0);
  const endY = endDate.getFullYear();
  const endM = String(endDate.getMonth() + 1).padStart(2, '0');
  const endD = String(endDate.getDate()).padStart(2, '0');
  const tanggal_akhir = `${endY}-${endM}-${endD}`;

  return { tanggal_mulai, tanggal_akhir };
};
