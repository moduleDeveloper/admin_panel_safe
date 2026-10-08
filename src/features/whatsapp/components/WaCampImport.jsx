import { useRef, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { fetchWaTempColumns } from '../services/waTemplateService';

// With `cellDates: true`, Excel cells formatted as Date/Time come through as
// JS Date objects instead of raw serial numbers (e.g. 46305, 0.5). SheetJS
// constructs these using UTC components, so UTC getters must be used here —
// local getters would shift the value by the browser's timezone offset. A
// pure time cell lands on the workbook's epoch-anchor date (year <= 1900) —
// only its hours/minutes are meaningful there.
function formatCellValue(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return value;

  const pad = (n) => String(n).padStart(2, '0');
  const isTimeOnly = value.getUTCFullYear() <= 1900;
  if (isTimeOnly) {
    return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
  }

  const datePart = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  const hasTimeComponent = value.getUTCHours() !== 0 || value.getUTCMinutes() !== 0 || value.getUTCSeconds() !== 0;
  return hasTimeComponent ? `${datePart} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}` : datePart;
}

async function parseRowsFromFile(file) {
  if (/\.csv$/i.test(file.name)) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data || []),
        error: reject,
      });
    });
  }
  const arrBuf = await file.arrayBuffer();
  const wb = XLSX.read(arrBuf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return rows.map((row) => {
    const formatted = {};
    Object.entries(row).forEach(([key, val]) => {
      formatted[key] = formatCellValue(val);
    });
    return formatted;
  });
}

/**
 * Excel/CSV upload — parses the file and hands the raw rows to the parent as-is.
 * Phone cleanup, column validation and the actual WaCamp insert all happen
 * server-side in the wa_camp_curi RPC when the parent's Send button is clicked.
 */
export default function WaCampImport({ value = [], onChange, templateId = '', trustId = '' }) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const handleFile = async (file) => {
    if (!file) return;
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      setUploadError('Only .csv or .xlsx files are accepted');
      return;
    }
    setUploadError('');
    setBusy(true);
    try {
      const parsed = await parseRowsFromFile(file);
      const nonEmpty = parsed.filter((row) =>
        Object.values(row).some((val) => String(val ?? '').trim() !== '')
      );
      const cols = nonEmpty.length ? Object.keys(nonEmpty[0]) : [];
      if (!cols.some((c) => c.trim().toLowerCase() === 'phone')) {
        setUploadError('File must have a "phone" column — use Download Excel to get the right format.');
        return;
      }
      setFileName(file.name);
      onChange(nonEmpty);
    } catch (err) {
      setUploadError(err.message || 'Unable to parse file.');
    } finally {
      setBusy(false);
    }
  };

  const resetUpload = () => {
    setFileName('');
    setUploadError('');
    onChange([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadTemplate = async () => {
    if (!templateId) return;
    setDownloading(true);
    setDownloadError('');

    const { data, error } = await fetchWaTempColumns(templateId, trustId);
    if (error || !Array.isArray(data?.columns) || !data.columns.length) {
      setDownloadError(error?.message || 'Unable to fetch template columns.');
      setDownloading(false);
      return;
    }

    const worksheet = XLSX.utils.aoa_to_sheet([data.columns]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sender List');
    XLSX.writeFile(workbook, 'sender-list-template.xlsx');
    setDownloading(false);
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx"
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <div className="nb-input-with-actions">
        <button
          type="button"
          className="nb-secondary-btn"
          onClick={handleDownloadTemplate}
          disabled={downloading || !templateId}
          title={templateId ? 'Download a blank Excel with the right columns' : 'Select a template first'}
        >
          {downloading ? 'Preparing...' : 'Download Excel'}
        </button>
      </div>

      <div className="nb-input-with-actions" style={{ marginTop: 10 }}>
        <button type="button" className="nb-secondary-btn" onClick={() => fileInputRef.current?.click()} disabled={busy}>
          {busy ? 'Reading...' : fileName ? `Change file (${fileName})` : 'Upload Excel / CSV'}
        </button>
        {value.length > 0 && (
          <button type="button" className="nb-input-action-btn" onClick={resetUpload}>
            Clear
          </button>
        )}
      </div>

      {downloadError && <div className="nb-error" style={{ marginTop: 8 }}>{downloadError}</div>}
      {uploadError && <div className="nb-error" style={{ marginTop: 8 }}>{uploadError}</div>}

      {value.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {value.length} member(s) found in {fileName || 'the uploaded file'}.
        </div>
      )}
    </div>
  );
}
