import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../../../core/components/PageHeader';
import Sidebar from '../../../core/components/Sidebar';
import {
  createOtherMembership,
  deleteOtherMembership,
  fetchOtherMembershipById,
  fetchOtherMembershipsByTrustId,
  fetchRegisteredMembersByTrust,
  updateOtherMembership,
} from '../../../core/services/membersService';
import './OtherMembershipPage.css';

const EMPTY_FORM = {
  member_id: '',
  member_name: '',
  member_phone: '',
  organisation_name: '',
  membership_no: '',
  membership_type: '',
  is_active: true,
  remark: '',
};

const sanitizeDigits = (value) => String(value ?? '').replace(/\D+/g, '');
const toText = (value) => (value === null || value === undefined ? '' : String(value));
const MEMBER_PICKER_PAGE_SIZE = 10;
const formatMemberLabel = (member = {}) =>
  `${member.membership_number ? `${member.membership_number} - ` : ''}${member.name || 'Member'}`;
const buildFormFromItem = (item = {}) => ({
  member_id: toText(item.member_id),
  member_name: toText(item.member_name),
  member_phone: toText(item.member_phone),
  organisation_name: toText(item.organisation_name),
  membership_no: toText(item.membership_no),
  membership_type: toText(item.membership_type),
  is_active: item.is_active !== false,
  remark: toText(item.remark),
});

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function OtherMembershipPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null } = location.state || {};
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'menu';
  const trustId = trust?.id || null;
  const isCreateRoute = location.pathname === '/other-membership/create_other_membership';
  const routeMemberId = useMemo(
    () => new URLSearchParams(location.search).get('memberId') || '',
    [location.search]
  );
  const routeEditId = useMemo(
    () => new URLSearchParams(location.search).get('editId') || '',
    [location.search]
  );
  const initialEditItem = location.state?.otherMembershipEditItem || null;

  const [memberOptions, setMemberOptions] = useState([]);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(() => initialEditItem?.id || routeEditId || null);
  const [routeEditHydrated, setRouteEditHydrated] = useState(false);
  const [form, setForm] = useState(() => {
    if (initialEditItem?.id) return buildFormFromItem(initialEditItem);
    if (isCreateRoute && routeMemberId) return { ...EMPTY_FORM, member_id: String(routeMemberId) };
    return { ...EMPTY_FORM };
  });
  const [memberSearch, setMemberSearch] = useState('');
  const [memberPanelSearch, setMemberPanelSearch] = useState('');
  const [memberTypeFilter, setMemberTypeFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('name_asc');
  const [memberPage, setMemberPage] = useState(1);

  const memberNameMap = useMemo(
    () => new Map(memberOptions.map((item) => [String(item.member_id), item.name || 'Member'])),
    [memberOptions]
  );
  const memberLabelMap = useMemo(
    () => new Map(memberOptions.map((item) => [String(item.member_id), formatMemberLabel(item)])),
    [memberOptions]
  );
  const memberMap = useMemo(
    () => new Map(memberOptions.map((item) => [String(item.member_id), item])),
    [memberOptions]
  );
  const selectedMemberId = String(form.member_id || '');
  const selectedMember = memberMap.get(selectedMemberId) || null;
  const selectedMemberIsMy = selectedMember?.member_type === 'my';
  const myMembersCount = useMemo(
    () => memberOptions.filter((member) => member.member_type === 'my').length,
    [memberOptions]
  );
  const otherMembersCount = useMemo(
    () => memberOptions.filter((member) => member.member_type !== 'my').length,
    [memberOptions]
  );
  const roleOptions = useMemo(() => {
    const uniqueRoles = new Set(
      memberOptions.map((member) => String(member.role || '').trim()).filter(Boolean)
    );
    return [...uniqueRoles].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true })
    );
  }, [memberOptions]);
  const filteredMemberOptions = useMemo(() => {
    const term = memberPanelSearch.trim().toLowerCase();
    const filtered = memberOptions.filter((member) => {
      if (isCreateRoute && member.member_type !== 'my') return false;
      if (memberTypeFilter === 'my' && member.member_type !== 'my') return false;
      if (memberTypeFilter === 'others' && member.member_type === 'my') return false;
      if (roleFilter !== 'all' && String(member.role || '').trim() !== roleFilter) return false;
      if (!term) return true;

      const searchable = [
        member.name,
        member.membership_number,
        member.company_name,
        member.role,
        member.mobile,
        member.email,
      ];
      return searchable.some((value) => String(value || '').toLowerCase().includes(term));
    });
    return [...filtered].sort((left, right) => {
      const order = String(left.name || '').localeCompare(String(right.name || ''), undefined, {
        sensitivity: 'base',
        numeric: true,
      });
      return sortOrder === 'name_desc' ? -order : order;
    });
  }, [memberOptions, memberPanelSearch, memberTypeFilter, roleFilter, isCreateRoute, sortOrder]);
  const memberPickerTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredMemberOptions.length / MEMBER_PICKER_PAGE_SIZE)),
    [filteredMemberOptions.length]
  );
  const paginatedMemberOptions = useMemo(() => {
    const start = (memberPage - 1) * MEMBER_PICKER_PAGE_SIZE;
    return filteredMemberOptions.slice(start, start + MEMBER_PICKER_PAGE_SIZE);
  }, [filteredMemberOptions, memberPage]);
  const selectedMemberLabel = useMemo(
    () => memberLabelMap.get(selectedMemberId) || '',
    [memberLabelMap, selectedMemberId]
  );
  const visibleMembershipRecords = useMemo(() => {
    if (!selectedMemberId) return list;
    return list.filter((item) => String(item.member_id || '') === selectedMemberId);
  }, [list, selectedMemberId]);
  const headingText = useMemo(
    () => (editingId ? 'Update Other Membership' : 'Create Other Membership'),
    [editingId]
  );

  const resetForm = ({ keepSelectedMember = false } = {}) => {
    const nextMemberId = keepSelectedMember ? selectedMemberId : '';
    const nextMember = keepSelectedMember ? memberMap.get(nextMemberId) : null;
    setForm({
      ...EMPTY_FORM,
      member_id: nextMemberId,
      member_name: toText(nextMember?.name),
      member_phone: sanitizeDigits(nextMember?.mobile),
    });
    setMemberSearch(keepSelectedMember ? selectedMemberLabel : '');
    setEditingId(null);
    setFormError('');
  };

  const handleSelectMember = (member) => {
    if (isCreateRoute && member.member_type !== 'my') {
      setFormError('Other membership can be created only for My members.');
      return;
    }
    const label = formatMemberLabel(member);
    setForm((prev) => ({
      ...prev,
      member_id: String(member.member_id),
      member_name: prev.member_name || toText(member.name),
      member_phone: prev.member_phone || sanitizeDigits(member.mobile),
    }));
    setMemberSearch(label);
    if (
      formError === 'Member is required.' ||
      formError === 'Please select member from list.' ||
      formError === 'Other membership can be created only for My members.'
    ) {
      setFormError('');
    }
  };

  const navigateToCreateForm = () => {
    const memberIdParam = selectedMemberId && selectedMemberIsMy
      ? `?memberId=${encodeURIComponent(selectedMemberId)}`
      : '';
    navigate(`/other-membership/create_other_membership${memberIdParam}`, {
      state: { userName, trust, sidebarNavKey: currentSidebarNavKey },
    });
  };

  const navigateToRecords = () => {
    const memberIdParam = selectedMemberId ? `?memberId=${encodeURIComponent(selectedMemberId)}` : '';
    navigate(`/other-membership${memberIdParam}`, {
      state: { userName, trust, sidebarNavKey: currentSidebarNavKey },
    });
  };

  useEffect(() => {
    setMemberPage(1);
  }, [memberPanelSearch, memberTypeFilter, roleFilter, isCreateRoute]);

  useEffect(() => {
    setMemberPage((prev) => Math.min(Math.max(prev, 1), memberPickerTotalPages));
  }, [memberPickerTotalPages]);

  useEffect(() => {
    if (!selectedMemberId) return;
    const selectedIndex = filteredMemberOptions.findIndex(
      (member) => String(member.member_id || '') === selectedMemberId
    );
    if (selectedIndex < 0) return;
    const selectedPage = Math.floor(selectedIndex / MEMBER_PICKER_PAGE_SIZE) + 1;
    setMemberPage(selectedPage);
  }, [filteredMemberOptions, selectedMemberId]);

  useEffect(() => {
    if (!trustId) {
      navigate('/dashboard', { replace: true, state: { userName, trust, sidebarNavKey: 'menu' } });
      return;
    }

    const load = async () => {
      setLoading(true);
      setError('');

      const [
        { data: membersData, error: membersError },
        { data: membershipsData, error: membershipsError },
      ] = await Promise.all([
        fetchRegisteredMembersByTrust(trustId),
        fetchOtherMembershipsByTrustId(trustId),
      ]);

      if (membersError || membershipsError) {
        const message = membersError?.message || membershipsError?.message || 'Unable to load other memberships.';
        setError(message);
      }

      const members = membersData || [];
      setMemberOptions(members);
      const memberNameById = new Map(members.map((item) => [String(item.member_id), item.name || 'Member']));
      const records = (membershipsData || []).map((row) => ({
        ...row,
        __member_name: memberNameById.get(String(row.member_id || '')) || row.member_name || 'Member',
      }));
      records.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      setList(records);
      setLoading(false);
    };

    load();
  }, [navigate, trustId, userName, trust]);

  useEffect(() => {
    if (!isCreateRoute || !routeEditId || routeEditHydrated) return;
    if (initialEditItem?.id) {
      setRouteEditHydrated(true);
      return;
    }
    const match = list.find((item) => String(item.id || '') === String(routeEditId));
    if (match) {
      setEditingId(match.id);
      setForm(buildFormFromItem(match));
      const memberId = toText(match.member_id);
      setMemberSearch(memberLabelMap.get(memberId) || toText(match.__member_name || match.member_name));
      setFormError('');
      setRouteEditHydrated(true);
      return;
    }

    let cancelled = false;
    const hydrateFromApi = async () => {
      const { data, error: fetchError } = await fetchOtherMembershipById(routeEditId);
      if (cancelled || fetchError || !data) return;
      setEditingId(data.id);
      setForm(buildFormFromItem(data));
      const memberId = toText(data.member_id);
      setMemberSearch(memberLabelMap.get(memberId) || toText(data.member_name));
      setFormError('');
      setRouteEditHydrated(true);
    };

    hydrateFromApi();
    return () => {
      cancelled = true;
    };
  }, [isCreateRoute, routeEditId, routeEditHydrated, initialEditItem?.id, list, memberLabelMap]);

  const handleSave = async () => {
    if (!trustId) return;
    if (!form.member_id) {
      setFormError(memberSearch ? 'Please select member from list.' : 'Member is required.');
      return;
    }
    if (!selectedMember) {
      setFormError('Please select member from list.');
      return;
    }
    if (selectedMember.member_type !== 'my') {
      setFormError('Other membership can be created only for My members.');
      return;
    }
    if (!form.membership_no.trim()) {
      setFormError('Membership No is required.');
      return;
    }

    setSaving(true);
    setFormError('');

    const payload = {
      member_id: String(form.member_id || '').trim() || null,
      member_name: form.member_name.trim() || selectedMember.name || null,
      member_phone: sanitizeDigits(form.member_phone) || sanitizeDigits(selectedMember.mobile) || null,
      organisation_name: form.organisation_name.trim() || null,
      membership_no: form.membership_no.trim(),
      membership_type: form.membership_type.trim() || null,
      is_active: form.is_active !== false,
      remark: form.remark.trim() || null,
    };

    const action = editingId
      ? updateOtherMembership(editingId, payload, trustId)
      : createOtherMembership(payload, trustId);

    const { data, error: saveError } = await action;
    if (saveError) {
      setFormError(saveError.message || 'Unable to save other membership.');
      setSaving(false);
      return;
    }

    const decorated = {
      ...data,
      __member_name: memberNameMap.get(String(data.member_id || form.member_id || '')) || data.member_name || 'Member',
    };

    setList((prev) => {
      if (editingId) return prev.map((item) => (item.id === decorated.id ? decorated : item));
      return [decorated, ...prev];
    });

    if (isCreateRoute) {
      navigate(`/other-membership?memberId=${encodeURIComponent(String(form.member_id || ''))}`, {
        state: { userName, trust, sidebarNavKey: currentSidebarNavKey },
      });
      setSaving(false);
      return;
    }

    resetForm({ keepSelectedMember: true });
    setSaving(false);
  };

  const handleEdit = (item) => {
    if (!isCreateRoute) {
      navigate(
        `/other-membership/create_other_membership?memberId=${encodeURIComponent(String(item.member_id || ''))}&editId=${encodeURIComponent(String(item.id || ''))}`,
        {
        state: { userName, trust, sidebarNavKey: currentSidebarNavKey, otherMembershipEditItem: item },
        }
      );
      return;
    }

    setEditingId(item.id);
    setForm(buildFormFromItem(item));
    const memberId = toText(item.member_id);
    setMemberSearch(memberLabelMap.get(memberId) || toText(item.__member_name || item.member_name));
    setFormError('');
  };

  const handleDelete = async (item) => {
    const ok = window.confirm('Delete this other membership?');
    if (!ok) return;
    const { error: deleteError } = await deleteOtherMembership(item.id);
    if (deleteError) {
      setError(deleteError.message || 'Unable to delete other membership.');
      return;
    }
    setList((prev) => prev.filter((entry) => entry.id !== item.id));
    if (editingId === item.id) resetForm({ keepSelectedMember: true });
  };

  return (
    <div className="om-root">
      <Sidebar
        trustName={trust?.name || 'Trust'}
        onDashboard={() => navigate('/dashboard', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } })}
        onLogout={() => navigate('/login')}
      />

      <main className="om-main">
        <PageHeader
          title="Other Membership"
          subtitle="Manage records from other_memberships table"
          onBack={() => navigate('/dashboard', { state: { userName, trust, sidebarNavKey: 'menu' } })}
        />

        <section className="om-content">
          {error && <div className="om-error">{error}</div>}
          {formError && <div className="om-error">{formError}</div>}

          <div className="om-shell">
            <aside className="om-member-picker">
              <div className="om-picker-head">
                <h3>All Members</h3>
                <span>{memberOptions.length}</span>
              </div>
              <div className="om-picker-type-row">
                <button
                  type="button"
                  className={`om-picker-chip ${memberTypeFilter === 'my' ? 'active my' : ''}`}
                  onClick={() => setMemberTypeFilter((prev) => (prev === 'my' ? 'all' : 'my'))}
                >
                  <strong>My</strong>
                  <span>{myMembersCount}</span>
                </button>
                <button
                  type="button"
                  className={`om-picker-chip ${memberTypeFilter === 'others' ? 'active others' : ''}`}
                  onClick={() => setMemberTypeFilter((prev) => (prev === 'others' ? 'all' : 'others'))}
                >
                  <strong>Others</strong>
                  <span>{otherMembersCount}</span>
                </button>
              </div>
              <div className="om-picker-role-row">
                <span>Role <em>{memberOptions.length}</em></span>
                <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                  <option value="all">All Roles ({memberOptions.length})</option>
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>
              <div className="om-picker-role-row">
                <span>Sort</span>
                <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                  <option value="name_asc">Name (A-Z)</option>
                  <option value="name_desc">Name (Z-A)</option>
                </select>
              </div>
              <input
                className="om-picker-search"
                placeholder="Search member..."
                value={memberPanelSearch}
                onChange={(event) => setMemberPanelSearch(event.target.value)}
              />
              <div className="om-picker-list">
                {filteredMemberOptions.length === 0 && (
                  <div className="om-picker-empty">No members found.</div>
                )}
                {paginatedMemberOptions.map((member) => {
                  const memberId = String(member.member_id || '');
                  const isSelected = memberId && memberId === selectedMemberId;
                  return (
                    <button
                      key={member.member_id}
                      type="button"
                      className={`om-picker-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectMember(member)}
                    >
                      <div>
                        <strong>{member.name || 'Member'}</strong>
                        <p>{member.membership_number || member.company_name || '-'}</p>
                      </div>
                      <span className={`om-picker-badge ${member.member_type === 'my' ? 'my' : 'others'}`}>
                        {member.member_type === 'my' ? 'My' : 'Others'}
                      </span>
                    </button>
                  );
                })}
              </div>
              {filteredMemberOptions.length > MEMBER_PICKER_PAGE_SIZE && (
                <div className="om-picker-pagination">
                  <button
                    type="button"
                    className="om-btn om-btn-muted"
                    onClick={() => setMemberPage((prev) => Math.max(prev - 1, 1))}
                    disabled={memberPage === 1}
                  >
                    Prev
                  </button>
                  <span>Page {memberPage} of {memberPickerTotalPages}</span>
                  <button
                    type="button"
                    className="om-btn om-btn-muted"
                    onClick={() => setMemberPage((prev) => Math.min(prev + 1, memberPickerTotalPages))}
                    disabled={memberPage === memberPickerTotalPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </aside>

            <div className={`om-layout ${isCreateRoute ? 'create-only' : 'records-only'}`}>
              {isCreateRoute && (
                <div className="om-card">
                  <div className="om-card-head">
                    <h3>{headingText}</h3>
                    <div className="om-card-head-actions">
                      <button type="button" className="om-btn om-btn-muted" onClick={navigateToRecords}>
                        Other Membership Records
                      </button>
                      <button type="button" className="om-close-btn" onClick={navigateToRecords} aria-label="Close form">
                        x
                      </button>
                    </div>
                  </div>
                  <div className="om-form-grid">
                    <label className="om-span-2">
                      <span>Member *</span>
                      <input
                        list="om-member-options"
                        value={memberSearch || memberLabelMap.get(String(form.member_id || '')) || ''}
                        onChange={(event) => {
                          const value = event.target.value;
                          setMemberSearch(value);
                          const matched = memberOptions.find(
                            (member) => formatMemberLabel(member).toLowerCase() === value.trim().toLowerCase()
                          );
                          if (isCreateRoute && matched && matched.member_type !== 'my') {
                            setForm((prev) => ({ ...prev, member_id: '' }));
                            setFormError('Other membership can be created only for My members.');
                            return;
                          }
                          setForm((prev) => ({
                            ...prev,
                            member_id: matched ? String(matched.member_id) : '',
                            member_name: matched ? prev.member_name || toText(matched.name) : prev.member_name,
                            member_phone: matched ? prev.member_phone || sanitizeDigits(matched.mobile) : prev.member_phone,
                          }));
                        }}
                        onBlur={() => {
                          if (!form.member_id) return;
                          const exactLabel = memberLabelMap.get(String(form.member_id));
                          if (exactLabel) setMemberSearch(exactLabel);
                        }}
                        placeholder="Type to search member"
                      />
                      <datalist id="om-member-options">
                        {memberOptions.map((member) => (
                          <option key={member.member_id} value={formatMemberLabel(member)} />
                        ))}
                      </datalist>
                    </label>
                    <label>
                      <span>Membership Number *</span>
                      <input
                        value={form.membership_no}
                        onChange={(event) => setForm((prev) => ({ ...prev, membership_no: event.target.value }))}
                        placeholder="Required membership_no"
                      />
                    </label>
                    <label>
                      <span>Member Name</span>
                      <input
                        value={form.member_name}
                        onChange={(event) => setForm((prev) => ({ ...prev, member_name: event.target.value }))}
                        placeholder="Optional member_name"
                      />
                    </label>
                    <label>
                      <span>Member Phone</span>
                      <input
                        value={form.member_phone}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(event) => setForm((prev) => ({ ...prev, member_phone: sanitizeDigits(event.target.value) }))}
                        placeholder="Optional member_phone"
                      />
                    </label>
                    <label>
                      <span>Organisation Name</span>
                      <input
                        value={form.organisation_name}
                        onChange={(event) => setForm((prev) => ({ ...prev, organisation_name: event.target.value }))}
                        placeholder="Optional organisation_name"
                      />
                    </label>
                    <label>
                      <span>Membership Type</span>
                      <input
                        value={form.membership_type}
                        onChange={(event) => setForm((prev) => ({ ...prev, membership_type: event.target.value }))}
                        placeholder="Optional membership_type"
                      />
                    </label>
                    <label className="om-span-2">
                      <span>Remark</span>
                      <textarea
                        rows="3"
                        value={form.remark}
                        onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))}
                        placeholder="Optional remark"
                      />
                    </label>
                    <label className="om-toggle">
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                      />
                      <span>Active</span>
                    </label>
                  </div>
                  <div className="om-actions">
                    <button
                      type="button"
                      className="om-btn om-btn-muted"
                      onClick={() => resetForm({ keepSelectedMember: true })}
                      disabled={saving}
                    >
                      Reset
                    </button>
                    <button type="button" className="om-btn om-btn-primary" onClick={handleSave} disabled={saving}>
                      {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              {!isCreateRoute && (
                <div className="om-card">
                  <div className="om-card-head">
                    <h3>{selectedMemberId ? 'Other Membership Records (Selected Member)' : 'Other Membership Records'}</h3>
                    <button type="button" className="om-btn om-btn-primary" onClick={navigateToCreateForm}>
                      Create Membership
                    </button>
                  </div>
                  {selectedMemberId && (
                    <p className="om-selected-member">
                      Member: {selectedMemberLabel || selectedMember?.name || '-'} | Type: {selectedMemberIsMy ? 'My' : 'Others'}
                    </p>
                  )}
                  {loading && <div className="om-empty">Loading...</div>}
                  {!loading && visibleMembershipRecords.length === 0 && (
                    <div className="om-empty">
                      {selectedMemberId ? 'No records for selected member yet.' : 'No records yet.'}
                    </div>
                  )}
                  {!loading && visibleMembershipRecords.length > 0 && (
                    <div className="om-list">
                      {visibleMembershipRecords.map((item) => (
                        <div key={item.id} className="om-item">
                          <div className="om-item-head">
                            <strong>{item.organisation_name || 'Organisation'}</strong>
                            <span className={`om-status ${item.is_active ? 'active' : 'inactive'}`}>
                              {item.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <div className="om-item-meta">
                            <span>Member: {item.__member_name || item.member_name || '-'} {item.member_phone ? `| ${item.member_phone}` : ''}</span>
                            <span>Membership No: {item.membership_no || '-'}</span>
                            <span>Type: {item.membership_type || '-'}</span>
                            <span>Created: {formatDate(item.created_at)}</span>
                          </div>
                          {item.remark && <div className="om-item-remark">{item.remark}</div>}
                          <div className="om-item-actions">
                            <button type="button" className="om-btn om-btn-muted" onClick={() => handleEdit(item)}>Edit</button>
                            <button type="button" className="om-btn om-btn-danger" onClick={() => handleDelete(item)}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
