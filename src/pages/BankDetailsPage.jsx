import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Sidebar from '../components/Sidebar';
import {
  createBankDetail,
  deleteBankDetail,
  fetchBankDetailsByTrust,
  updateBankDetail,
  uploadBankQr,
} from '../services/bankDetailsService';
import './NoticeboardPage.css';

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
  const [updatingId, setUpdatingId] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
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
  });

  const toggleFormVisible = (field) => setFormFieldVisible((prev) => ({ ...prev, [field]: !prev[field] }));

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setEditingId(null);
    setFormFieldVisible({ account_no: false, ifsc_code: false, swift_code: false, upi_id: false });
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
    });
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
    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (!form.mobile.trim()) {
      setFormError('Mobile is required.');
      return;
    }
    if (form.mobile.trim().length !== 10) {
      setFormError('Mobile number must be exactly 10 digits.');
      return;
    }

    setSaving(true);
    const payload = { ...form, trust_id: trustId };

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

  const handleDelete = async (item) => {
    const shouldDelete = window.confirm(`Delete bank details for "${item?.name || 'this entry'}"?`);
    if (!shouldDelete) {
      setActiveMenuId(null);
      return;
    }

    setUpdatingId(item.id);
    const { error: deleteError } = await deleteBankDetail(item.id, trustId);
    if (deleteError) {
      setError(deleteError.message || 'Unable to delete record.');
    } else {
      setRecords((prev) => prev.filter((entry) => entry.id !== item.id));
    }
    setUpdatingId(null);
    setActiveMenuId(null);
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
    });
    setEditingId(item.id);
    setFormError('');
    setActiveMenuId(null);
    navigate(`/company-details/bank-details/edit?id=${item.id}`, {
      state: { userName, trust, editId: item.id, sidebarNavKey: currentSidebarNavKey },
    });
  };

  if (!trustId) return null;

  return (
    <div className="nb-root">
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
                        value={form.name}
                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Enter contact name"
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      <span>Mobile *</span>
                      <input
                        value={form.mobile}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))
                        }
                        inputMode="numeric"
                        maxLength={10}
                        placeholder="Enter 10-digit mobile number"
                        autoComplete="off"
                      />
                    </label>
                    <label className="nb-span-2">
                      <span>Email ID</span>
                      <input
                        value={form.email_id}
                        onChange={(e) => setForm((prev) => ({ ...prev, email_id: e.target.value }))}
                        placeholder="Enter email address"
                        autoComplete="off"
                      />
                    </label>
                  </div>
                </section>

                <section className="nb-form-section">
                  <h4 className="nb-section-title">Bank Details</h4>
                  <div className="nb-form-grid nb-form-grid-2">
                    <label>
                      <span>Beneficiary Name</span>
                      <input
                        value={form.beneficiary_name}
                        onChange={(e) => setForm((prev) => ({ ...prev, beneficiary_name: e.target.value }))}
                        placeholder="Enter beneficiary name"
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      <span>Account No.</span>
                      <div className="nb-input-with-actions">
                        <input
                          type={formFieldVisible.account_no ? 'text' : 'password'}
                          value={form.account_no}
                          onChange={(e) => setForm((prev) => ({ ...prev, account_no: e.target.value }))}
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
                    </label>
                    <label>
                      <span>Bank Name</span>
                      <input
                        value={form.bank_name}
                        onChange={(e) => setForm((prev) => ({ ...prev, bank_name: e.target.value }))}
                        placeholder="Enter bank name"
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      <span>Branch</span>
                      <input
                        value={form.branch}
                        onChange={(e) => setForm((prev) => ({ ...prev, branch: e.target.value }))}
                        placeholder="Enter branch"
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      <span>IFSC Code</span>
                      <div className="nb-input-with-actions">
                        <input
                          type={formFieldVisible.ifsc_code ? 'text' : 'password'}
                          value={form.ifsc_code}
                          onChange={(e) => setForm((prev) => ({ ...prev, ifsc_code: e.target.value }))}
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
                    </label>
                    <label>
                      <span>SWIFT Code</span>
                      <div className="nb-input-with-actions">
                        <input
                          type={formFieldVisible.swift_code ? 'text' : 'password'}
                          value={form.swift_code}
                          onChange={(e) => setForm((prev) => ({ ...prev, swift_code: e.target.value }))}
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
                    </label>
                    <label>
                      <span>UPI ID</span>
                      <div className="nb-input-with-actions">
                        <input
                          type={formFieldVisible.upi_id ? 'text' : 'password'}
                          value={form.upi_id}
                          onChange={(e) => setForm((prev) => ({ ...prev, upi_id: e.target.value }))}
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
                  className="nb-add-btn nb-list-add-btn"
                  type="button"
                  onClick={() => navigate('/company-details/bank-details/create', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } })}
                >
                  Add Bank Details
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
                        <div className="nb-left-item-title">{item.name || '-'}</div>
                        <div className="nb-left-item-sub">{item.bank_name || 'No bank'} • {item.mobile}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </aside>

              <section className="nb-right-panel">
                {!selectedRecord && <div className="nb-empty">Select an entry to view details.</div>}

                {selectedRecord && (
                  <>
                    <div className="nb-profile-hero">
                      <div className="nb-profile-hero-left">
                        <div className="nb-profile-avatar">{getInitials(selectedRecord.name)}</div>
                        <div>
                          <h3>{selectedRecord.name || '-'}</h3>
                          <div className="nb-profile-hero-actions">
                            <button className="nb-secondary-btn" type="button" onClick={() => handleEdit(selectedRecord)}>
                              Edit Details
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="nb-card-menu-wrap">
                        <button
                          type="button"
                          className="nb-card-menu-btn"
                          title="Actions"
                          onClick={(event) => {
                            event.stopPropagation();
                            setActiveMenuId((prev) => (prev === selectedRecord.id ? null : selectedRecord.id));
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <path d="M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                          </svg>
                        </button>
                        {activeMenuId === selectedRecord.id && (
                          <div className="nb-card-menu">
                            <button type="button" onClick={() => handleEdit(selectedRecord)} disabled={updatingId === selectedRecord.id}>
                              Edit Details
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => handleDelete(selectedRecord)}
                              disabled={updatingId === selectedRecord.id}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="nb-profile-details">
                      <div className="nb-profile-details-head">
                        <h3>Details</h3>
                      </div>
                      <div className="nb-profile-detail-grid">
                        <div><span>Mobile</span><strong>{selectedRecord.mobile || '-'}</strong></div>
                        <div><span>Email</span><strong>{selectedRecord.email_id || '-'}</strong></div>
                        <div><span>Beneficiary Name</span><strong>{selectedRecord.beneficiary_name || '-'}</strong></div>
                        <div><span>Account No.</span><strong>{maskSensitive(selectedRecord.account_no)}</strong></div>
                        <div><span>Bank Name</span><strong>{selectedRecord.bank_name || '-'}</strong></div>
                        <div><span>Branch</span><strong>{selectedRecord.branch || '-'}</strong></div>
                        <div><span>IFSC Code</span><strong>{maskSensitive(selectedRecord.ifsc_code)}</strong></div>
                        <div><span>SWIFT Code</span><strong>{maskSensitive(selectedRecord.swift_code)}</strong></div>
                        <div><span>UPI ID</span><strong>{maskSensitive(selectedRecord.upi_id)}</strong></div>
                        <div><span>Created Date</span><strong>{formatDate(selectedRecord.created_at)}</strong></div>
                      </div>

                      {selectedRecord.qr && (
                        <div style={{ marginTop: 14 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>QR Code</span>
                          <div style={{ marginTop: 6 }}>
                            <img src={selectedRecord.qr} alt="QR" style={{ width: 160, height: 160, objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 8 }} />
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Size: {formatSize(selectedRecord.size)}</div>
                          </div>
                        </div>
                      )}
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
