import { formatIndonesianDate, getTwoMonthDateRange } from './dateFormatter';

/**
 * Mengubah string tanggal Y-m-d atau ISO 8601 menjadi format "01 Januari 2026" dalam WIB (Asia/Jakarta)
 */
export const formatTanggalIndo = (dateStr) => {
  if (!dateStr) return '-';
  return formatIndonesianDate(dateStr);
};

/**
 * Mengubah rentang tanggal menjadi "01 Januari 2026 s/d 05 Januari 2026"
 */
export const formatRentangTanggalIndo = (startStr, endStr) => {
  if (!startStr && !endStr) return '-';
  if (!endStr || startStr === endStr) return formatTanggalIndo(startStr);
  return `${formatTanggalIndo(startStr)} s/d ${formatTanggalIndo(endStr)}`;
};

export { getTwoMonthDateRange };
