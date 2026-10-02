import React, { useState, useEffect } from 'react';
import { 
  Flag, 
  Search, 
  Plus, 
  Edit3, 
  Trash2, 
  Calendar, 
  Clock, 
  MapPin, 
  CheckCircle2, 
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Info
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { formatIndonesianDate, getLocalDateStr } from '../utils/dateFormatter';

export const MasterUpacaraPage = () => {
  const { showToast } = useToast();

  const [ceremonies, setCeremonies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const currentYearNum = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYearNum);
  const [selectedMonth, setSelectedMonth] = useState(''); // '' means all months
  const yearsList = Array.from({ length: 10 }, (_, i) => currentYearNum - 3 + i);

  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [nama, setNama] = useState('');
  const [tanggal, setTanggal] = useState('');
  const [jamMulai, setJamMulai] = useState('08:00');
  const [jamSelesai, setJamSelesai] = useState('09:00');
  const [lokasi, setLokasi] = useState('Lapangan Utama UNPAK');
  const [deskripsi, setDeskripsi] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchCeremonies = async () => {
    setLoading(true);
    try {
      let queryParams = [];
      if (selectedYear) queryParams.push(`tahun=${selectedYear}`);
      if (selectedMonth) queryParams.push(`bulan=${selectedMonth}`);
      const qs = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

      const res = await apiClient.get(`/api/v2/master-upacara${qs}`);
      let list = [];
      if (Array.isArray(res)) {
        list = res;
      } else if (res?.data && Array.isArray(res.data)) {
        list = res.data;
      }
      setCeremonies(list);
    } catch (err) {
      showToast('Gagal memuat data master upacara', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCeremonies();
  }, [selectedYear, selectedMonth]);

  const handleOpenAddModal = () => {
    setEditingItem(null);
    setNama('');
    setTanggal(getLocalDateStr());
    setJamMulai('08:00');
    setJamSelesai('09:00');
    setLokasi('Lapangan Utama UNPAK');
    setDeskripsi('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item) => {
    setEditingItem(item);
    setNama(item.nama || '');

    // Pastikan tanggal diformat YYYY-MM-DD agar valid masuk ke input type="date"
    const rawDate = item.tanggal || item.date || '';
    let formattedDate = '';
    if (rawDate) {
      if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawDate.trim())) {
        formattedDate = rawDate.trim().substring(0, 10);
      } else {
        formattedDate = getLocalDateStr(rawDate);
      }
    }
    setTanggal(formattedDate);
    setJamMulai(item.jam_mulai || '08:00');
    setJamSelesai(item.jam_selesai || '09:00');
    setLokasi(item.lokasi || 'Lapangan Utama UNPAK');
    setDeskripsi(item.deskripsi || '');
    setIsModalOpen(true);
  };

  const handleSaveCeremony = async (e) => {
    e.preventDefault();
    const cleanDate = typeof tanggal === 'string' && tanggal.trim().length >= 10 
      ? tanggal.trim().substring(0, 10) 
      : (tanggal || '').trim();

    if (!nama.trim() || !cleanDate) {
      showToast('Harap lengkapi nama upacara dan tanggal pelaksanaan.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('event', nama.trim()); //[pr] ini bukan dari nama
      formData.append('tanggal', cleanDate);
      formData.append('jam_mulai', jamMulai || '08:00');
      formData.append('jam_selesai', jamSelesai || '09:00');
      formData.append('lokasi', lokasi.trim() || 'Lapangan Utama UNPAK');
      formData.append('deskripsi', deskripsi.trim());

      if (editingItem) {
        await apiClient.putForm(`/api/v2/master-upacara/${editingItem.id}`, formData);
        showToast('Berhasil mengupdate jadwal master upacara', 'success');
      } else {
        await apiClient.postForm('/api/v2/master-upacara', formData);
        showToast('Berhasil menambahkan jadwal master upacara baru', 'success');
      }
      setIsModalOpen(false);
      fetchCeremonies();
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan data master upacara', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCeremony = async (id, ceremonyName) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus jadwal upacara "${ceremonyName || id}"?`)) return;
    try {
      await apiClient.delete(`/api/v2/master-upacara/${id}`);
      showToast('Jadwal upacara berhasil dihapus', 'success');
      fetchCeremonies();
    } catch (err) {
      showToast(err.message || 'Gagal menghapus jadwal upacara', 'error');
    }
  };

  // Helper date status
  const todayStr = new Date().toISOString().split('T')[0];
  const getStatusBadge = (tgl) => {
    if (tgl === todayStr) {
      return <Badge variant="success">Hari Ini</Badge>;
    }
    if (tgl > todayStr) {
      return <Badge variant="primary">Akan Datang</Badge>;
    }
    return <Badge variant="neutral">Selesai</Badge>;
  };

  // Filtering
  const filteredCeremonies = ceremonies.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchName = (item.nama || '').toLowerCase().includes(q);
    const matchDate = (item.tanggal || '').includes(q) || formatIndonesianDate(item.tanggal || '').toLowerCase().includes(q);
    const matchLocation = (item.lokasi || '').toLowerCase().includes(q);
    return matchName || matchDate || matchLocation;
  });

  // Pagination
  const totalItems = filteredCeremonies.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const currentRows = filteredCeremonies.slice(startIndex, startIndex + pageSize);

  const months = [
    { value: '', label: 'Semua Bulan' },
    { value: '01', label: 'Januari' },
    { value: '02', label: 'Februari' },
    { value: '03', label: 'Maret' },
    { value: '04', label: 'April' },
    { value: '05', label: 'Mei' },
    { value: '06', label: 'Juni' },
    { value: '07', label: 'Juli' },
    { value: '08', label: 'Agustus' },
    { value: '09', label: 'September' },
    { value: '10', label: 'Oktober' },
    { value: '11', label: 'November' },
    { value: '12', label: 'Desember' },
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Banner */}
      <div
        className="bm-card"
        style={{
          padding: '24px 28px',
          background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <span style={{ padding: '4px 10px', borderRadius: '4px', background: '#dbeafe', color: '#1d4ed8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', display: 'inline-block' }}>
            Master Data SDM
          </span>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111827', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Flag size={26} color="#2563eb" />
            <span>Master Data Upacara Bendera</span>
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '2px' }}>
            Kelola jadwal upacara bendera universitas, penyesuaian tanggal koreksi tanggal 17, dan lokasi pelaksanaan presensi.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="bm-btn-emerald"
          style={{ padding: '10px 18px', height: '40px', background: '#2563eb', borderColor: '#2563eb' }}
        >
          <Plus size={16} />
          <span>Tambah Jadwal Upacara</span>
        </button>
      </div>

      {/* Info Card Aturan Presensi Upacara */}
      <div
        className="bm-card"
        style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '16px',
        }}
      >
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7', flexShrink: 0, marginTop: '2px' }}>
          <Info size={20} />
        </div>
        <div style={{ flex: 1, fontSize: '0.875rem', color: '#334155', lineHeight: 1.6 }}>
          <strong style={{ color: '#0f172a', display: 'block', marginBottom: '4px', fontSize: '0.95rem' }}>
            Ketentuan Presensi Upacara Bendera Pegawai UNPAK
          </strong>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            <li>
              Secara default, presensi upacara <strong>otomatis aktif setiap tanggal 17</strong> di setiap bulan.
            </li>
            <li>
              Jika tanggal 17 bertepatan hari libur/Minggu atau terdapat upacara peringatan khusus (Hari Pahlawan, Dies Natalis, dll.), gunakan menu ini untuk <strong>koreksi atau penjadwalan tanggal upacara tambahan</strong>.
            </li>
            <li>
              Tombol <strong>Absen Upacara</strong> di dashboard aktif sesuai dengan <strong>Jam Mulai s.d. Jam Selesai</strong> yang ditentukan pada jadwal (default rutin: pukul 08:00 s.d. 09:00 WIB) dan pegawai wajib berada di <strong>Area Lapangan Utama UNPAK</strong> (sesuai verifikasi GPS Polygon).
            </li>
          </ul>
        </div>
      </div>

      {/* FILTER BAR & SEARCH */}
      <div className="bm-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
          {/* Search Bar Input */}
          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="bm-input"
              placeholder="Cari nama upacara / lokasi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '36px', height: '38px', borderRadius: '8px', fontSize: '0.85rem' }}
            />
          </div>

          {/* Month & Year Filter Selects */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#6b7280' }}>Bulan:</span>
              <select
                className="bm-input"
                value={selectedMonth}
                onChange={(e) => { setSelectedMonth(e.target.value); setCurrentPage(1); }}
                style={{ width: '140px', height: '38px', fontSize: '0.85rem', borderRadius: '8px' }}
              >
                {months.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#6b7280' }}>Tahun:</span>
              <select
                className="bm-input"
                value={selectedYear}
                onChange={(e) => { setSelectedYear(Number(e.target.value)); setCurrentPage(1); }}
                style={{ width: '100px', height: '38px', fontSize: '0.85rem', borderRadius: '8px' }}
              >
                {yearsList.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* LIST TABLE */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                <th style={{ padding: '12px 16px', width: '50px' }}>No</th>
                <th style={{ padding: '12px 16px' }}>Nama Upacara</th>
                <th style={{ padding: '12px 16px' }}>Tanggal</th>
                <th style={{ padding: '12px 16px' }}>Waktu Pelaksanaan</th>
                <th style={{ padding: '12px 16px' }}>Lokasi</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#6b7280' }}>
                    Memuat data master upacara...
                  </td>
                </tr>
              ) : currentRows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#9ca3af' }}>
                    Belum ada data jadwal upacara untuk periode yang dipilih.
                  </td>
                </tr>
              ) : (
                currentRows.map((item, idx) => (
                  <tr
                    key={item.id || idx}
                    style={{
                      borderBottom: '1px solid #f3f4f6',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '14px 16px', color: '#9ca3af', fontWeight: 600 }}>
                      {startIndex + idx + 1}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 700, color: '#111827' }}>
                        {item.nama}
                      </div>
                      {item.deskripsi && (
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>
                          {item.deskripsi}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#374151', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Calendar size={14} color="#6b7280" />
                        <span>{formatIndonesianDate(item.tanggal)}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#374151', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} color="#2563eb" />
                        <span style={{ fontWeight: 600 }}>{item.jam_mulai || '08:00'} - {item.jam_selesai || '09:00'} WIB</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#374151' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPin size={14} color="#10b981" />
                        <span>{item.lokasi || 'Lapangan Utama UNPAK'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {getStatusBadge(item.tanggal)}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => handleOpenEditModal(item)}
                          className="bm-btn-outline"
                          style={{ padding: '6px 10px', height: '30px', fontSize: '0.75rem' }}
                          title="Edit Jadwal Upacara"
                        >
                          <Edit3 size={13} />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleDeleteCeremony(item.id, item.nama)}
                          style={{
                            padding: '6px 10px',
                            height: '30px',
                            fontSize: '0.75rem',
                            border: '1px solid #fee2e2',
                            background: '#fef2f2',
                            color: '#dc2626',
                            borderRadius: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer',
                          }}
                          title="Hapus Jadwal Upacara"
                        >
                          <Trash2 size={13} />
                          <span>Hapus</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
              Menampilkan {startIndex + 1} - {Math.min(startIndex + pageSize, totalItems)} dari {totalItems} data
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="bm-btn-outline"
                style={{ padding: '6px 10px', height: '32px' }}
              >
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, padding: '0 8px' }}>
                Halaman {currentPage} dari {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="bm-btn-outline"
                style={{ padding: '6px 10px', height: '32px' }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL TAMBAH / EDIT JADWAL UPACARA */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? 'Edit Jadwal Master Upacara' : 'Tambah Jadwal Upacara Baru'}
      >
        <form onSubmit={handleSaveCeremony} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
              Nama Upacara <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              required
              className="bm-input"
              placeholder="Contoh: Upacara Bendera Rutin Tanggal 17 / Upacara Hari Pahlawan"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              style={{ width: '100%', height: '40px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
              Tanggal Pelaksanaan <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="date"
              required
              className="bm-input"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              style={{ width: '100%', height: '40px' }}
            />
            <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', display: 'block' }}>
              Pilih tanggal koreksi jika upacara tgl 17 dialihkan, atau tanggal peringatan hari besar.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
                Jam Mulai
              </label>
              <input
                type="time"
                className="bm-input"
                value={jamMulai}
                onChange={(e) => setJamMulai(e.target.value)}
                style={{ width: '100%', height: '40px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
                Jam Selesai
              </label>
              <input
                type="time"
                className="bm-input"
                value={jamSelesai}
                onChange={(e) => setJamSelesai(e.target.value)}
                style={{ width: '100%', height: '40px' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
              Lokasi Upacara
            </label>
            <input
              type="text"
              className="bm-input"
              placeholder="Contoh: Lapangan Utama UNPAK"
              value={lokasi}
              onChange={(e) => setLokasi(e.target.value)}
              style={{ width: '100%', height: '40px' }}
            />
            <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', display: 'block' }}>
              Lokasi verifikasi GPS: Lapangan Utama UNPAK.
            </span>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
              Deskripsi / Keterangan (Opsional)
            </label>
            <textarea
              className="bm-input"
              rows={3}
              placeholder="Tambahkan instruksi dress code atau keterangan pelaksanaan upacara..."
              value={deskripsi}
              onChange={(e) => setDeskripsi(e.target.value)}
              style={{ width: '100%', padding: '10px', fontSize: '0.85rem' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="bm-btn-outline"
              style={{ padding: '8px 16px' }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bm-btn-emerald"
              style={{ padding: '8px 20px', background: '#2563eb', borderColor: '#2563eb' }}
            >
              {submitting ? 'Menyimpan...' : editingItem ? 'Simpan Perubahan' : 'Tambah Upacara'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
