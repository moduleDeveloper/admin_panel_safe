import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../../../core/components/PageHeader';
import Sidebar from '../../../core/components/Sidebar';
import {
  createBankDetail,
  fetchBankDetailsByTrust,
  updateBankDetail,
  uploadBankQr,
} from '../services/bankDetailsService';
import {
  BANK_FIELD_MAX_LENGTH,
  BANK_VALIDATED_FIELDS,
  sanitizeBankField,
  validateBankForm,
} from '../utils/bankValidation';
import '../../extra/pages/NoticeboardPage.css';

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatSize(value) {
  if (value === null || value === undefined || value === '') return '-';
  return `${value} KB`;
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '-';
  const num = Number(value);
  return Number.isFinite(num) ? `${num}%` : '-';
}

function getInitials(value = '') {
  const safe = String(value || '').trim();
  if (!safe) return 'B';
  return safe.charAt(0).toUpperCase();
}

function maskSensitive(value = '') {
  const str = String(value || '').trim();
  if (!str) return '-';
  if (str.length <= 4) return str;
  const visible = str.slice(-4);
  const masked = 'X'.repeat(str.length - 4) + visible;
  const groups = [];
  for (let i = masked.length; i > 0; i -= 4) {
    groups.unshift(masked.slice(Math.max(0, i - 4), i));
  }
  return groups.join(' ');
}

function EyeIcon({ open }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10.6 5.2A11 11 0 0 1 12 5c7 0 11 7 11 7a13.7 13.7 0 0 1-3.4 4.1M6.6 6.6C3.7 8.4 1 12 1 12s4 7 11 7a10.4 10.4 0 0 0 4.4-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon({ done }) {
  return done ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

// One label/value tile. Sensitive values are masked with a show/hide toggle;
// copyable values get a copy button with a short "copied" tick.
function DetailItem({ label, value, sensitive = false, copyable = false, format }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const raw = String(value ?? '').trim();
  const hasValue = raw.length > 0;

  let shown = 'Not added';
  if (hasValue) shown = sensitive && !revealed ? maskSensitive(raw) : format ? format(value) : raw;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`nb-detail-item${hasValue ? '' : ' is-empty'}`}>
      <span className="nb-detail-label">{label}</span>
      <div className="nb-detail-value-row">
        <strong className="nb-detail-value" title={hasValue && (!sensitive || revealed) ? raw : undefined}>
          {shown}
        </strong>
        {hasValue && (sensitive || copyable) && (
          <div className="nb-detail-actions">
            {sensitive && (
              <button
                type="button"
                className="nb-detail-action"
                onClick={() => setRevealed((prev) => !prev)}
                title={revealed ? `Hide ${label}` : `Show ${label}`}
                aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
              >
                <EyeIcon open={revealed} />
              </button>
            )}
            {copyable && (
              <button
                type="button"
                className={`nb-detail-action${copied ? ' is-done' : ''}`}
                onClick={handleCopy}
                title={copied ? 'Copied' : `Copy ${label}`}
                aria-label={copied ? 'Copied' : `Copy ${label}`}
              >
                <CopyIcon done={copied} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailSection({ title, icon, children }) {
  return (
    <section className="nb-detail-section">
      <h4 className="nb-detail-section-title">
        <span className="nb-detail-section-icon" aria-hidden="true">{icon}</span>
        {title}
      </h4>
      <div className="nb-detail-grid">{children}</div>
    </section>
  );
}

// Storage URLs are cross-origin, so <a download> would just open the file:
// fetch it as a blob to force a real download, falling back to a new tab.
async function downloadQr(url, name) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('fetch failed');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${String(name || 'bank').trim().replace(/[^\w-]+/g, '_') || 'bank'}-qr.${ext}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

const EMPTY_FORM = {
  name: '',
  mobile: '',
  email_id: '',
  qr: '',
  size: null,
  beneficiary_name: '',
  account_no: '',
  bank_name: '',
  branch: '',
  ifsc_code: '',
  swift_code: '',
  upi_id: '',
  razorpay_id: '',
  vendor_share: '',
};

export default function BankDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null } = location.state || {};
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'company-details';
  const trustId = trust?.id || null;
  const isCreateRoute = location.pathname === '/company-details/bank-details/create';
  const isEditRoute = location.pathname === '/company-details/bank-details/edit';
  const isFormRoute = isCreateRoute || isEditRoute;
  const routeEditId = location.state?.editId || new URLSearchParams(location.search).get('id') || '';
  const qrFileInputRef = useRef(null);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [, setActiveMenuId] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [qrUploading, setQrUploading] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const [form, setForm] = useState(EMPTY_FORM);
  const [formFieldVisible, setFormFieldVisible] = useState({
    account_no: false,
    ifsc_code: false,
    swift_code: false,
    upi_id: false,
    razorpay_id: false,
  });

  const toggleFormVisible = (field) => setFormFieldVisible((prev) => ({ ...prev, [field]: !prev[field] }));

  // ── Validation: errors show after a field is left (blur) or on Save ──
  const [touched, setTouched] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const validation = useMemo(() => validateBankForm(form), [form]);

  const fieldError = (field) =>
    touched[field] || submitAttempted ? validation.errors[field] || '' : '';

  const fieldProps = (field) => {
    const message = fieldError(field);
    return {
      value: form[field] ?? '',
      onChange: (e) => {
        const value = sanitizeBankField(field, e.target.value);
        setForm((prev) => ({ ...prev, [field]: value }));
      },
      onBlur: () => {
        setTouched((prev) => ({ ...prev, [field]: true }));
        setForm((prev) => ({ ...prev, [field]: String(prev[field] ?? '').trim() }));
      },
      maxLength: BANK_FIELD_MAX_LENGTH[field],
      'data-field': field,
      'aria-invalid': message ? 'true' : undefined,
      className: message ? 'nb-input-invalid' : undefined,
    };
  };

  const renderFieldError = (field) => {
    const message = fieldError(field);
    return message ? <small className="nb-field-error" role="alert">{message}</small> : null;
  };

  const invalidCount = Object.keys(validation.errors).length;
  const validationSummary = !submitAttempted || validation.isValid
    ? ''
    : invalidCount
      ? `Please fix ${invalidCount} highlighted field${invalidCount > 1 ? 's' : ''}.`
      : validation.formError;

  const resetValidation = () => {
    setTouched({});
    setSubmitAttempted(false);
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    resetValidation();
    setFormError('');
    setEditingId(null);
    setFormFieldVisible({ account_no: false, ifsc_code: false, swift_code: false, upi_id: false, razorpay_id: false });
    if (qrFileInputRef.current) qrFileInputRef.current.value = '';
  };

  const goBackToDashboard = () => {
    navigate('/dashboard', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
  };

  const goToList = () => {
    navigate('/company-details/bank-details', {
      replace: true,
      state: { userName, trust, sidebarNavKey: currentSidebarNavKey },
    });
  };

  useEffect(() => {
    if (!trustId) {
      navigate('/dashboard', { replace: true, state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
      return;
    }

    const load = async () => {
      setLoading(true);
      setError('');
      const { data, error: fetchError } = await fetchBankDetailsByTrust(trustId);
      if (fetchError) setError(fetchError.message || 'Unable to load bank details.');
      setRecords(data || []);
      setLoading(false);
    };

    load();
  }, [navigate, trustId, userName, trust, currentSidebarNavKey]);

  useEffect(() => {
    const closeMenu = () => setActiveMenuId(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

  const filteredRecords = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    let list = [...records];

    if (term) {
      list = list.filter((item) => {
        const name = String(item?.name || '').toLowerCase();
        const bankName = String(item?.bank_name || '').toLowerCase();
        const accountNo = String(item?.account_no || '').toLowerCase();
        return name.includes(term) || bankName.includes(term) || accountNo.includes(term);
      });
    }

    list.sort((left, right) => String(right?.created_at || '').localeCompare(String(left?.created_at || '')));
    return list;
  }, [records, deferredSearch]);

  const selectedRecord = useMemo(
    () => filteredRecords.find((item) => item.id === selectedId) || null,
    [filteredRecords, selectedId]
  );

  useEffect(() => {
    if (loading || isFormRoute) return;
    if (!filteredRecords.length) {
      setSelectedId('');
      return;
    }
    const exists = filteredRecords.some((item) => item.id === selectedId);
    if (!exists) setSelectedId(filteredRecords[0].id);
  }, [filteredRecords, selectedId, loading, isFormRoute]);

  useEffect(() => {
    if (!isFormRoute) return;

    if (isCreateRoute) {
      resetForm();
      return;
    }

    if (!isEditRoute) return;
    const targetId = String(routeEditId || selectedId || '');
    if (!targetId) return;
    const target = records.find((item) => String(item.id) === targetId);
    if (!target) return;

    setForm({
      name: target.name || '',
      mobile: target.mobile || '',
      email_id: target.email_id || '',
      qr: target.qr || '',
      size: target.size ?? null,
      beneficiary_name: target.beneficiary_name || '',
      account_no: target.account_no || '',
      bank_name: target.bank_name || '',
      branch: target.branch || '',
      ifsc_code: target.ifsc_code || '',
      swift_code: target.swift_code || '',
      upi_id: target.upi_id || '',
      razorpay_id: target.razorpay_id || '',
      vendor_share: target.vendor_share == null ? '' : String(target.vendor_share),
    });
    setTouched({});
    setSubmitAttempted(false);
    setEditingId(target.id);
    setFormError('');
  }, [isFormRoute, isCreateRoute, isEditRoute, routeEditId, selectedId, records]);

  const handleQrFile = async (file) => {
    if (!file) return;
    setFormError('');
    setQrUploading(true);
    const { data, error: uploadError } = await uploadBankQr(trustId, file);
    setQrUploading(false);
    if (uploadError) {
      setFormError(uploadError.message || 'Unable to upload QR image.');
      return;
    }
    setForm((prev) => ({ ...prev, qr: data.url, size: data.sizeKb }));
  };

  const handleSave = async () => {
    setFormError('');
    setSubmitAttempted(true);

    const result = validateBankForm(form);
    if (!result.isValid) {
      const firstInvalid = BANK_VALIDATED_FIELDS.find((field) => result.errors[field]);
      if (firstInvalid) {
        const input = document.querySelector(`[data-field="${firstInvalid}"]`);
        input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        input?.focus({ preventScroll: true });
      }
      return;
    }

    setSaving(true);
    const trimmed = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
    );
    const payload = { ...trimmed, trust_id: trustId };

    if (editingId) {
      const { data, error: updateError } = await updateBankDetail(editingId, payload, trustId);
      if (updateError) {
        setFormError(updateError.message || 'Unable to update record.');
        setSaving(false);
        return;
      }
      setRecords((prev) => prev.map((item) => (item.id === editingId ? data : item)));
    } else {
      const { data, error: createError } = await createBankDetail(payload);
      if (createError) {
        setFormError(createError.message || 'Unable to create record.');
        setSaving(false);
        return;
      }
      setRecords((prev) => [data, ...prev]);
      setSelectedId(data.id);
    }

    resetForm();
    setSaving(false);
    if (isFormRoute) goToList();
  };

  const handleEdit = (item) => {
    setForm({
      name: item.name || '',
      mobile: item.mobile || '',
      email_id: item.email_id || '',
      qr: item.qr || '',
      size: item.size ?? null,
      beneficiary_name: item.beneficiary_name || '',
      account_no: item.account_no || '',
      bank_name: item.bank_name || '',
      branch: item.branch || '',
      ifsc_code: item.ifsc_code || '',
      swift_code: item.swift_code || '',
      upi_id: item.upi_id || '',
      razorpay_id: item.razorpay_id || '',
      vendor_share: item.vendor_share == null ? '' : String(item.vendor_share),
    });
    resetValidation();
    setEditingId(item.id);
    setFormError('');
    setActiveMenuId(null);
    navigate(`/company-details/bank-details/edit?id=${item.id}`, {
      state: { userName, trust, editId: item.id, sidebarNavKey: currentSidebarNavKey },
    });
  };

  if (!trustId) return null;

  return (
    <div className="nb-root nb-bank">
      <Sidebar
        trustName={trust?.name || 'Trust'}
        onDashboard={() => navigate('/dashboard', { state: { userName, trust, sidebarNavKey: 'dashboard' } })}
        onLogout={() => navigate('/login')}
      />

      <main className="nb-main">
        <PageHeader
          title="Bank Details"
          subtitle="Manage trust bank account details"
          onBack={() => {
            if (isFormRoute) {
              goToList();
              return;
            }
            goBackToDashboard();
          }}
        />

        <section className="nb-content">
          {error && <div className="nb-error">{error}</div>}

          {isFormRoute && (
            <div className="nb-form-card">
              <h3>{editingId ? 'Edit Bank Details' : 'Add Bank Details'}</h3>
              <div className="nb-form-layout">
                <section className="nb-form-section">
                  <h4 className="nb-section-title">Contact Details</h4>
                  <div className="nb-form-grid nb-form-grid-2">
                    <label>
                      <span>Name *</span>
                      <input
                        {...fieldProps('name')}
                        placeholder="Enter contact name"
                        autoComplete="off"
                      />
                      {renderFieldError('name')}
                    </label>
                    <label>
                      <span>Mobile *</span>
                      <input
                        {...fieldProps('mobile')}
                        inputMode="numeric"
                        placeholder="Enter 10-digit mobile number"
                        autoComplete="off"
                      />
                      {renderFieldError('mobile')}
                    </label>
                    <label className="nb-span-2">
                      <span>Email ID</span>
                      <input
                        {...fieldProps('email_id')}
                        placeholder="Enter email address"
                        autoComplete="off"
                      />
                      {renderFieldError('email_id')}
                    </label>
                  </div>
                </section>

                <section className="nb-form-section">
                  <h4 className="nb-section-title">Bank Details</h4>
                  <div className="nb-form-grid nb-form-grid-2">
                    <label>
                      <span>Beneficiary Name</span>
                      <input
                        {...fieldProps('beneficiary_name')}
                        placeholder="Enter beneficiary name"
                        autoComplete="off"
                      />
                      {renderFieldError('beneficiary_name')}
                    </label>
                    <label>
                      <span>Account No.</span>
                      <div className="nb-input-with-actions">
                        <input
                          type={formFieldVisible.account_no ? 'text' : 'password'}
                          {...fieldProps('account_no')}
                          inputMode="numeric"
                          placeholder="Enter account number"
                          name="bank_account_no_field"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="nb-input-action-btn"
                          onClick={() => toggleFormVisible('account_no')}
                          title={formFieldVisible.account_no ? 'Hide' : 'Show'}
                        >
                          <EyeIcon open={formFieldVisible.account_no} />
                        </button>
                      </div>
                      {renderFieldError('account_no')}
                    </label>
                    <label>
                      <span>Bank Name</span>
                      <input
                        {...fieldProps('bank_name')}
                        placeholder="Enter bank name"
                        autoComplete="off"
                      />
                      {renderFieldError('bank_name')}
                    </label>
                    <label>
                      <span>Branch</span>
                      <input
                        {...fieldProps('branch')}
                        placeholder="Enter branch"
                        autoComplete="off"
                      />
                      {renderFieldError('branch')}
                    </label>
                    <label>
                      <span>IFSC Code</span>
                      <div className="nb-input-with-actions">
                        <input
                          type={formFieldVisible.ifsc_code ? 'text' : 'password'}
                          {...fieldProps('ifsc_code')}
                          placeholder="Enter IFSC code"
                          name="bank_ifsc_code_field"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="nb-input-action-btn"
                          onClick={() => toggleFormVisible('ifsc_code')}
                          title={formFieldVisible.ifsc_code ? 'Hide' : 'Show'}
                        >
                          <EyeIcon open={formFieldVisible.ifsc_code} />
                        </button>
                      </div>
                      {renderFieldError('ifsc_code')}
                    </label>
                    <label>
                      <span>SWIFT Code</span>
                      <div className="nb-input-with-actions">
                        <input
                          type={formFieldVisible.swift_code ? 'text' : 'password'}
                          {...fieldProps('swift_code')}
                          placeholder="Enter SWIFT code"
                          name="bank_swift_code_field"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="nb-input-action-btn"
                          onClick={() => toggleFormVisible('swift_code')}
                          title={formFieldVisible.swift_code ? 'Hide' : 'Show'}
                        >
                          <EyeIcon open={formFieldVisible.swift_code} />
                        </button>
                      </div>
                      {renderFieldError('swift_code')}
                    </label>
                    <label>
                      <span>UPI ID</span>
                      <div className="nb-input-with-actions">
                        <input
                          type={formFieldVisible.upi_id ? 'text' : 'password'}
                          {...fieldProps('upi_id')}
                          placeholder="Enter UPI ID"
                          name="bank_upi_id_field"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="nb-input-action-btn"
                          onClick={() => toggleFormVisible('upi_id')}
                          title={formFieldVisible.upi_id ? 'Hide' : 'Show'}
                        >
                          <EyeIcon open={formFieldVisible.upi_id} />
                        </button>
                      </div>
                      {renderFieldError('upi_id')}
                    </label>
                    <label>
                      <span>Razorpay ID</span>
                      <div className="nb-input-with-actions">
                        <input
                          type={formFieldVisible.razorpay_id ? 'text' : 'password'}
                          {...fieldProps('razorpay_id')}
                          placeholder="Enter Razorpay ID"
                          name="bank_razorpay_id_field"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="nb-input-action-btn"
                          onClick={() => toggleFormVisible('razorpay_id')}
                          title={formFieldVisible.razorpay_id ? 'Hide' : 'Show'}
                        >
                          <EyeIcon open={formFieldVisible.razorpay_id} />
                        </button>
                      </div>
                      {renderFieldError('razorpay_id')}
                    </label>
                    <label>
                      <span>Vendor Share (%)</span>
                      <div className="nb-input-suffix-wrap">
                        <input
                          {...fieldProps('vendor_share')}
                          inputMode="decimal"
                          placeholder="e.g. 12.5"
                          autoComplete="off"
                        />
                        <b className="nb-input-suffix" aria-hidden="true">%</b>
                      </div>
                      {renderFieldError('vendor_share')}
                    </label>
                  </div>
                </section>

                <section className="nb-form-section">
                  <h4 className="nb-section-title">QR Code</h4>
                  <input
                    ref={qrFileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleQrFile(e.target.files?.[0])}
                  />
                  <div className="nb-input-with-actions">
                    <button
                      type="button"
                      className="nb-secondary-btn"
                      onClick={() => qrFileInputRef.current?.click()}
                      disabled={qrUploading}
                    >
                      {qrUploading ? 'Uploading...' : form.qr ? 'Change QR Image' : 'Upload QR Image'}
                    </button>
                    {form.qr && (
                      <button
                        type="button"
                        className="nb-input-action-btn"
                        onClick={() => setForm((prev) => ({ ...prev, qr: '', size: null }))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {form.qr && (
                    <div style={{ marginTop: 10 }}>
                      <img src={form.qr} alt="QR preview" style={{ width: 120, height: 120, objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 8 }} />
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Size: {formatSize(form.size)}</div>
                    </div>
                  )}
                </section>
              </div>

              {validationSummary && <div className="nb-error" role="alert">{validationSummary}</div>}
              {formError && <div className="nb-error">{formError}</div>}
              <div className="nb-form-actions">
                <button
                  className="nb-secondary-btn"
                  onClick={() => {
                    resetForm();
                    goToList();
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button className="nb-add-btn" onClick={handleSave} disabled={saving || qrUploading} type="button">
                  {saving ? 'Saving...' : editingId ? 'Update Details' : 'Save Details'}
                </button>
              </div>
            </div>
          )}

          {!isFormRoute && loading && <div className="nb-empty">Loading bank details...</div>}

          {!isFormRoute && !loading && records.length === 0 && (
            <div className="nb-empty">
              <button
                className="nb-add-btn nb-list-add-btn"
                type="button"
                onClick={() => navigate('/company-details/bank-details/create', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } })}
              >
                Add Bank Details
              </button>
              <div>No bank details found for this trust. Add your first one.</div>
            </div>
          )}

          {!isFormRoute && !loading && records.length > 0 && (
            <section className="nb-profile-layout">
              <aside className="nb-left-panel">
                <div className="nb-left-head">
                  <h3>All Bank Details</h3>
                  <span className="nb-left-count">{records.length}</span>
                </div>

                <input
                  className="nb-left-search"
                  placeholder="Search by name, bank, account..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />

                <button
                  className="nb-add-btn nb-list-add-btn nb-bank-add-btn"
                  type="button"
                  onClick={() => navigate('/company-details/bank-details/create', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } })}
                >
                  <span className="nb-bank-add-icon" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span>Add Bank Details</span>
                </button>

                <div className="nb-left-list">
                  {filteredRecords.length === 0 && (
                    <div className="nb-empty">No record matched your search.</div>
                  )}
                  {filteredRecords.map((item) => (
                    <button
                      key={item.id}
                      className={`nb-left-item ${selectedId === item.id ? 'active' : ''}`}
                      onClick={() => setSelectedId(item.id)}
                      type="button"
                    >
                      <div className="nb-left-avatar">{getInitials(item?.name)}</div>
                      <div className="nb-left-item-body">
                        <div className="nb-left-item-title" title={item.name || ''}>{item.name || '-'}</div>
                        <div className="nb-left-item-sub">
                          <span className="nb-left-item-bank">{item.bank_name || 'No bank'}</span>
                          <span className="nb-left-item-dot" aria-hidden="true">•</span>
                          <span className="nb-left-item-mobile">{item.mobile || '-'}</span>
                        </div>
                      </div>
                      <svg className="nb-left-item-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  ))}
                </div>
              </aside>

              <section className="nb-right-panel">
                {!selectedRecord && <div className="nb-empty">Select an entry to view details.</div>}

                {selectedRecord && (
                  <>
                    <div className="nb-profile-hero nb-bank-hero">
                      <div className="nb-profile-hero-left">
                        <div className="nb-profile-avatar">{getInitials(selectedRecord.name)}</div>
                        <div className="nb-bank-hero-info">
                          <h3 title={selectedRecord.name || ''}>{selectedRecord.name || '-'}</h3>
                          <p>{selectedRecord.bank_name || 'No bank'} • {selectedRecord.mobile || '-'}</p>
                        </div>
                      </div>
                      <div className="nb-bank-hero-actions">
                        <button
                          type="button"
                          className="nb-bank-btn nb-bank-btn-edit"
                          onClick={() => handleEdit(selectedRecord)}
                        >
                          <svg className="nb-bank-btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M12 20h9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                            <path d="M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
                          </svg>
                          <span>Edit</span>
                        </button>
                      </div>
                    </div>

                    {/* key: reset revealed/copied state when another record is selected */}
                    <div className="nb-profile-details nb-bank-details" key={selectedRecord.id}>
                      <DetailSection
                        title="Contact"
                        icon={(
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                          </svg>
                        )}
                      >
                        <DetailItem label="Mobile" value={selectedRecord.mobile} copyable />
                        <DetailItem label="Email" value={selectedRecord.email_id} copyable />
                      </DetailSection>

                      <DetailSection
                        title="Bank Account"
                        icon={(
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      >
                        <DetailItem label="Beneficiary Name" value={selectedRecord.beneficiary_name} copyable />
                        <DetailItem label="Account No." value={selectedRecord.account_no} sensitive copyable />
                        <DetailItem label="Bank Name" value={selectedRecord.bank_name} />
                        <DetailItem label="Branch" value={selectedRecord.branch} />
                        <DetailItem label="IFSC Code" value={selectedRecord.ifsc_code} sensitive copyable />
                        <DetailItem label="SWIFT Code" value={selectedRecord.swift_code} sensitive copyable />
                      </DetailSection>

                      <DetailSection
                        title="Payment"
                        icon={(
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
                            <path d="M2.5 10h19M6.5 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        )}
                      >
                        <DetailItem label="UPI ID" value={selectedRecord.upi_id} sensitive copyable />
                        <DetailItem label="Razorpay ID" value={selectedRecord.razorpay_id} sensitive copyable />
                        <DetailItem label="Vendor Share" value={selectedRecord.vendor_share} format={formatPercent} />
                      </DetailSection>

                      {selectedRecord.qr && (
                        <section className="nb-detail-section">
                          <h4 className="nb-detail-section-title">
                            <span className="nb-detail-section-icon" aria-hidden="true">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                              </svg>
                            </span>
                            QR Code
                          </h4>
                          <div className="nb-qr-card">
                            <a
                              className="nb-qr-frame"
                              href={selectedRecord.qr}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open QR in a new tab"
                            >
                              <img src={selectedRecord.qr} alt={`QR code for ${selectedRecord.name || 'bank details'}`} />
                            </a>
                            <div className="nb-qr-info">
                              <p className="nb-qr-hint">Scan with any UPI app to pay.</p>
                              <span className="nb-qr-meta">File size: {formatSize(selectedRecord.size)}</span>
                              <div className="nb-qr-actions">
                                <button
                                  type="button"
                                  className="nb-qr-btn primary"
                                  onClick={() => downloadQr(selectedRecord.qr, selectedRecord.name)}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                  Download
                                </button>
                                <a
                                  className="nb-qr-btn"
                                  href={selectedRecord.qr}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                  View
                                </a>
                              </div>
                            </div>
                          </div>
                        </section>
                      )}

                      <div className="nb-detail-footer">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <rect x="3" y="5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
                          <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                        Added on {formatDate(selectedRecord.created_at)}
                      </div>
                    </div>
                  </>
                )}
              </section>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}
