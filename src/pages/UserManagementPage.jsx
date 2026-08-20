import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import PageHeader from '../components/PageHeader';
import {
  createPanelUser,
  deletePanelUser,
  fetchFeatureCatalog,
  fetchUserRolesByUserId,
  fetchUsersByTrustId,
  replaceUserRoles,
  updatePanelUser,
} from '../services/userManagementService';
import './UserManagementPage.css';

const EMPTY_FORM = {
  id: null,
  name: '',
  email: '',
  mobile_no: '',
  secret_code: '',
};

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

  const selectExistingUser = useCallback(async (user, featureList = features) => {
    if (!user?.id) return;
    setIsEditorVisible(true);
    setError('');
    setSelectedUserId(user.id);
    setForm({
      id: user.id,
      name: user.name || '',
      email: user.email || '',
      mobile_no: user.mobile_no || '',
      secret_code:
        user.secret_code === null || user.secret_code === undefined
          ? ''
          : String(user.secret_code),
    });

    const { data, error: roleError } = await fetchUserRolesByUserId(user.id);
    if (roleError) {
      setError(roleError.message || 'Unable to load user roles.');
      setPermissionRows(buildPermissionRows(featureList, []));
      return;
    }
    setPermissionRows(buildPermissionRows(featureList, data || []));
  }, [features]);

  const loadBaseData = useCallback(async () => {
    if (!trustId) return;

    setLoading(true);
    setError('');

    const [usersResult, featuresResult] = await Promise.all([
      fetchUsersByTrustId(trustId),
      fetchFeatureCatalog(trustId),
    ]);

    if (usersResult.error) {
      setError(usersResult.error.message || 'Unable to load users.');
      setLoading(false);
      return;
    }

    if (featuresResult.error) {
      setError(featuresResult.error.message || 'Unable to load features catalog.');
      setLoading(false);
      return;
    }

    const nextUsers = usersResult.data || [];
    const nextFeatures = featuresResult.data || [];
    setUsers(nextUsers);
    setFeatures(nextFeatures);
    setPermissionRows(buildPermissionRows(nextFeatures, []));

    if (nextUsers.length) {
      await selectExistingUser(nextUsers[0], nextFeatures);
    } else {
      setSelectedUserId(null);
      setForm(EMPTY_FORM);
      setIsEditorVisible(false);
    }

    setLoading(false);
  }, [trustId, selectExistingUser]);

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
    const timer = setTimeout(() => setFlash(null), 2400);
    return () => clearTimeout(timer);
  }, [flash]);

  const filteredUsers = useMemo(() => {
    const query = String(searchTerm || '').trim().toLowerCase();
    if (!query) return users;
    return users.filter((item) => {
      const name = String(item.name || '').toLowerCase();
      const mobile = String(item.mobile_no || '').toLowerCase();
      return name.includes(query) || mobile.includes(query);
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

  function startCreateMode(openEditor = true) {
    setIsEditorVisible(openEditor);
    setSelectedUserId(null);
    setError('');
    setForm(EMPTY_FORM);
    setPermissionRows(buildCreatePermissionRows(features));
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

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError('');

    let targetUserId = form.id;
    let savedUserName = String(form.name || '').trim();
    let wasCreate = !form.id;
    let saveError = null;

    if (form.id) {
      const { data, error: updateError } = await updatePanelUser(form.id, form);
      if (updateError) {
        saveError = updateError;
      } else if (data) {
        setUsers((prev) => prev.map((item) => (item.id === data.id ? data : item)));
        savedUserName = String(data.name || savedUserName || '').trim();
      }
    } else {
      const { data, error: createError } = await createPanelUser(trustId, form);
      if (createError) {
        saveError = createError;
      } else if (data) {
        targetUserId = data.id;
        setUsers((prev) => [data, ...prev]);
        savedUserName = String(data.name || savedUserName || '').trim();
      }
    }

    if (saveError) {
      setSaving(false);
      setError(saveError.message || 'Unable to save user.');
      return;
    }

    if (targetUserId) {
      const { error: roleSaveError } = await replaceUserRoles(targetUserId, permissionRows);
      if (roleSaveError) {
        setSaving(false);
        setError(roleSaveError.message || 'User saved but permissions failed to update.');
        return;
      }
    }

    // Keep saved user in list, but reset editor so next user can be entered quickly.
    startCreateMode(true);
    setSaving(false);
    setFlash({
      type: 'success',
      text: `${wasCreate ? 'User created' : 'User updated'}${savedUserName ? `: ${savedUserName}` : ''}.`,
    });
  }

  async function handleDelete(user) {
    if (!user?.id) return;
    const confirmed = window.confirm(`Delete user "${user.name}"?`);
    if (!confirmed) return;

    const { error: deleteError } = await deletePanelUser(user.id);
    if (deleteError) {
      setError(deleteError.message || 'Unable to delete user.');
      return;
    }

    const nextUsers = users.filter((item) => item.id !== user.id);
    setUsers(nextUsers);
    if (selectedUserId === user.id) {
      if (nextUsers.length) {
        await selectExistingUser(nextUsers[0], features);
      } else {
        startCreateMode(false);
      }
    }
    setFlash({ type: 'success', text: 'User deleted successfully.' });
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
              <p>{users.length} users | {activePermissionCount} features with active permissions</p>
            </div>
            <button type="button" className="um-new-btn" onClick={startCreateMode}>
              + New User
            </button>
          </div>

          <div className="um-grid">
            <aside className="um-users">
              <input
                type="text"
                className="um-search"
                placeholder="Search by name or mobile..."
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
                      onClick={() => selectExistingUser(user)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectExistingUser(user);
                        }
                      }}
                    >
                      <div className="um-user-item-main">
                        <strong>{user.name}</strong>
                        <span>{user.mobile_no || 'No mobile number'}</span>
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
                  Click <strong>+ New User</strong> to open the form.
                </div>
              ) : (
                <>
                  <div className="um-form">
                    <label>
                      <span>Name *</span>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Enter full name"
                      />
                    </label>

                    <label>
                      <span>Email</span>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                        placeholder="Enter email address"
                      />
                    </label>

                    <label>
                      <span>Mobile No.</span>
                      <input
                        type="text"
                        value={form.mobile_no}
                        onChange={(event) => setForm((prev) => ({ ...prev, mobile_no: event.target.value }))}
                        placeholder="Enter mobile number"
                      />
                    </label>

                    <label>
                      <span>Secret Code (numeric)</span>
                      <input
                        type="text"
                        value={form.secret_code}
                        onChange={(event) => setForm((prev) => ({ ...prev, secret_code: event.target.value }))}
                        placeholder="e.g. 1234"
                      />
                    </label>

                    <button type="button" className="um-save-btn" onClick={handleSave} disabled={saving}>
                      {saving ? 'Saving...' : 'Save User + Permissions'}
                    </button>
                  </div>

                  <div className="um-role-table-wrap">
                    <table className="um-role-table">
                      <thead>
                        <tr>
                          <th>Feature</th>
                          <th>
                            <label className="um-header-checkbox">
                              <input
                                type="checkbox"
                                checked={permissionColumnStates.can_view.allChecked}
                                ref={(input) => {
                                  if (input) input.indeterminate = permissionColumnStates.can_view.someChecked;
                                }}
                                onChange={(event) => handleColumnToggle('can_view', event.target.checked)}
                              />
                              <span>View</span>
                            </label>
                          </th>
                          <th>
                            <label className="um-header-checkbox">
                              <input
                                type="checkbox"
                                checked={permissionColumnStates.can_add.allChecked}
                                ref={(input) => {
                                  if (input) input.indeterminate = permissionColumnStates.can_add.someChecked;
                                }}
                                onChange={(event) => handleColumnToggle('can_add', event.target.checked)}
                              />
                              <span>Add</span>
                            </label>
                          </th>
                          <th>
                            <label className="um-header-checkbox">
                              <input
                                type="checkbox"
                                checked={permissionColumnStates.can_edit.allChecked}
                                ref={(input) => {
                                  if (input) input.indeterminate = permissionColumnStates.can_edit.someChecked;
                                }}
                                onChange={(event) => handleColumnToggle('can_edit', event.target.checked)}
                              />
                              <span>Edit</span>
                            </label>
                          </th>
                          <th>
                            <label className="um-header-checkbox">
                              <input
                                type="checkbox"
                                checked={permissionColumnStates.can_delete.allChecked}
                                ref={(input) => {
                                  if (input) input.indeterminate = permissionColumnStates.can_delete.someChecked;
                                }}
                                onChange={(event) => handleColumnToggle('can_delete', event.target.checked)}
                              />
                              <span>Delete</span>
                            </label>
                          </th>
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
                              <td>
                                <input
                                  type="checkbox"
                                  checked={row.can_view}
                                  onChange={() => handlePermissionToggle(row.feature_id, 'can_view')}
                                />
                              </td>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={row.can_add}
                                  onChange={() => handlePermissionToggle(row.feature_id, 'can_add')}
                                />
                              </td>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={row.can_edit}
                                  onChange={() => handlePermissionToggle(row.feature_id, 'can_edit')}
                                />
                              </td>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={row.can_delete}
                                  onChange={() => handlePermissionToggle(row.feature_id, 'can_delete')}
                                />
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>

          {error ? <div className="um-error">{error}</div> : null}
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
