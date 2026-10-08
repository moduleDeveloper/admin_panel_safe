import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../../../core/components/Sidebar';
import PageHeader from '../../../core/components/PageHeader';
import CountryPicker from '../../auth/components/CountryPicker';
import { DEFAULT_COUNTRY, normalizePhoneInput } from '../../auth/constants/countries';
import {
  createPanelUser,
  deletePanelUser,
  fetchUserManagementData,
  findCountry,
  updatePanelUser,
  validateUserForm,
} from '../services/userManagementService';
import './UserManagementPage.css';

// mobile_no holds only the local digits; mobile_country is the picker's ISO code.
const EMPTY_FORM = {
  id: null,
  name: '',
  email: '',
  mobile_country: DEFAULT_COUNTRY.iso,
  mobile_no: '',
  secret_code: '',
};

const NO_TOUCHED = { name: false, email: false, mobile_no: false, secret_code: false };
const ALL_TOUCHED = { name: true, email: true, mobile_no: true, secret_code: true };

function formFromUser(user) {
  return {
    id: user.id,
    name: user.name || '',
    email: user.email || '',
    mobile_country: user.mobile_country || DEFAULT_COUNTRY.iso,
    mobile_no: user.mobile_local || '',
    secret_code: user.secret_code || '',
  };
}

function formatMobile(user) {
  if (!user.mobile_local) return '';
  return `${findCountry(user.mobile_country).code} ${user.mobile_local}`;
}

const PERMISSION_COLUMNS = [
  { key: 'can_view', label: 'View' },
  { key: 'can_add', label: 'Add' },
  { key: 'can_edit', label: 'Edit' },
  { key: 'can_delete', label: 'Delete' },
];

const MOBILE_QUERY = '(max-width: 760px)';

function buildSnapshot(form, permissionRows) {
  return JSON.stringify({ form, permissionRows });
}

function withImpliedView(row) {
  const canAdd = !!row.can_add;
  const canEdit = !!row.can_edit;
  const canDelete = !!row.can_delete;

  return {
    ...row,
    can_view: !!row.can_view || canAdd || canEdit || canDelete,
    can_add: canAdd,
    can_edit: canEdit,
    can_delete: canDelete,
  };
}

function buildPermissionRows(features = [], roles = []) {
  const roleByFeatureId = new Map((roles || []).map((role) => [String(role.feature_id), role]));
  return (features || []).map((feature) => {
    const linkedRole = roleByFeatureId.get(String(feature.id));
    return withImpliedView({
      feature_id: feature.id,
      feature_name: feature.name || 'Untitled Feature',
      feature_subname: feature.subname || '',
      can_view: !!linkedRole?.can_view,
      can_edit: !!linkedRole?.can_edit,
      can_delete: !!linkedRole?.can_delete,
      can_add: !!linkedRole?.can_add,
    });
  });
}

function buildCreatePermissionRows(features = []) {
  return (features || []).map((feature) => ({
    feature_id: feature.id,
    feature_name: feature.name || 'Untitled Feature',
    feature_subname: feature.subname || '',
    can_view: true,
    can_edit: false,
    can_delete: false,
    can_add: false,
  }));
}

export default function UserManagementPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null, superuserId = null } = location.state || {};
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'menu';
  const trustId = trust?.id || null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);
  const [features, setFeatures] = useState([]);
  const [permissionRows, setPermissionRows] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isEditorVisible, setIsEditorVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(null);
  // Snapshot of the last loaded/saved editor state, used to detect unsaved changes.
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  // Field errors show only after the field is left or a save is attempted.
  const [touched, setTouched] = useState(NO_TOUCHED);

  const openEditor = useCallback(() => {
    setIsEditorVisible(true);
    setTouched(NO_TOUCHED);
    if (typeof window !== 'undefined' && window.matchMedia?.(MOBILE_QUERY).matches) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const selectExistingUser = useCallback((user, featureList = features) => {
    if (!user?.id) return;
    const nextForm = formFromUser(user);
    // Roles come embedded in each user from the read action.
    const nextRows = buildPermissionRows(featureList, user.user_roles || []);

    openEditor();
    setError('');
    setSelectedUserId(user.id);
    setForm(nextForm);
    setPermissionRows(nextRows);
    setSavedSnapshot(buildSnapshot(nextForm, nextRows));
  }, [features, openEditor]);

  const loadBaseData = useCallback(async () => {
    if (!trustId) return;

    setLoading(true);
    setError('');

    const { data, error: loadError } = await fetchUserManagementData(trustId);

    if (loadError) {
      setError(loadError.message || 'Unable to load users.');
      setLoading(false);
      return;
    }

    const nextUsers = data?.users || [];
    const nextFeatures = data?.features || [];
    setUsers(nextUsers);
    setFeatures(nextFeatures);
    setPermissionRows(buildPermissionRows(nextFeatures, []));

    // Don't auto-open the first user: the admin picks a user or starts a new one explicitly.
    setSelectedUserId(null);
    setForm(EMPTY_FORM);
    setSavedSnapshot(null);
    setIsEditorVisible(false);

    setLoading(false);
  }, [trustId]);

  useEffect(() => {
    if (!trustId) {
      navigate('/dashboard', {
        replace: true,
        state: { userName, trust, superuserId, sidebarNavKey: currentSidebarNavKey },
      });
      return;
    }
    const timer = setTimeout(() => {
      loadBaseData();
    }, 0);
    return () => clearTimeout(timer);
  }, [trustId, navigate, loadBaseData, userName, trust, superuserId, currentSidebarNavKey]);

  useEffect(() => {
    if (!flash) return;
    // Longer messages stay up long enough to read.
    const timer = setTimeout(() => setFlash(null), Math.max(2400, flash.text.length * 55));
    return () => clearTimeout(timer);
  }, [flash]);

  const filteredUsers = useMemo(() => {
    const query = String(searchTerm || '').trim().toLowerCase();
    if (!query) return users;
    return users.filter((item) => {
      const name = String(item.name || '').toLowerCase();
      const mobile = String(item.mobile_no || '').toLowerCase();
      const email = String(item.email || '').toLowerCase();
      return name.includes(query) || mobile.includes(query) || email.includes(query);
    });
  }, [users, searchTerm]);

  const activePermissionCount = useMemo(
    () =>
      permissionRows.filter(
        (row) => row.can_view || row.can_add || row.can_edit || row.can_delete,
      ).length,
    [permissionRows],
  );

  const permissionColumnStates = useMemo(() => {
    const total = permissionRows.length || 0;
    const getState = (key) => {
      const checkedCount = permissionRows.reduce((count, row) => count + (row[key] ? 1 : 0), 0);
      return {
        allChecked: total > 0 && checkedCount === total,
        someChecked: checkedCount > 0 && checkedCount < total,
      };
    };

    return {
      can_view: getState('can_view'),
      can_add: getState('can_add'),
      can_edit: getState('can_edit'),
      can_delete: getState('can_delete'),
    };
  }, [permissionRows]);

  const isDirty = useMemo(
    () =>
      isEditorVisible &&
      savedSnapshot !== null &&
      buildSnapshot(form, permissionRows) !== savedSnapshot,
    [isEditorVisible, savedSnapshot, form, permissionRows],
  );

  const fieldErrors = useMemo(
    () => validateUserForm(form, users.find((item) => item.id === form.id) || null),
    [form, users],
  );
  const visibleErrors = Object.fromEntries(
    Object.entries(fieldErrors).filter(([field]) => touched[field]),
  );
  const selectedCountry = findCountry(form.mobile_country);

  const selectedUser = useMemo(
    () => users.find((item) => item.id === selectedUserId) || null,
    [users, selectedUserId],
  );

  function confirmDiscard() {
    if (!isDirty) return true;
    return window.confirm('You have unsaved changes. Discard them?');
  }

  function startCreateMode() {
    const nextRows = buildCreatePermissionRows(features);
    openEditor();
    setSelectedUserId(null);
    setError('');
    setForm(EMPTY_FORM);
    setPermissionRows(nextRows);
    setSavedSnapshot(buildSnapshot(EMPTY_FORM, nextRows));
  }

  function closeEditor() {
    setIsEditorVisible(false);
    setSelectedUserId(null);
    setForm(EMPTY_FORM);
    setSavedSnapshot(null);
    setError('');
  }

  function handleNewUserClick() {
    if (!confirmDiscard()) return;
    startCreateMode();
  }

  function handleUserClick(user) {
    if (user.id === selectedUserId && isEditorVisible) return;
    if (!confirmDiscard()) return;
    selectExistingUser(user);
  }

  function handleBackToList() {
    if (!confirmDiscard()) return;
    closeEditor();
  }

  function handlePermissionToggle(featureId, key) {
    setPermissionRows((prev) =>
      prev.map((row) => {
        if (row.feature_id !== featureId) return row;

        const nextRow = { ...row, [key]: !row[key] };
        return withImpliedView(nextRow);
      }),
    );
  }

  function handleColumnToggle(key, checked) {
    setPermissionRows((prev) =>
      prev.map((row) => withImpliedView({
        ...row,
        [key]: checked,
      })),
    );
  }

  function handleEmailChange(event) {
    // One address only: spaces, commas and semicolons would start a second one.
    const email = event.target.value.replace(/[\s,;]/g, '');
    setForm((prev) => ({ ...prev, email }));
  }

  // Accepts typed or pasted numbers; a leading "+code" switches the country, extra digits are dropped.
  function handleMobileChange(event) {
    const next = normalizePhoneInput(event.target.value, findCountry(form.mobile_country));
    setForm((prev) => ({ ...prev, mobile_country: next.country.iso, mobile_no: next.phone }));
  }

  function handleCountryChange(country) {
    setForm((prev) => ({ ...prev, mobile_country: country.iso, mobile_no: prev.mobile_no.slice(0, country.max) }));
  }

  function markTouched(field) {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }

  async function handleSave() {
    if (saving) return;
    if (Object.keys(fieldErrors).length) {
      setTouched(ALL_TOUCHED);
      return;
    }
    setSaving(true);
    setError('');

    const wasCreate = !form.id;
    const originalUser = users.find((item) => item.id === form.id) || { id: form.id };
    const result = wasCreate
      ? await createPanelUser(trustId, form, permissionRows)
      : await updatePanelUser(trustId, originalUser, form, permissionRows);

    const savedUser = result.data;
    if (!savedUser) {
      setSaving(false);
      setError(result.error?.message || 'Unable to save user.');
      return;
    }

    setUsers((prev) =>
      prev.some((item) => item.id === savedUser.id)
        ? prev.map((item) => (item.id === savedUser.id ? savedUser : item))
        : [savedUser, ...prev],
    );

    // Keep the saved user open, showing exactly what the server stored.
    const savedForm = formFromUser(savedUser);
    const savedRows = buildPermissionRows(features, savedUser.user_roles || []);
    setForm(savedForm);
    setPermissionRows(savedRows);
    setSelectedUserId(savedUser.id);
    setSavedSnapshot(buildSnapshot(savedForm, savedRows));
    setSaving(false);

    // User was saved but some permission calls failed.
    if (result.error) {
      setError(result.error.message);
      return;
    }

    const savedUserName = String(savedUser.name || '').trim();

    const suffix = savedUserName ? `: ${savedUserName}` : '';
    let text = `${wasCreate ? 'User created' : 'User updated'}${suffix}.`;
    // A matching mobile/email reuses the registered person; the server then keeps their
    // registered name, email and secret code instead of what was typed.
    if (wasCreate && result.meta?.trust_membership_reused) {
      text = `Already a user of this trust${suffix}. Opened the existing user.`;
    } else if (wasCreate && result.meta?.user_reg_reused) {
      text = `Registered user linked${suffix}. Name, email and secret code come from their existing registration.`;
    }
    setFlash({ type: 'success', text });
  }

  async function handleDelete(user) {
    if (!user?.id) return;
    const confirmed = window.confirm(
      `Remove "${user.name}" from this trust?\n\nTheir permissions and login sessions for this trust will be deleted. ` +
        'If they are not part of any other trust, their registration is deleted too.',
    );
    if (!confirmed) return;

    const { data, error: deleteError } = await deletePanelUser(trustId, user.id);
    if (deleteError) {
      setError(deleteError.message || 'Unable to delete user.');
      return;
    }

    setUsers((prev) => prev.filter((item) => item.id !== user.id));
    if (selectedUserId === user.id) closeEditor();

    const otherTrusts = Number(data?.remaining_trust_links) || 0;
    setFlash({
      type: 'success',
      text: data?.user_reg_deleted || !otherTrusts
        ? 'User deleted.'
        : `User removed from this trust. Still linked to ${otherTrusts} other ${otherTrusts === 1 ? 'trust' : 'trusts'}.`,
    });
  }

  if (!trustId) return null;

  return (
    <div className="um-root">
      <Sidebar
        trustName={trust?.name || 'Trust'}
        onDashboard={() =>
          navigate('/dashboard', {
            state: {
              userName,
              trust,
              superuserId,
              sidebarNavKey: currentSidebarNavKey,
            },
          })
        }
        onLogout={() => navigate('/login')}
      />

      <main className="um-main">
        <PageHeader
          title="User Management"
          subtitle="Create users and assign feature-wise permissions"
          onBack={() =>
            navigate('/dashboard', {
              state: {
                userName,
                trust,
                superuserId,
                sidebarNavKey: currentSidebarNavKey,
              },
            })
          }
        />

        <section className="um-panel">
          <div className="um-head">
            <div>
              <h3>Trust Users</h3>
              <p>{users.length} {users.length === 1 ? 'user' : 'users'}</p>
            </div>
            <button type="button" className="um-new-btn" onClick={handleNewUserClick}>
              + New User
            </button>
          </div>

          {error ? <div className="um-error">{error}</div> : null}

          <div className={`um-grid ${isEditorVisible ? 'is-editing' : ''}`}>
            <aside className="um-users">
              <input
                type="text"
                className="um-search"
                placeholder="Search by name, mobile or email..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />

              <div className="um-user-list">
                {loading ? <div className="um-empty">Loading users...</div> : null}
                {!loading && !filteredUsers.length ? (
                  <div className="um-empty">No users found.</div>
                ) : null}
                {!loading &&
                  filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      role="button"
                      tabIndex={0}
                      className={`um-user-item ${selectedUserId === user.id ? 'active' : ''}`}
                      onClick={() => handleUserClick(user)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleUserClick(user);
                        }
                      }}
                    >
                      <div className="um-user-item-main">
                        <strong>{user.name}</strong>
                        <span>{formatMobile(user) || user.email || 'No mobile number'}</span>
                      </div>
                      <span
                        role="button"
                        tabIndex={0}
                        className="um-delete"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDelete(user);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            handleDelete(user);
                          }
                        }}
                        title="Delete user"
                      >
                        Delete
                      </span>
                    </div>
                  ))}
              </div>
            </aside>

            <div className="um-editor">
              {!isEditorVisible ? (
                <div className="um-empty um-editor-empty">
                  <div>
                    Select a user from the list to edit,
                    <br />
                    or click <strong>+ New User</strong> to add one.
                  </div>
                </div>
              ) : (
                <>
                  <div className="um-editor-head">
                    <button type="button" className="um-back-btn" onClick={handleBackToList}>
                      ← Back to users
                    </button>
                    <div className="um-editor-title">
                      <span className={`um-mode-badge ${form.id ? 'edit' : 'new'}`}>
                        {form.id ? 'Editing' : 'New User'}
                      </span>
                      <h4>{form.id ? selectedUser?.name || form.name || 'User' : 'Create a new user'}</h4>
                      <p>
                        {`${activePermissionCount} of ${permissionRows.length} features have access`}
                        {isDirty ? <span className="um-dirty"> · Unsaved changes</span> : null}
                      </p>
                      {form.id ? (
                        <p className="um-shared-note">
                          Name, email, mobile and secret code belong to this person&apos;s registration, so changes
                          apply in every trust they are part of. Permissions are for this trust only.
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="um-form">
                    <label>
                      <span>Name *</span>
                      <input
                        type="text"
                        className={visibleErrors.name ? 'has-error' : ''}
                        value={form.name}
                        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                        onBlur={() => markTouched('name')}
                        placeholder="Enter full name"
                        aria-invalid={!!visibleErrors.name}
                      />
                      {visibleErrors.name ? <small className="um-field-error">{visibleErrors.name}</small> : null}
                    </label>

                    <label>
                      <span>Email</span>
                      <input
                        type="email"
                        className={visibleErrors.email ? 'has-error' : ''}
                        value={form.email}
                        onChange={handleEmailChange}
                        onBlur={() => markTouched('email')}
                        placeholder="name@example.com"
                        autoComplete="off"
                        aria-invalid={!!visibleErrors.email}
                      />
                      {visibleErrors.email ? <small className="um-field-error">{visibleErrors.email}</small> : null}
                    </label>

                    {/* Not a <label>: it would forward clicks to the country button. */}
                    <div className="um-field">
                      <span id="um-mobile-label">Mobile No.</span>
                      <div
                        className={`um-phone-wrap ${visibleErrors.mobile_no ? 'has-error' : ''}`}
                        onBlur={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget)) markTouched('mobile_no');
                        }}
                      >
                        <CountryPicker value={selectedCountry} onChange={handleCountryChange} disabled={saving} />
                        <input
                          type="tel"
                          className="um-phone-input"
                          inputMode="numeric"
                          value={form.mobile_no}
                          onChange={handleMobileChange}
                          placeholder={
                            selectedCountry.iso === DEFAULT_COUNTRY.iso
                              ? '98765 43210'
                              : `${selectedCountry.min === selectedCountry.max ? selectedCountry.min : `${selectedCountry.min}-${selectedCountry.max}`} digits`
                          }
                          autoComplete="off"
                          aria-labelledby="um-mobile-label"
                          aria-invalid={!!visibleErrors.mobile_no}
                        />
                      </div>
                      {visibleErrors.mobile_no ? <small className="um-field-error">{visibleErrors.mobile_no}</small> : null}
                    </div>

                    <label>
                      <span>Secret Code (6 digits) *</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        className={visibleErrors.secret_code ? 'has-error' : ''}
                        value={form.secret_code}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, secret_code: event.target.value.replace(/\D/g, '').slice(0, 6) }))
                        }
                        onBlur={() => markTouched('secret_code')}
                        placeholder="e.g. 123456"
                        required
                        aria-invalid={!!visibleErrors.secret_code}
                      />
                      {visibleErrors.secret_code ? <small className="um-field-error">{visibleErrors.secret_code}</small> : null}
                    </label>
                  </div>

                  <div className="um-role-table-wrap">
                    <table className="um-role-table">
                      <thead>
                        <tr>
                          <th>Feature</th>
                          {PERMISSION_COLUMNS.map(({ key, label }) => (
                            <th key={key}>
                              <label className="um-header-checkbox">
                                <input
                                  type="checkbox"
                                  checked={permissionColumnStates[key].allChecked}
                                  ref={(input) => {
                                    if (input) input.indeterminate = permissionColumnStates[key].someChecked;
                                  }}
                                  onChange={(event) => handleColumnToggle(key, event.target.checked)}
                                />
                                <span>{label}</span>
                              </label>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {!features.length ? (
                          <tr>
                            <td colSpan={5} className="um-empty">No enabled features available.</td>
                          </tr>
                        ) : (
                          permissionRows.map((row) => (
                            <tr key={row.feature_id}>
                              <td>
                                <div className="um-feature-cell">
                                  <strong>{row.feature_name}</strong>
                                  <span>{row.feature_subname || 'No subtitle'}</span>
                                </div>
                              </td>
                              {PERMISSION_COLUMNS.map(({ key }) => (
                                <td key={key}>
                                  <input
                                    type="checkbox"
                                    checked={row[key]}
                                    onChange={() => handlePermissionToggle(row.feature_id, key)}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile: one card per feature instead of a wide table */}
                  <div className="um-perm-cards">
                    {!features.length ? (
                      <div className="um-empty">No enabled features available.</div>
                    ) : (
                      <>
                        <div className="um-perm-bulk">
                          <span>Apply to all features</span>
                          <div className="um-perm-toggles">
                            {PERMISSION_COLUMNS.map(({ key, label }) => (
                              <label
                                key={key}
                                className={`um-chip ${permissionColumnStates[key].allChecked ? 'on' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={permissionColumnStates[key].allChecked}
                                  ref={(input) => {
                                    if (input) input.indeterminate = permissionColumnStates[key].someChecked;
                                  }}
                                  onChange={(event) => handleColumnToggle(key, event.target.checked)}
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                        </div>
                        {permissionRows.map((row) => (
                          <div key={row.feature_id} className="um-perm-card">
                            <div className="um-feature-cell">
                              <strong>{row.feature_name}</strong>
                              <span>{row.feature_subname || 'No subtitle'}</span>
                            </div>
                            <div className="um-perm-toggles">
                              {PERMISSION_COLUMNS.map(({ key, label }) => (
                                <label key={key} className={`um-chip ${row[key] ? 'on' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={row[key]}
                                    onChange={() => handlePermissionToggle(row.feature_id, key)}
                                  />
                                  {label}
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>

                  <div className="um-save-bar">
                    <span className={`um-save-hint ${isDirty ? 'dirty' : ''}`}>
                      {isDirty ? 'You have unsaved changes' : form.id ? 'All changes saved' : 'Fill details and set permissions'}
                    </span>
                    <button
                      type="button"
                      className="um-save-btn"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : form.id ? 'Save Changes' : 'Create User'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      {flash ? (
        <div className={`um-toast ${flash.type === 'error' ? 'error' : 'success'}`}>
          {flash.text}
        </div>
      ) : null}
    </div>
  );
}
