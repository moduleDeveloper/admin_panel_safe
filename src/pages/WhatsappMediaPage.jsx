import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Sidebar from '../components/Sidebar';
import {
  createWaMedia,
  deleteWaMedia,
  fetchWaMediaByTrust,
  updateWaMedia,
  uploadWaMediaFile,
} from '../services/waMediaService';
import './NoticeboardPage.css';

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getInitials(value = '') {
  const safe = String(value || '').trim();
  if (!safe) return 'M';
  return safe.charAt(0).toUpperCase();
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function bytesToKb(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round((value / 1024) * 100) / 100;
}

// `size` is stored in KB in the database.
function formatStoredKb(kb) {
  const value = Number(kb);
  if (!Number.isFinite(value) || value <= 0) return '-';
  if (value >= 1024) return `${(value / 1024).toFixed(2)} MB`;
  return `${value} KB`;
}

const EMPTY_FORM = {
  name: '',
  purpose: '',
  is_active: true,
};

export default function WhatsappMediaPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null } = location.state || {};
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'whatsapp';
  const trustId = trust?.id || null;
  const isCreateRoute = location.pathname === '/whatsapp/media/create';
  const isEditRoute = location.pathname === '/whatsapp/media/edit';
  const isFormRoute = isCreateRoute || isEditRoute;
  const routeEditId = location.state?.editId || new URLSearchParams(location.search).get('id') || '';

  const [mediaList, setMediaList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const [form, setForm] = useState(EMPTY_FORM);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setEditingId(null);
    setSelectedFile(null);
    setFilePreviewUrl('');
  };

  const goToList = () => {
    navigate('/whatsapp/media', { replace: true, state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
  };

  useEffect(() => {
    if (!trustId) {
      navigate('/whatsapp', { replace: true, state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
      return;
    }

    const load = async () => {
      setLoading(true);
      setError('');
      const { data, error: fetchError } = await fetchWaMediaByTrust(trustId);
      if (fetchError) setError(fetchError.message || 'Unable to load media.');
      setMediaList(data || []);
      setLoading(false);
    };

    load();
  }, [navigate, trustId, userName, trust, currentSidebarNavKey]);

  useEffect(() => {
    const closeMenu = () => setActiveMenuId(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  const statusCounts = useMemo(() => {
    return mediaList.reduce(
      (acc, item) => {
        if (item.is_active) acc.active += 1;
        else acc.inactive += 1;
        return acc;
      },
      { active: 0, inactive: 0 }
    );
  }, [mediaList]);

  const filteredMedia = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    let list = [...mediaList];

    if (statusFilter === 'active') list = list.filter((item) => item.is_active);
    else if (statusFilter === 'inactive') list = list.filter((item) => !item.is_active);

    if (term) {
      list = list.filter((item) => {
        const name = String(item?.name || '').toLowerCase();
        const purpose = String(item?.purpose || '').toLowerCase();
        const type = String(item?.type || '').toLowerCase();
        return name.includes(term) || purpose.includes(term) || type.includes(term);
      });
    }

    list.sort((left, right) => String(right?.created_at || '').localeCompare(String(left?.created_at || '')));
    return list;
  }, [mediaList, deferredSearch, statusFilter]);

  const selectedMedia = useMemo(
    () => filteredMedia.find((item) => item.id === selectedId) || null,
    [filteredMedia, selectedId]
  );

  useEffect(() => {
    if (loading || isFormRoute) return;
    if (!filteredMedia.length) {
      setSelectedId('');
      return;
    }
    const exists = filteredMedia.some((item) => item.id === selectedId);
    if (!exists) setSelectedId(filteredMedia[0].id);
  }, [filteredMedia, selectedId, loading, isFormRoute]);

  useEffect(() => {
    if (!isFormRoute) return;

    if (isCreateRoute) {
      resetForm();
      return;
    }

    if (!isEditRoute) return;
    const targetId = String(routeEditId || selectedId || '');
    if (!targetId) return;
    const target = mediaList.find((item) => String(item.id) === targetId);
    if (!target) return;

    setForm({
      name: target.name || '',
      purpose: target.purpose || '',
      is_active: target.is_active !== false,
    });
    setEditingId(target.id);
    setFormError('');
    setSelectedFile(null);
    setFilePreviewUrl('');
  }, [isFormRoute, isCreateRoute, isEditRoute, routeEditId, selectedId, mediaList]);

  const handleFile = (file) => {
    if (!file) return;
    setFormError('');
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setSelectedFile(file);
    setFilePreviewUrl(file.type.startsWith('image/') ? URL.createObjectURL(file) : '');
  };

  const handleSave = async () => {
    setFormError('');
    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (!editingId && !selectedFile) {
      setFormError('Please select a file to upload.');
      return;
    }

    setSaving(true);

    if (editingId) {
      const { data, error: updateError } = await updateWaMedia(editingId, form, trustId);
      if (updateError) {
        setFormError(updateError.message || 'Unable to update media.');
        setSaving(false);
        return;
      }
      setMediaList((prev) => prev.map((item) => (item.id === editingId ? data : item)));
    } else {
      const { data: uploaded, error: uploadError } = await uploadWaMediaFile(selectedFile, { trustId });
      if (uploadError) {
        setFormError(uploadError.message || 'Unable to upload file.');
        setSaving(false);
        return;
      }
      const { data, error: createError } = await createWaMedia({
        trust_id: trustId,
        name: form.name,
        purpose: form.purpose,
        is_active: form.is_active,
        public_url: uploaded.publicUrl,
        type: uploaded.type,
        extn: uploaded.extn,
        size: bytesToKb(uploaded.size),
      });
      if (createError) {
        setFormError(createError.message || 'Unable to create media.');
        setSaving(false);
        return;
      }
      if (!data?.id) {
        setFormError('Media was uploaded, but the saved media record could not be loaded.');
        setSaving(false);
        return;
      }
      setMediaList((prev) => [data, ...prev]);
      setSelectedId(data.id);
    }

    resetForm();
    setSaving(false);
    if (isFormRoute) goToList();
  };

  const handleDelete = async (item) => {
    const shouldDelete = window.confirm(`Delete media "${item?.name || 'this entry'}"?`);
    if (!shouldDelete) {
      setActiveMenuId(null);
      return;
    }

    setUpdatingId(item.id);
    const { error: deleteError } = await deleteWaMedia(item.id, trustId, item.public_url);
    if (deleteError) {
      setError(deleteError.message || 'Unable to delete media.');
    } else {
      setMediaList((prev) => prev.filter((entry) => entry.id !== item.id));
    }
    setUpdatingId(null);
    setActiveMenuId(null);
  };

  const handleEdit = (item) => {
    setForm({
      name: item.name || '',
      purpose: item.purpose || '',
      is_active: item.is_active !== false,
    });
    setEditingId(item.id);
    setFormError('');
    setSelectedFile(null);
    setFilePreviewUrl('');
    setActiveMenuId(null);
    navigate(`/whatsapp/media/edit?id=${item.id}`, {
      state: { userName, trust, editId: item.id, sidebarNavKey: currentSidebarNavKey },
    });
  };

  const handleToggleActive = async (item) => {
    setUpdatingId(item.id);
    const { data, error: updateError } = await updateWaMedia(item.id, { is_active: !item.is_active }, trustId);
    if (updateError) {
      setError(updateError.message || 'Unable to update status.');
    } else if (data) {
      setMediaList((prev) => prev.map((entry) => (entry.id === item.id ? data : entry)));
    }
    setUpdatingId(null);
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
          title="Whatsapp Media"
          subtitle="Manage WhatsApp media library"
          onBack={() => {
            if (isFormRoute) {
              goToList();
              return;
            }
            navigate('/whatsapp', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
          }}
        />

        <section className="nb-content">
          {error && <div className="nb-error">{error}</div>}

          {isFormRoute && (
            <div className="nb-form-card">
              <h3>{editingId ? 'Edit Media' : 'Upload Media'}</h3>
              <div className="nb-form-layout">
                <section className="nb-form-section">
                  <h4 className="nb-section-title">Media Details</h4>
                  <div className="nb-form-grid nb-form-grid-2">
                    <label>
                      <span>Name *</span>
                      <input
                        value={form.name}
                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Enter media name"
                      />
                    </label>
                    <label>
                      <span>Purpose</span>
                      <input
                        value={form.purpose}
                        onChange={(e) => setForm((prev) => ({ ...prev, purpose: e.target.value }))}
                        placeholder="e.g. Marketing, Notification"
                      />
                    </label>
                    <label className="nb-checkbox-field">
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                      />
                      <span>Active</span>
                    </label>
                  </div>

                  {!editingId && (
                    <div className="nb-span-full" style={{ marginTop: 12 }}>
                      <span>File *</span>
                      <p className="nb-dropzone-sub" style={{ margin: '4px 0 8px' }}>
                        Uploaded as-is, no compression.
                      </p>
                      <label
                        className={`nb-dropzone ${dragOver ? 'drag' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
                      >
                        <input type="file" onChange={(e) => handleFile(e.target.files?.[0])} />
                        <div className="nb-dropzone-inner">
                          <span>Drag & drop file here</span>
                          <span className="nb-dropzone-sub">or click to browse</span>
                        </div>
                      </label>
                      {selectedFile && (
                        <div className="nb-file-preview">
                          {filePreviewUrl ? (
                            <img src={filePreviewUrl} alt={selectedFile.name} />
                          ) : (
                            <div className="nb-file-preview-icon">{selectedFile.name.split('.').pop()}</div>
                          )}
                          <div className="nb-file-preview-body">
                            <div className="nb-file-preview-name">{selectedFile.name}</div>
                            <div className="nb-file-preview-meta">{formatBytes(selectedFile.size)}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {editingId && selectedMedia && (
                    <div className="nb-file-preview" style={{ marginTop: 12 }}>
                      {selectedMedia.type === 'image' ? (
                        <img src={selectedMedia.public_url} alt={selectedMedia.name} />
                      ) : (
                        <div className="nb-file-preview-icon">{selectedMedia.extn}</div>
                      )}
                      <div className="nb-file-preview-body">
                        <div className="nb-file-preview-name">Existing file (unchanged)</div>
                        <div className="nb-file-preview-meta">{formatStoredKb(selectedMedia.size)}</div>
                      </div>
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
                <button className="nb-add-btn" onClick={handleSave} disabled={saving} type="button">
                  {saving ? 'Saving...' : editingId ? 'Update Media' : 'Upload Media'}
                </button>
              </div>
            </div>
          )}

          {!isFormRoute && loading && <div className="nb-empty">Loading media...</div>}

          {!isFormRoute && !loading && mediaList.length === 0 && (
            <div className="nb-empty">
              <button
                className="nb-add-btn nb-list-add-btn"
                type="button"
                onClick={() => navigate('/whatsapp/media/create', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } })}
              >
                Add Media
              </button>
              <div>No media found for this trust. Upload your first file.</div>
            </div>
          )}

          {!isFormRoute && !loading && mediaList.length > 0 && (
            <section className="nb-profile-layout">
              <aside className="nb-left-panel">
                <div className="nb-left-head">
                  <h3>All Media</h3>
                  <span className="nb-left-count">{mediaList.length}</span>
                </div>

                <input
                  className="nb-left-search"
                  placeholder="Search media..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />

                <div className="nb-category-tabs">
                  <button
                    type="button"
                    className={`nb-category-tab ${statusFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('all')}
                  >
                    <span>All</span>
                    <b>{mediaList.length}</b>
                  </button>
                  <button
                    type="button"
                    className={`nb-category-tab ${statusFilter === 'active' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('active')}
                  >
                    <span>Active</span>
                    <b>{statusCounts.active}</b>
                  </button>
                  <button
                    type="button"
                    className={`nb-category-tab ${statusFilter === 'inactive' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('inactive')}
                  >
                    <span>Inactive</span>
                    <b>{statusCounts.inactive}</b>
                  </button>
                </div>

                <button
                  className="nb-add-btn nb-list-add-btn"
                  type="button"
                  onClick={() => navigate('/whatsapp/media/create', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } })}
                >
                  Add Media
                </button>

                <div className="nb-left-list">
                  {filteredMedia.length === 0 && (
                    <div className="nb-empty">No media matched your filters.</div>
                  )}
                  {filteredMedia.map((item) => (
                    <button
                      key={item.id}
                      className={`nb-left-item ${selectedId === item.id ? 'active' : ''}`}
                      onClick={() => setSelectedId(item.id)}
                      type="button"
                    >
                      <div className="nb-left-avatar">
                        {item.type === 'image' && item.public_url ? (
                          <img src={item.public_url} alt={item.name} />
                        ) : (
                          getInitials(item?.name)
                        )}
                      </div>
                      <div className="nb-left-item-body">
                        <div className="nb-left-item-title">{item.name || '-'}</div>
                        <div className="nb-left-item-sub">{item.type || '-'} • {item.purpose || '-'}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </aside>

              <section className="nb-right-panel">
                {!selectedMedia && (
                  <div className="nb-empty">Select a media file to view details.</div>
                )}

                {selectedMedia && (
                  <>
                    <div className="nb-profile-hero">
                      <div className="nb-profile-hero-left">
                        <div className="nb-profile-avatar">
                          {selectedMedia.type === 'image' && selectedMedia.public_url ? (
                            <img src={selectedMedia.public_url} alt={selectedMedia.name} />
                          ) : (
                            getInitials(selectedMedia.name)
                          )}
                        </div>
                        <div>
                          <h3>{selectedMedia.name || '-'}</h3>
                          <div className="nb-profile-hero-actions">
                            <button
                              className="nb-secondary-btn"
                              type="button"
                              onClick={() => handleToggleActive(selectedMedia)}
                              disabled={updatingId === selectedMedia.id}
                            >
                              {selectedMedia.is_active ? 'Mark Inactive' : 'Mark Active'}
                            </button>
                            <button
                              className="nb-secondary-btn"
                              type="button"
                              onClick={() => handleEdit(selectedMedia)}
                            >
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
                            setActiveMenuId((prev) => (prev === selectedMedia.id ? null : selectedMedia.id));
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <path d="M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                          </svg>
                        </button>
                        {activeMenuId === selectedMedia.id && (
                          <div className="nb-card-menu">
                            <button
                              type="button"
                              onClick={() => handleEdit(selectedMedia)}
                              disabled={updatingId === selectedMedia.id}
                            >
                              Edit Details
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => handleDelete(selectedMedia)}
                              disabled={updatingId === selectedMedia.id}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="nb-profile-details">
                      <div className="nb-profile-details-head">
                        <h3>Media Details</h3>
                      </div>
                      <div className="nb-profile-detail-grid">
                        <div><span>Purpose</span><strong>{selectedMedia.purpose || '-'}</strong></div>
                        <div><span>Type</span><strong>{selectedMedia.type || '-'}</strong></div>
                        <div><span>Extension</span><strong>{selectedMedia.extn || '-'}</strong></div>
                        <div><span>Size</span><strong>{formatStoredKb(selectedMedia.size)}</strong></div>
                        <div><span>Status</span><strong>{selectedMedia.is_active ? 'Active' : 'Inactive'}</strong></div>
                        <div>
                          <span>Public URL</span>
                          <strong>
                            {selectedMedia.public_url ? (
                              <a href={selectedMedia.public_url} target="_blank" rel="noreferrer">Open file</a>
                            ) : '-'}
                          </strong>
                        </div>
                        <div><span>Created Date</span><strong>{formatDate(selectedMedia.created_at)}</strong></div>
                        <div><span>Updated Date</span><strong>{formatDate(selectedMedia.updated_at)}</strong></div>
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
