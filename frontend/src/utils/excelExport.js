/**
 * Utility for generating and downloading native Microsoft Excel (.xlsx) spreadsheets
 * without any external npm dependencies.
 *
 * Implements standard PKWARE ZIP (STORE uncompressed) and OpenXML (ECMA-376) spreadsheetML.
 * Fully compatible with Microsoft Excel, Google Sheets, LibreOffice Calc, Apple Numbers, and WPS Office.
 */

// 1. Precomputed CRC-32 table (IEEE 802.3 standard)
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

// 2. Minimal PKZip generator
class SimpleZip {
  constructor() {
    this.files = [];
  }

  addFile(name, content) {
    let data;
    if (typeof content === 'string') {
      data = new TextEncoder().encode(content);
    } else if (content instanceof Uint8Array) {
      data = content;
    } else {
      data = new Uint8Array(content);
    }
    this.files.push({ name, data });
  }

  generateUint8Array() {
    const encoder = new TextEncoder();
    let totalLen = 0;

    const prepared = this.files.map((f) => {
      const nameBuf = encoder.encode(f.name);
      const crc = crc32(f.data);
      const size = f.data.length;
      totalLen += (30 + nameBuf.length + size) + (46 + nameBuf.length);
      return { nameBuf, data: f.data, crc, size };
    });
    totalLen += 22; // End of Central Directory

    const out = new Uint8Array(totalLen);
    const view = new DataView(out.buffer);
    let offset = 0;
    const cdOffsets = [];

    // Local file headers + data
    for (const file of prepared) {
      cdOffsets.push(offset);
      view.setUint32(offset, 0x04034b50, true); // Local file header signature
      view.setUint16(offset + 4, 20, true);      // Version needed (2.0)
      view.setUint16(offset + 6, 0x0800, true);  // Flags: bit 11 set for UTF-8
      view.setUint16(offset + 8, 0, true);       // Compression method: 0 (Store)
      view.setUint16(offset + 10, 0, true);      // Mod time
      view.setUint16(offset + 12, 0, true);      // Mod date
      view.setUint32(offset + 14, file.crc, true);
      view.setUint32(offset + 18, file.size, true); // Compressed size
      view.setUint32(offset + 22, file.size, true); // Uncompressed size
      view.setUint16(offset + 26, file.nameBuf.length, true);
      view.setUint16(offset + 28, 0, true);      // Extra field length
      out.set(file.nameBuf, offset + 30);
      out.set(file.data, offset + 30 + file.nameBuf.length);
      offset += 30 + file.nameBuf.length + file.size;
    }

    const cdStart = offset;

    // Central directory records
    for (let i = 0; i < prepared.length; i++) {
      const file = prepared[i];
      const localOffset = cdOffsets[i];
      view.setUint32(offset, 0x02014b50, true); // Central file header signature
      view.setUint16(offset + 4, 20, true);      // Version made by
      view.setUint16(offset + 6, 20, true);      // Version needed
      view.setUint16(offset + 8, 0x0800, true);  // UTF-8 flag
      view.setUint16(offset + 10, 0, true);     // Compression method
      view.setUint16(offset + 12, 0, true);     // Mod time
      view.setUint16(offset + 14, 0, true);     // Mod date
      view.setUint32(offset + 16, file.crc, true);
      view.setUint32(offset + 20, file.size, true);
      view.setUint32(offset + 24, file.size, true);
      view.setUint16(offset + 28, file.nameBuf.length, true);
      view.setUint16(offset + 30, 0, true);     // Extra len
      view.setUint16(offset + 32, 0, true);     // Comment len
      view.setUint16(offset + 34, 0, true);     // Disk start
      view.setUint16(offset + 36, 0, true);     // Internal file attributes
      view.setUint32(offset + 38, 0, true);     // External file attributes
      view.setUint32(offset + 42, localOffset, true); // Offset of local header
      out.set(file.nameBuf, offset + 46);
      offset += 46 + file.nameBuf.length;
    }

    const cdSize = offset - cdStart;

    // End of Central Directory Record (EOCD)
    view.setUint32(offset, 0x06054b50, true);
    view.setUint16(offset + 4, 0, true);       // Disk number
    view.setUint16(offset + 6, 0, true);       // Start disk
    view.setUint16(offset + 8, prepared.length, true);  // Entries on disk
    view.setUint16(offset + 10, prepared.length, true); // Total entries
    view.setUint32(offset + 12, cdSize, true);
    view.setUint32(offset + 16, cdStart, true);
    view.setUint16(offset + 20, 0, true);      // Comment len

    return out;
  }
}

// 3. XML helpers
function xmlEscape(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colToLetter(colIndex) {
  let temp = null;
  let letter = '';
  let col = colIndex + 1;
  while (col > 0) {
    temp = (col - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    col = ((col - temp - 1) / 26) | 0;
  }
  return letter;
}

// Styles definition matching UI theme (Emerald & Modern Soft Badges)
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="8">
    <!-- 0: Regular -->
    <font><name val="Calibri"/><sz val="10"/><color rgb="FF1F2937"/></font>
    <!-- 1: Bold White (Header) -->
    <font><b/><name val="Calibri"/><sz val="10"/><color rgb="FFFFFFFF"/></font>
    <!-- 2: Bold Red (Holiday / Sunday Header) -->
    <font><b/><name val="Calibri"/><sz val="10"/><color rgb="FFDC2626"/></font>
    <!-- 3: Bold Green (Hadir) -->
    <font><b/><name val="Calibri"/><sz val="10"/><color rgb="FF15803D"/></font>
    <!-- 4: Bold Blue (Izin) -->
    <font><b/><name val="Calibri"/><sz val="10"/><color rgb="FF0369A1"/></font>
    <!-- 5: Bold Purple (Cuti) -->
    <font><b/><name val="Calibri"/><sz val="10"/><color rgb="FF6D28D9"/></font>
    <!-- 6: Bold Indigo (SPPD) -->
    <font><b/><name val="Calibri"/><sz val="10"/><color rgb="FF4338CA"/></font>
    <!-- 7: Gray (Empty / -) -->
    <font><name val="Calibri"/><sz val="10"/><color rgb="FF9CA3AF"/></font>
  </fonts>
  <fills count="10">
    <!-- 0: None -->
    <fill><patternFill patternType="none"/></fill>
    <!-- 1: Gray125 -->
    <fill><patternFill patternType="gray125"/></fill>
    <!-- 2: Emerald Green Header (#059669) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FF059669"/></patternFill></fill>
    <!-- 3: Red Light Header (#FEE2E2) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/></patternFill></fill>
    <!-- 4: Green Light Cell (#DCFCE7) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/></patternFill></fill>
    <!-- 5: Blue Light Cell (#E0F2FE) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFE0F2FE"/></patternFill></fill>
    <!-- 6: Purple Light Cell (#F3E8FF) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3E8FF"/></patternFill></fill>
    <!-- 7: Indigo Light Cell (#E0E7FF) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFE0E7FF"/></patternFill></fill>
    <!-- 8: Red Light Cell (#FEF2F2) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF2F2"/></patternFill></fill>
    <!-- 9: Amber Orange Header for Upacara (#D97706) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFD97706"/></patternFill></fill>
  </fills>
  <borders count="2">
    <!-- 0: None -->
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <!-- 1: Thin Gray (#E5E7EB) -->
    <border>
      <left style="thin"><color rgb="FFE5E7EB"/></left>
      <right style="thin"><color rgb="FFE5E7EB"/></right>
      <top style="thin"><color rgb="FFE5E7EB"/></top>
      <bottom style="thin"><color rgb="FFE5E7EB"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="13">
    <!-- 0: Default Normal Left (Border 1) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <!-- 1: Normal Center -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 2: Normal Right -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 3: Header Normal Emerald (White Bold, #059669) -->
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <!-- 4: Header Weekend/Holiday (Red Light, Red Bold) -->
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <!-- 5: Hadir Cell (Green Light #DCFCE7, Green Bold) -->
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 6: Izin Cell (Blue Light #E0F2FE, Blue Bold) -->
    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 7: Cuti Cell (Purple Light #F3E8FF, Purple Bold) -->
    <xf numFmtId="0" fontId="5" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 8: SPPD Cell (Indigo Light #E0E7FF, Indigo Bold) -->
    <xf numFmtId="0" fontId="6" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 9: Libur Cell (Red Light #FEF2F2, Red Regular) -->
    <xf numFmtId="0" fontId="2" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 10: Empty / Dash Cell (Gray text, center) -->
    <xf numFmtId="0" fontId="7" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 11: Total Hadir Badge (Green Bold, soft green fill) -->
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 12: Header Upacara Amber (White Bold, #D97706) -->
    <xf numFmtId="0" fontId="1" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
  </cellXfs>
</styleSheet>`;

export const EXCEL_STYLES = {
  NORMAL_LEFT: 0,
  NORMAL_CENTER: 1,
  NORMAL_RIGHT: 2,
  HEADER_EMERALD: 3,
  HEADER_RED: 4,
  HADIR: 5,
  IZIN: 6,
  CUTI: 7,
  SPPD: 8,
  LIBUR: 9,
  EMPTY: 10,
  TOTAL_HADIR: 11,
  HEADER_AMBER: 12,
};

/**
 * Builds an XLSX binary package as Uint8Array
 * @param {Array<{ name: string, colWidths?: number[], rows: Array<Array<string|number|{ v: any, s: number }>> }>} sheets
 * @returns {Uint8Array}
 */
export function buildXlsx({ sheets }) {
  const zip = new SimpleZip();

  let sheetOverrides = '';
  let wbRels = '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
  let sheetsXml = '';

  for (let i = 0; i < sheets.length; i++) {
    const sheetId = i + 1;
    sheetOverrides += `<Override PartName="/xl/worksheets/sheet${sheetId}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    wbRels += `<Relationship Id="rIdSheet${sheetId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheetId}.xml"/>`;
    sheetsXml += `<sheet name="${xmlEscape(sheets[i].name)}" sheetId="${sheetId}" r:id="rIdSheet${sheetId}"/>`;
  }

  zip.addFile('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetOverrides}
</Types>`);

  zip.addFile('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);

  zip.addFile('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${wbRels}
</Relationships>`);

  zip.addFile('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetsXml}</sheets>
</workbook>`);

  zip.addFile('xl/styles.xml', STYLES_XML);

  for (let sIdx = 0; sIdx < sheets.length; sIdx++) {
    const s = sheets[sIdx];
    let colsXml = '';
    if (s.colWidths && s.colWidths.length > 0) {
      colsXml = '<cols>';
      s.colWidths.forEach((w, idx) => {
        colsXml += `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`;
      });
      colsXml += '</cols>';
    }

    let sheetData = '';
    for (let rIdx = 0; rIdx < s.rows.length; rIdx++) {
      const row = s.rows[rIdx];
      const rowNum = rIdx + 1;
      let rowContent = '';
      for (let cIdx = 0; cIdx < row.length; cIdx++) {
        const cell = row[cIdx];
        const cellRef = colToLetter(cIdx) + rowNum;
        let val = cell;
        let style = 0;
        if (cell && typeof cell === 'object' && 'v' in cell) {
          val = cell.v;
          style = cell.s !== undefined ? cell.s : 0;
        }

        const styleAttr = ` s="${style}"`;
        if (typeof val === 'number') {
          rowContent += `<c r="${cellRef}"${styleAttr}><v>${val}</v></c>`;
        } else {
          rowContent += `<c r="${cellRef}" t="inlineStr"${styleAttr}><is><t>${xmlEscape(val)}</t></is></c>`;
        }
      }
      sheetData += `<row r="${rowNum}">${rowContent}</row>`;
    }

    zip.addFile(`xl/worksheets/sheet${sIdx + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${colsXml}
  <sheetData>${sheetData}</sheetData>
</worksheet>`);
  }

  return zip.generateUint8Array();
}

/**
 * Triggers a browser download of an XLSX Uint8Array buffer
 * @param {string} filename
 * @param {Uint8Array} uint8Array
 */
export function downloadXlsx(filename, uint8Array) {
  if (typeof document === 'undefined') {
    return;
  }
  const blob = new Blob([uint8Array], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Builds and downloads the full Presensi and Upacara matrix reports as a styled .xlsx workbook
 */
/**
 * Helper to safely extract Year and Month from any date string without timezone shift
 */
function parseDateParts(str) {
  if (!str) return null;
  const s = String(str).trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return { year: dt.getFullYear(), month: dt.getMonth() + 1, day: dt.getDate() };
  }
  return null;
}

/**
 * Helper to extract display time (HH:mm) for ceremony attendance
 */
function extractCeremonyTime(record) {
  if (!record) return '07:00';
  const candidates = [record.created_at, record.jam_masuk, record.jam];
  for (const c of candidates) {
    if (!c || typeof c !== 'string') continue;
    if (c.includes(' ')) {
      const p = c.split(' ')[1];
      if (p && p.length >= 5 && /^\d{2}:\d{2}/.test(p)) return p.substring(0, 5);
    }
    if (c.includes('T')) {
      const p = c.split('T')[1];
      if (p && p.startsWith('00:00')) return '07:00';
      if (p && p.length >= 5 && /^\d{2}:\d{2}/.test(p)) return p.substring(0, 5);
    }
    if (/^\d{2}:\d{2}/.test(c)) {
      return c.substring(0, 5);
    }
  }
  return '07:00';
}

/**
 * Builds and downloads the focused matrix report (.xlsx) for the active tab (Presensi Reguler or Upacara)
 */
export function exportLaporanPresensiXlsx({
  employees = [],
  dates = [],
  holidays = new Set(),
  selectedMonth = 1,
  selectedYear = new Date().getFullYear(),
  periodType = 'cutoff',
  mainReportTab = 'presensi',
  ceremonyList = [],
  monthList = [],
  formatJamAbsen = (m, k) => `${m || '-'} - ${k || '-'}`,
  formatJamMasuk = (t) => t || '07:00',
  monthName = '',
}) {
  const periodLabel = periodType === 'calendar' ? 'Bulan_Penuh' : 'Cutoff_Payroll';

  // =========================================================================
  // TAB 1: PRESENSI UPACARA EXPORT
  // =========================================================================
  if (mainReportTab === 'upacara') {
    const upacaraColWidths = [6, 20, 32, 26, 22, 22, 14, ...monthList.map(() => 12)];
    const upacaraHeaders = [
      { v: 'No', s: EXCEL_STYLES.HEADER_EMERALD },
      { v: 'NIP', s: EXCEL_STYLES.HEADER_EMERALD },
      { v: 'Nama Pegawai', s: EXCEL_STYLES.HEADER_EMERALD },
      { v: 'Unit Kerja', s: EXCEL_STYLES.HEADER_EMERALD },
      { v: 'Fakultas', s: EXCEL_STYLES.HEADER_EMERALD },
      { v: 'Prodi', s: EXCEL_STYLES.HEADER_EMERALD },
      { v: 'Total Hadir', s: EXCEL_STYLES.HEADER_EMERALD },
      ...monthList.map((m) => ({
        v: `${m.value} - ${m.short || m.name}`,
        s: EXCEL_STYLES.HEADER_EMERALD,
      })),
    ];

    const upacaraRows = [upacaraHeaders];

    employees.forEach((item, idx) => {
      const p = item.pengguna || {};
      const nip = p.nip || item.kode || '-';
      const nama = p.nama || `Pegawai ${nip}`;
      const unit = p.unit_kerja || p.unit || '-';
      const fak = p.fakultas || '-';
      const prd = p.prodi || '-';

      const cleanNip = String(nip || '').trim();
      const cleanKode = String(item.kode || '').trim();
      const cleanNidn = String(p.nidn || '').trim();

      const empCeremonies = ceremonyList.filter((c) => {
        const cNip = String(c.nip || '').trim();
        const cNidn = String(c.nidn || '').trim();

        const isNipMatch = cNip !== '' && cNip !== '-' && (cNip === cleanNip || cNip === cleanKode);
        const isNidnMatch =
          cNidn !== '' &&
          cNidn !== '-' &&
          cNidn !== '0' &&
          cleanNidn !== '' &&
          cleanNidn !== '-' &&
          cleanNidn !== '0' &&
          cNidn === cleanNidn;

        if (!isNipMatch && !isNidnMatch) return false;

        const parts = parseDateParts(c.tanggal || c.created_at);
        return parts && parts.year === Number(selectedYear);
      });

      const totalUpacara = empCeremonies.length;

      const rowCells = [
        { v: idx + 1, s: EXCEL_STYLES.NORMAL_CENTER },
        { v: nip, s: EXCEL_STYLES.NORMAL_CENTER },
        { v: nama, s: EXCEL_STYLES.NORMAL_LEFT },
        { v: unit, s: EXCEL_STYLES.NORMAL_LEFT },
        { v: fak, s: EXCEL_STYLES.NORMAL_LEFT },
        { v: prd, s: EXCEL_STYLES.NORMAL_LEFT },
        { v: totalUpacara, s: EXCEL_STYLES.TOTAL_HADIR },
      ];

      monthList.forEach((b) => {
        const monthCeremonies = empCeremonies.filter((c) => {
          const parts = parseDateParts(c.tanggal || c.created_at);
          return parts && parts.month === b.value;
        });

        const isAttended = monthCeremonies.length > 0;
        if (isAttended) {
          const firstRecord = monthCeremonies[0];
          const displayTime = extractCeremonyTime(firstRecord);
          rowCells.push({ v: displayTime, s: EXCEL_STYLES.HADIR });
        } else {
          rowCells.push({ v: '-', s: EXCEL_STYLES.EMPTY });
        }
      });

      upacaraRows.push(rowCells);
    });

    const filename = `Laporan_Presensi_Upacara_${selectedYear}.xlsx`;
    const uint8Array = buildXlsx({
      sheets: [{ name: `Presensi Upacara ${selectedYear}`, colWidths: upacaraColWidths, rows: upacaraRows }],
    });
    downloadXlsx(filename, uint8Array);
    return filename;
  }

  // =========================================================================
  // TAB 2: PRESENSI REGULER EXPORT
  // =========================================================================
  const regColWidths = [6, 20, 32, 26, 22, 22, 14, ...dates.map(() => 14)];
  const regHeaders = [
    { v: 'No', s: EXCEL_STYLES.HEADER_EMERALD },
    { v: 'NIP', s: EXCEL_STYLES.HEADER_EMERALD },
    { v: 'Nama Pegawai', s: EXCEL_STYLES.HEADER_EMERALD },
    { v: 'Unit Kerja', s: EXCEL_STYLES.HEADER_EMERALD },
    { v: 'Fakultas', s: EXCEL_STYLES.HEADER_EMERALD },
    { v: 'Prodi', s: EXCEL_STYLES.HEADER_EMERALD },
    { v: 'Total Hadir', s: EXCEL_STYLES.HEADER_EMERALD },
  ];

  dates.forEach((d) => {
    const dKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const isSunday = d.getDay() === 0;
    const isHoliday = holidays.has(dKey);
    const dateLabel = `${d.getDate()}/${d.getMonth() + 1}`;

    regHeaders.push({
      v: dateLabel,
      s: isSunday || isHoliday ? EXCEL_STYLES.HEADER_RED : EXCEL_STYLES.HEADER_EMERALD,
    });
  });

  const regRows = [regHeaders];

  employees.forEach((item, idx) => {
    const p = item.pengguna || {};
    const nip = p.nip || item.kode || '-';
    const nama = p.nama || `Pegawai ${nip}`;
    const unit = p.unit_kerja || p.unit || '-';
    const fak = p.fakultas || '-';
    const prd = p.prodi || '-';
    const records = item.records || [];

    const totalHadir = records.filter((r) => r.type === 'absen' && (r.info?.masuk || r.info?.keluar)).length;

    const rowCells = [
      { v: idx + 1, s: EXCEL_STYLES.NORMAL_CENTER },
      { v: nip, s: EXCEL_STYLES.NORMAL_CENTER },
      { v: nama, s: EXCEL_STYLES.NORMAL_LEFT },
      { v: unit, s: EXCEL_STYLES.NORMAL_LEFT },
      { v: fak, s: EXCEL_STYLES.NORMAL_LEFT },
      { v: prd, s: EXCEL_STYLES.NORMAL_LEFT },
      { v: totalHadir, s: EXCEL_STYLES.TOTAL_HADIR },
    ];

    dates.forEach((d) => {
      const dKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const isSunday = d.getDay() === 0;
      const isHoliday = holidays.has(dKey);

      let cellValue = '-';
      let cellStyle = EXCEL_STYLES.EMPTY;

      if (isSunday || isHoliday) {
        cellValue = 'Libur';
        cellStyle = EXCEL_STYLES.LIBUR;
      }

      const rec = records.find((r) => r.tanggal === dKey);
      if (rec) {
        if (rec.type === 'absen') {
          cellValue = formatJamAbsen(rec.info?.masuk, rec.info?.keluar);
          cellStyle = EXCEL_STYLES.HADIR;
        } else if (rec.type === 'izin') {
          cellValue = 'Izin';
          cellStyle = EXCEL_STYLES.IZIN;
        } else if (rec.type === 'cuti') {
          cellValue = 'Cuti';
          cellStyle = EXCEL_STYLES.CUTI;
        } else if (rec.type === 'sppd') {
          cellValue = 'SPPD';
          cellStyle = EXCEL_STYLES.SPPD;
        }
      }

      rowCells.push({ v: cellValue, s: cellStyle });
    });

    regRows.push(rowCells);
  });

  const filename = `Laporan_Presensi_${monthName || selectedMonth}_${selectedYear}_${periodLabel}.xlsx`;
  const uint8Array = buildXlsx({
    sheets: [{ name: `Presensi ${monthName || selectedMonth} ${selectedYear}`, colWidths: regColWidths, rows: regRows }],
  });
  downloadXlsx(filename, uint8Array);

  return filename;
}
