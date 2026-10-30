import React, { useState, useEffect } from 'react';
import { Printer, RefreshCw } from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export const defaultFormatRupiah = (val) => {
  if (val === undefined || val === null) return '0';
  const num = typeof val === 'number' ? val : (parseFloat(val) || 0);
  return new Intl.NumberFormat('id-ID').format(num);
};

export const toNum = (val) => Number(val) || 0;

export const SlipGajiPegawai = ({
  data = {},
  formatRupiah = defaultFormatRupiah
}) => {
  const bpjs = Math.round(toNum(data.bpjs));
  const astek = Math.round(toNum(data.astekP) + toNum(data.astekY) + bpjs + (bpjs > 0 ? bpjs / 2 : 0));
  const dlpk = Math.round(toNum(data.dplkP) + toNum(data.dplkY));

  const astek_dlpk = Math.round(toNum(data.gajikotor) > 0
    ? toNum(data.gajikotor) - toNum(data.gajibersih)
    : 0);

  return (
    <div style={{ width: '100%', fontSize: '12px', fontFamily: "'Times New Roman', Times, serif, Arial", color: '#000000' }}>
      {/* Header Document Box */}
      <table
        style={{
          width: '100%',
          fontWeight: 'bold',
          borderCollapse: 'collapse',
          border: '1.5px solid #000000',
          marginBottom: '8px'
        }}
      >
        <tbody>
          <tr align="center">
            <td style={{ padding: '8px 10px' }}>
              <div style={{ fontWeight: 'bold', margin: '0px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.01em' }}>
                UNIT KERJA/FAKULTAS {data.prodi ? data.prodi : 'REKTORAT'}
              </div>
              <div style={{ fontWeight: 'bold', margin: '0px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.01em' }}>
                UNIVERSITAS PAKUAN
              </div>
              <div style={{ fontWeight: 'bold', margin: '2px 0 0 0', fontSize: '15px', textDecoration: 'underline', letterSpacing: '0.02em' }}>
                GAJI dan TUNJANGAN
              </div>
              <div style={{ fontWeight: 'bold', margin: '3px 0 0 0', fontSize: '13px' }}>
                Bulan/Tahun : {data.bulan}/{data.tahun}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Main Details Table */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1.5px solid #000000',
          fontSize: '12px',
          lineHeight: '1.35'
        }}
      >
        <tbody>
          <tr>
            <td style={{ width: '130px', padding: '3px 6px', fontWeight: 'bold' }}>No. Urut</td>
            <td style={{ width: '12px' }}>:</td>
            <td colSpan={2} style={{ padding: '3px 0', fontWeight: 'bold' }}>{data.no_mesin || data.no_urut || ''}</td>
            <td style={{ textAlign: 'right', paddingRight: '8px', fontWeight: 'bold' }}>Hari</td>
          </tr>
          <tr>
            <td style={{ padding: '3px 6px', fontWeight: 'bold' }}>Nama</td>
            <td>:</td>
            <td colSpan={3} style={{ padding: '3px 0', fontWeight: 'bold' }}>{data.nama || ''}</td>
          </tr>

          {/* Income Breakdown */}
          <tr>
            <td style={{ padding: '4px 6px 2px 6px', fontWeight: 'bold' }}>Gaji Pokok</td>
            <td style={{ width: '30px' }}>Rp.</td>
            <td style={{ width: '120px', textAlign: 'right' }}>{formatRupiah(data.gaji_pokok ?? data.gajiPokok)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Suami/istri</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.tkeluarga ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Anak</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.tanak ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Pangan</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.tpangan ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Struktural</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.tstruktural ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Fungsional</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.tfungsional ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Transpot</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.transpot ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Khusus</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.tkhusus ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Astek/DPLK</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah((data.astekY + data.dplkY) ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr style={{ borderBottom: '1.5px solid #000000' }}>
            <td style={{ padding: '2px 6px 4px 6px', fontWeight: 'bold' }}>BPJS</td>
            <td style={{ paddingBottom: '4px' }}>Rp.</td>
            <td style={{ textAlign: 'right', paddingBottom: '4px' }}>{formatRupiah(data.bpjs)}</td>
            <td colSpan={2} style={{ paddingBottom: '4px' }}></td>
          </tr>

          {/* Total Income Row */}
          <tr>
            <td colSpan={3} style={{ padding: '6px 6px', fontWeight: 'bold', fontSize: '12.5px' }}>Jumlah Pendapatan</td>
            <td style={{ padding: '6px 0', fontWeight: 'bold', fontSize: '12.5px', width: '30px' }}>Rp.</td>
            <td style={{ textAlign: 'right', padding: '6px 8px 6px 0', fontWeight: 'bold', fontSize: '12.5px', width: '130px' }}>
              {formatRupiah(data.gajikotor ?? 0)}
            </td>
          </tr>

          {/* Deductions Breakdown */}
          <tr>
            <td style={{ padding: '4px 6px 2px 6px', fontWeight: 'bold' }}>Astek</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(astek)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>DPLK</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(dlpk)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Koperasi</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.pkoperasi ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Yayasan</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.pyayasan ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr style={{ borderBottom: '1.5px solid #000000' }}>
            <td style={{ padding: '2px 6px 4px 6px', fontWeight: 'bold' }}>Zakat 2.5%</td>
            <td style={{ paddingBottom: '4px' }}>Rp.</td>
            <td style={{ textAlign: 'right', paddingBottom: '4px' }}>{formatRupiah(data.pzakat ?? 0)}</td>
            <td colSpan={2} style={{ paddingBottom: '4px' }}></td>
          </tr>

          {/* Total Deductions Row */}
          <tr>
            <td colSpan={3} style={{ padding: '4px 6px 2px 6px', fontWeight: 'bold', fontSize: '12.5px' }}>Jumlah Potongan</td>
            <td style={{ padding: '4px 0 2px 0', fontWeight: 'bold', fontSize: '12.5px', borderBottom: '1px solid #000000' }}>Rp.</td>
            <td style={{ textAlign: 'right', padding: '4px 8px 2px 0', fontWeight: 'bold', fontSize: '12.5px', borderBottom: '1px solid #000000' }}>
              {formatRupiah(astek_dlpk)}
            </td>
          </tr>

          {/* Net Income Row */}
          <tr>
            <td colSpan={3} style={{ padding: '4px 6px 6px 6px', fontWeight: 'bold', fontSize: '12.5px' }}>Pendapatan Bersih</td>
            <td style={{ padding: '4px 0 6px 0', fontWeight: 'bold', fontSize: '12.5px' }}>Rp.</td>
            <td style={{ textAlign: 'right', padding: '4px 8px 6px 0', fontWeight: 'bold', fontSize: '12.5px' }}>
              {formatRupiah(data.gajibersih ?? 0)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Signature Section */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '12px',
          marginTop: '16px'
        }}
      >
        <tbody>
          <tr>
            <td style={{ width: '50%' }}></td>
            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
              Bogor, {data.bulan} {data.tahun}
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'center', fontWeight: 'bold', paddingTop: '6px' }}>Yang Menerima,</td>
            <td style={{ textAlign: 'center', fontWeight: 'bold', paddingTop: '6px' }}>Yang Menyerahkan,</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'center', fontWeight: 'bold', paddingTop: '45px' }}>
              ({data.nama || ''})
            </td>
            <td style={{ textAlign: 'center', fontWeight: 'bold', paddingTop: '45px' }}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export const SlipGajiDosen = ({
  data = {},
  formatRupiah = defaultFormatRupiah
}) => {
  const bpjs = Math.round(toNum(data.bpjs));
  const astek = Math.round(toNum(data.astekP) + toNum(data.astekY) + bpjs + (bpjs > 0 ? bpjs / 2 : 0));
  const dlpk = Math.round(toNum(data.dplkP) + toNum(data.dplkY));

  const astek_dlpk = Math.round(toNum(data.gajikotor) > 0
    ? toNum(data.gajikotor) - toNum(data.gajibersih)
    : 0);

  return (
    <div style={{ width: '100%', fontSize: '12px', fontFamily: "'Times New Roman', Times, serif, Arial", color: '#000000' }}>
      {/* Header Document Box */}
      <table
        style={{
          width: '100%',
          fontWeight: 'bold',
          borderCollapse: 'collapse',
          border: '1.5px solid #000000',
          marginBottom: '8px'
        }}
      >
        <tbody>
          <tr align="center">
            <td style={{ padding: '8px 10px' }}>
              <div style={{ fontWeight: 'bold', margin: '0px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.01em' }}>
                UNIT KERJA/FAKULTAS {data.prodi ? data.prodi : 'SEKOLAH VOKASI'}
              </div>
              <div style={{ fontWeight: 'bold', margin: '0px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.01em' }}>
                UNIVERSITAS PAKUAN
              </div>
              <div style={{ fontWeight: 'bold', margin: '2px 0 0 0', fontSize: '15px', textDecoration: 'underline', letterSpacing: '0.02em' }}>
                GAJI dan TUNJANGAN
              </div>
              <div style={{ fontWeight: 'bold', margin: '3px 0 0 0', fontSize: '13px' }}>
                Bulan/Tahun : {data.bulan}/{data.tahun}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Main Details Table */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1.5px solid #000000',
          fontSize: '12px',
          lineHeight: '1.35'
        }}
      >
        <tbody>
          <tr>
            <td style={{ width: '130px', padding: '3px 6px', fontWeight: 'bold' }}>No. Urut</td>
            <td style={{ width: '12px' }}>:</td>
            <td colSpan={2} style={{ padding: '3px 0', fontWeight: 'bold' }}>{data.no_mesin || data.no_urut || ''}</td>
            <td style={{ textAlign: 'right', paddingRight: '8px', fontWeight: 'bold' }}>Hari</td>
          </tr>
          <tr>
            <td style={{ padding: '3px 6px', fontWeight: 'bold' }}>Nama</td>
            <td>:</td>
            <td colSpan={3} style={{ padding: '3px 0', fontWeight: 'bold' }}>{data.nama || ''}</td>
          </tr>

          {/* Income Breakdown */}
          <tr>
            <td style={{ padding: '4px 6px 2px 6px', fontWeight: 'bold' }}>Gaji Pokok</td>
            <td style={{ width: '30px' }}>Rp.</td>
            <td style={{ width: '120px', textAlign: 'right' }}>{formatRupiah(data.gaji_pokok ?? data.gajiPokok)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Suami/istri</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.tkeluarga ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Anak</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.tanak ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Pangan</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.tpangan ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Struktural</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.tstruktural ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Fungsional</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.tfungsional ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>

          {/* Mengajar Breakdown */}
          <tr>
            <td colSpan={5} style={{ padding: '2px 6px', fontWeight: 'bold' }}>Mengajar :</td>
          </tr>
          <tr>
            <td style={{ padding: '1px 6px 1px 18px' }}>-S1</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.mengajar ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '1px 6px 1px 18px' }}>-S1-NonReg</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.nonregular ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '1px 6px 1px 18px' }}>-Vokasi</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.D3regular ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '1px 6px 1px 18px' }}>-Vokasi-NonReg</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.D3nonregular ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '1px 6px 1px 18px' }}>-Pasca</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.pascasarjana ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>

          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Transpot</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.transpot ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Khusus</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.tkhusus ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Astek/DPLK</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah((data.astekY + data.dplkY) ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr style={{ borderBottom: '1.5px solid #000000' }}>
            <td style={{ padding: '2px 6px 4px 6px', fontWeight: 'bold' }}>BPJS</td>
            <td style={{ paddingBottom: '4px' }}>Rp.</td>
            <td style={{ textAlign: 'right', paddingBottom: '4px' }}>{formatRupiah(data.bpjs)}</td>
            <td colSpan={2} style={{ paddingBottom: '4px' }}></td>
          </tr>

          {/* Total Income Row */}
          <tr>
            <td colSpan={3} style={{ padding: '6px 6px', fontWeight: 'bold', fontSize: '12.5px' }}>Jumlah Pendapatan</td>
            <td style={{ padding: '6px 0', fontWeight: 'bold', fontSize: '12.5px', width: '30px' }}>Rp.</td>
            <td style={{ textAlign: 'right', padding: '6px 8px 6px 0', fontWeight: 'bold', fontSize: '12.5px', width: '130px' }}>
              {formatRupiah(data.gajikotor ?? 0)}
            </td>
          </tr>

          {/* Deductions Breakdown */}
          <tr>
            <td style={{ padding: '4px 6px 2px 6px', fontWeight: 'bold' }}>Astek</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(astek)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>DPLK</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(dlpk)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Koperasi</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.pkoperasi ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '2px 6px', fontWeight: 'bold' }}>Yayasan</td>
            <td>Rp.</td>
            <td style={{ textAlign: 'right' }}>{formatRupiah(data.pyayasan ?? 0)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr style={{ borderBottom: '1.5px solid #000000' }}>
            <td style={{ padding: '2px 6px 4px 6px', fontWeight: 'bold' }}>Zakat 2.5%</td>
            <td style={{ paddingBottom: '4px' }}>Rp.</td>
            <td style={{ textAlign: 'right', paddingBottom: '4px' }}>{formatRupiah(data.pzakat ?? 0)}</td>
            <td colSpan={2} style={{ paddingBottom: '4px' }}></td>
          </tr>

          {/* Total Deductions Row */}
          <tr>
            <td colSpan={3} style={{ padding: '4px 6px 2px 6px', fontWeight: 'bold', fontSize: '12.5px' }}>Jumlah Potongan</td>
            <td style={{ padding: '4px 0 2px 0', fontWeight: 'bold', fontSize: '12.5px', borderBottom: '1px solid #000000' }}>Rp.</td>
            <td style={{ textAlign: 'right', padding: '4px 8px 2px 0', fontWeight: 'bold', fontSize: '12.5px', borderBottom: '1px solid #000000' }}>
              {formatRupiah(astek_dlpk)}
            </td>
          </tr>

          {/* Net Income Row */}
          <tr>
            <td colSpan={3} style={{ padding: '4px 6px 6px 6px', fontWeight: 'bold', fontSize: '12.5px' }}>Pendapatan Bersih</td>
            <td style={{ padding: '4px 0 6px 0', fontWeight: 'bold', fontSize: '12.5px' }}>Rp.</td>
            <td style={{ textAlign: 'right', padding: '4px 8px 6px 0', fontWeight: 'bold', fontSize: '12.5px' }}>
              {formatRupiah(data.gajibersih ?? 0)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Signature Section */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '12px',
          marginTop: '16px'
        }}
      >
        <tbody>
          <tr>
            <td style={{ width: '50%' }}></td>
            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
              Bogor, {data.bulan} {data.tahun}
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'center', fontWeight: 'bold', paddingTop: '6px' }}>Yang Menerima,</td>
            <td style={{ textAlign: 'center', fontWeight: 'bold', paddingTop: '6px' }}>Yang Menyerahkan,</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'center', fontWeight: 'bold', paddingTop: '45px' }}>
              ({data.nama || ''})
            </td>
            <td style={{ textAlign: 'center', fontWeight: 'bold', paddingTop: '45px' }}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export const SlipGajiAdapter = ({
  apiResponse,
  tipe = '',
  formatRupiah = defaultFormatRupiah
}) => {
  const payload = apiResponse?.data ?? apiResponse ?? {};

  if (tipe === 'dosen') {
    return <SlipGajiDosen data={payload} formatRupiah={formatRupiah} />;
  }

  return <SlipGajiPegawai data={payload} formatRupiah={formatRupiah} />;
};

export const SlipGajiPage = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const currentMonthNum = new Date().getMonth() + 1;
  const currentYearNum = new Date().getFullYear();

  const [selectedMonth, setSelectedMonth] = useState(currentMonthNum);
  const [selectedYear, setSelectedYear] = useState(currentYearNum);
  const [loading, setLoading] = useState(true);
  const [payrollData, setPayrollData] = useState(null);

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

  const yearsList = Array.from({ length: currentYearNum - 2000 + 1 }, (_, i) => currentYearNum - i);

  const fetchPayroll = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/api/v2/payroll?bulan=${selectedMonth}&tahun=${selectedYear}`);
      let data = null;
      if (res && res.data) {
        data = Array.isArray(res.data) ? res.data[0] : res.data;
      } else if (res && typeof res === 'object') {
        data = res;
      }

      if (data) {
        setPayrollData(data);
      }
    } catch (err) {
      console.warn('Backend /api/v2/payroll note:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayroll();
  }, [selectedMonth, selectedYear]);

  const selectedMonthName = monthNames.find((m) => m.value === selectedMonth)?.label || 'Januari';

  const handlePrint = () => {
    window.print();
    if (showToast) showToast('Mencetak Slip Gaji Resmi UNPAK...', 'info');
  };

  const payloadWithFallback = {
    bulan: selectedMonthName,
    tahun: selectedYear,
    nama: user?.name,
    ...payrollData
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center', width: '100%' }}>
      {/* Header Action Controls */}
      <div
        className="bm-card no-print"
        style={{
          width: '100%',
          maxWidth: '680px',
          padding: '20px 24px',
          background: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Periode:</span>
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
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={fetchPayroll}
            className="bm-btn-outline"
            style={{ height: '38px', padding: '0 14px' }}
            title="Refresh Data Backend"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handlePrint}
            className="bm-btn-emerald"
            style={{ height: '38px', padding: '0 18px', background: '#0f172a' }}
          >
            <Printer size={16} />
            <span>Cetak / PDF</span>
          </button>
        </div>
      </div>

      {/* Slip Gaji Output Paper Document Container */}
      <div
        id="official-slip-gaji"
        style={{
          width: '100%',
          maxWidth: '560px',
          background: '#ffffff',
          border: '1.5px solid #000000',
          padding: '16px 20px',
          boxShadow: '0 8px 20px rgba(0, 0, 0, 0.06)',
          boxSizing: 'border-box',
        }}
      >
        <SlipGajiAdapter apiResponse={payloadWithFallback} tipe={payloadWithFallback.status === 'DOSEN' ? 'dosen' : 'pegawai'} />
      </div>
    </div>
  );
};

export default SlipGajiPage;
