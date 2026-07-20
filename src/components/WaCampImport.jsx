import { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

function normalizePhone(raw) {
  if (!raw) return null;
  let phone = String(raw).trim();
  phone = phone.replace(/[\s\-\(\)\.]/g, '');
  phone = phone.replace(/^\+/, '');
  if (phone.length === 12 && phone.startsWith('91')) phone = phone.slice(2);
  if (phone.length === 11 && phone.startsWith('0')) phone = phone.slice(1);
  if (!/^\d+$/.test(phone)) return null;
  if (phone.length !== 10) return null;
  return phone;
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
  const wb = XLSX.read(arrBuf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

/**
 * Excel/CSV upload -> phone + template-variable column mapping -> sender_list preview.
 * `variables` = template's WaTempVar rows ([{ var_key, display_label }]).
 */
export default function WaCampImport({ variables = [], value = [], onChange }) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [phoneColumn, setPhoneColumn] = useState('');
  const [varColumnMap, setVarColumnMap] = useState({});
  const [uploadError, setUploadError] = useState('');
  const [skippedCount, setSkippedCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const hasMapping = rawRows.length > 0;

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
      setFileName(file.name);
      setRawRows(nonEmpty);
      setColumns(cols);
      const guessedPhoneCol = cols.find((c) => /phone|mobile|contact/i.test(c)) || '';
      setPhoneColumn(guessedPhoneCol);
      setVarColumnMap({});
    } catch (err) {
      setUploadError(err.message || 'Unable to parse file.');
    } finally {
      setBusy(false);
    }
  };

  const buildSenderList = () => {
    if (!phoneColumn) {
      setUploadError('Select which column contains the phone number.');
      return;
    }
    setUploadError('');
    let skipped = 0;
    const list = [];
    rawRows.forEach((row) => {
      const phone = normalizePhone(row[phoneColumn]);
      if (!phone) {
        skipped += 1;
        return;
      }
      const vars = {};
      variables.forEach((v) => {
        const col = varColumnMap[v.var_key];
        if (col) vars[v.var_key] = String(row[col] ?? '').trim();
      });
      list.push({ phone, variables: vars });
    });
    setSkippedCount(skipped);
    onChange(list);
  };

  const removeRow = (index) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const resetUpload = () => {
    setFileName('');
    setRawRows([]);
    setColumns([]);
    setPhoneColumn('');
    setVarColumnMap({});
    setUploadError('');
    setSkippedCount(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const previewVarKeys = useMemo(() => variables.map((v) => v.var_key).filter(Boolean), [variables]);

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
        <button type="button" className="nb-secondary-btn" onClick={() => fileInputRef.current?.click()} disabled={busy}>
          {busy ? 'Reading...' : fileName ? `Change file (${fileName})` : 'Upload Excel / CSV'}
        </button>
        {hasMapping && (
          <button type="button" className="nb-input-action-btn" onClick={resetUpload}>
            Clear
          </button>
        )}
      </div>

      {uploadError && <div className="nb-error" style={{ marginTop: 8 }}>{uploadError}</div>}

      {hasMapping && (
        <div style={{ marginTop: 12, padding: 12, border: '1px solid #e5e7eb', borderRadius: 10 }}>
          <div className="nb-form-grid nb-form-grid-2">
            <label>
              <span>Phone Column *</span>
              <select value={phoneColumn} onChange={(e) => setPhoneColumn(e.target.value)}>
                <option value="">Select column</option>
                {columns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            {variables.map((v) => (
              <label key={v.var_key}>
                <span>{v.display_label || `Variable ${v.var_key}`}</span>
                <select
                  value={varColumnMap[v.var_key] || ''}
                  onChange={(e) => setVarColumnMap((prev) => ({ ...prev, [v.var_key]: e.target.value }))}
                >
                  <option value="">None</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button type="button" className="nb-add-btn" style={{ marginTop: 10 }} onClick={buildSenderList}>
            Build Sender List ({rawRows.length} rows)
          </button>
          {skippedCount > 0 && (
            <div className="nb-error" style={{ marginTop: 8 }}>
              {skippedCount} row(s) skipped — invalid or missing phone number.
            </div>
          )}
        </div>
      )}

      {value.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>
            Sender List ({value.length})
          </span>
          <div className="nb-left-list" style={{ marginTop: 6, maxHeight: 260, overflowY: 'auto' }}>
            {value.map((entry, index) => (
              <div key={`${entry.phone}-${index}`} className="nb-left-item" style={{ cursor: 'default' }}>
                <div className="nb-left-item-body">
                  <div className="nb-left-item-title">{entry.phone}</div>
                  {previewVarKeys.length > 0 && (
                    <div className="nb-left-item-sub">
                      {previewVarKeys
                        .map((key) => `${key}: ${entry.variables?.[key] || '-'}`)
                        .join(' • ')}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="nb-input-action-btn"
                  onClick={() => removeRow(index)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
