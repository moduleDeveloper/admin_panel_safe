import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../../../core/components/PageHeader';
import Sidebar from '../../../core/components/Sidebar';
import {
  createFamilyMember,
  deleteFamilyMember,
  fetchFamilyMembersByMemberId,
  fetchRegisteredMembersByTrust,
  updateFamilyMember,
} from '../../../core/services/membersService';
import './MyFamilyPage.css';

const GENDER_OPTIONS = ['Male', 'Female', 'Other'];
const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const MEMBER_PICKER_PAGE_SIZE = 10;

const EMPTY_FORM = {
  members_id: '',
  name: '',
  relation: '',
  gender: '',
  age: '',
  blood_group: '',
  contact_no: '',
  email: '',
  address: '',
};

const sanitizeDigits = (value) => String(value ?? '').replace(/\D+/g, '');
const toText = (value) => (value === null || value === undefined ? '' : String(value));
const formatMemberLabel = (member = {}) =>
  `${member.membership_number ? `${member.membership_number} - ` : ''}${member.name || 'Member'}`;
const buildFamilyFormFromItem = (item = {}) => ({
  members_id: toText(item.members_id),
  name: toText(item.name),
  relation: toText(item.relation),
  gender: toText(item.gender),
  age: toText(item.age),
  blood_group: toText(item.blood_group),
  contact_no: toText(item.contact_no),
  email: toText(item.email),
  address: toText(item.address),
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

export default function MyFamilyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null } = location.state || {};
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'menu';
  const trustId = trust?.id || null;
  const isCreateRoute = location.pathname === '/my-family/create_family_member';
  const routeMemberId = useMemo(
    () => new URLSearchParams(location.search).get('memberId') || '',
    [location.search]
  );
  const initialEditItem = location.state?.familyEditItem || null;

  const [memberOptions, setMemberOptions] = useState([]);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [ageError, setAgeError] = useState('');
  const [contactError, setContactError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(() => initialEditItem?.id || null);
  const [form, setForm] = useState(() => {
    if (initialEditItem?.id) return buildFamilyFormFromItem(initialEditItem);
    if (isCreateRoute && routeMemberId) return { ...EMPTY_FORM, members_id: String(routeMemberId) };
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

  const headingText = useMemo(
    () => (editingId ? 'Update Family Member' : 'Create Family Member'),
    [editingId]
  );
  const selectedMemberId = String(form.members_id || '');
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

  const visibleFamilyRecords = useMemo(() => {
    if (!selectedMemberId) return list;
    return list.filter((item) => String(item.members_id || '') === selectedMemberId);
  }, [list, selectedMemberId]);

  const resetForm = ({ keepSelectedMember = false } = {}) => {
    const nextMemberId = keepSelectedMember ? selectedMemberId : '';
    setForm({ ...EMPTY_FORM, members_id: nextMemberId });
    setMemberSearch(keepSelectedMember ? selectedMemberLabel : '');
    setEditingId(null);
    setFormError('');
    setAgeError('');
    setContactError('');
  };

  const handleSelectMember = (member) => {
    if (isCreateRoute && member.member_type !== 'my') {
      setFormError('Family member can be created only for My members.');
      return;
    }
    const label = formatMemberLabel(member);
    setForm((prev) => ({ ...prev, members_id: String(member.member_id) }));
    setMemberSearch(label);
    setContactError('');
    if (
      formError === 'Member is required.' ||
      formError === 'Please select member from list.' ||
      formError === 'Family member can be created only for My members.'
    ) {
      setFormError('');
    }
  };

  const navigateToCreateForm = () => {
    const memberIdParam = selectedMemberId && selectedMemberIsMy
      ? `?memberId=${encodeURIComponent(selectedMemberId)}`
      : '';
    navigate(`/my-family/create_family_member${memberIdParam}`, {
      state: { userName, trust, sidebarNavKey: currentSidebarNavKey },
    });
  };

  const navigateToRecords = () => {
    const memberIdParam = selectedMemberId ? `?memberId=${encodeURIComponent(selectedMemberId)}` : '';
    navigate(`/my-family${memberIdParam}`, {
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

      const { data: membersData, error: membersError } = await fetchRegisteredMembersByTrust(trustId);
      if (membersError) {
        setError(membersError.message || 'Unable to load trust members.');
        setMemberOptions([]);
        setList([]);
        setLoading(false);
        return;
      }

      const members = membersData || [];
      setMemberOptions(members);
      setLoading(false);
    };

    load();
  }, [navigate, trustId, userName, trust]);

  useEffect(() => {
    if (!trustId || isCreateRoute) return;

    let cancelled = false;
    const loadSelectedMemberFamily = async () => {
      if (!selectedMemberId) {
        setList([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      const { data, error: familyError } = await fetchFamilyMembersByMemberId(selectedMemberId);
      if (cancelled) return;

      if (familyError) {
        setError(familyError.message || 'Unable to load family records.');
        setList([]);
        setLoading(false);
        return;
      }

      const memberName = memberNameMap.get(String(selectedMemberId)) || 'Member';
      const records = (data || []).map((row) => ({
        ...row,
        __member_name: memberName,
      }));
      records.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      setList(records);
      setLoading(false);
    };

    loadSelectedMemberFamily();
    return () => {
      cancelled = true;
    };
  }, [trustId, isCreateRoute, selectedMemberId, memberNameMap]);

  const handleSave = async () => {
    if (!form.members_id) {
      setFormError(memberSearch ? 'Please select member from list.' : 'Member is required.');
      return;
    }
    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (!form.relation.trim()) {
      setFormError('Relation is required.');
      return;
    }
    if (!selectedMember || selectedMember.member_type !== 'my') {
      setFormError('Family member can be created only for My members.');
      return;
    }
    if (form.age !== '' && Number(form.age) < 1) {
      setFormError('Age should be greater than 0.');
      setAgeError('Age should be greater than 0.');
      return;
    }
    const cleanedContact = sanitizeDigits(form.contact_no);
    if (cleanedContact !== '' && cleanedContact.length !== 10) {
      setFormError('Contact number must be exactly 10 digits.');
      setContactError('Contact number must be exactly 10 digits.');
      return;
    }

    setSaving(true);
    setFormError('');
    setAgeError('');
    setContactError('');
    const payload = {
      name: form.name.trim(),
      relation: form.relation.trim(),
      gender: form.gender || null,
      age: form.age === '' ? null : Number(form.age),
      blood_group: form.blood_group || null,
      contact_no: cleanedContact || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
    };

    const savingMemberId = String(form.members_id || '');
    const action = editingId
      ? updateFamilyMember(editingId, form.members_id, payload)
      : createFamilyMember(form.members_id, payload);

    const { data, error: saveError } = await action;
    if (saveError) {
      setFormError(saveError.message || 'Unable to save family member.');
      setSaving(false);
      return;
    }

    const decorated = {
      ...data,
      __member_name: memberNameMap.get(String(form.members_id)) || 'Member',
    };

    setList((prev) => {
      if (editingId) return prev.map((item) => (item.id === decorated.id ? decorated : item));
      return [decorated, ...prev];
    });

    if (isCreateRoute) {
      navigate(`/my-family?memberId=${encodeURIComponent(savingMemberId)}`, {
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
      navigate(`/my-family/create_family_member?memberId=${encodeURIComponent(String(item.members_id || ''))}`, {
        state: { userName, trust, sidebarNavKey: currentSidebarNavKey, familyEditItem: item },
      });
      return;
    }

    setEditingId(item.id);
    setForm(buildFamilyFormFromItem(item));
    setMemberSearch(memberLabelMap.get(toText(item.members_id)) || '');
    setFormError('');
    setAgeError('');
    setContactError('');
  };

  const handleDelete = async (item) => {
    const ok = window.confirm('Delete this family member?');
    if (!ok) return;
    const { error: deleteError } = await deleteFamilyMember(item.id, item.members_id);
    if (deleteError) {
      setError(deleteError.message || 'Unable to delete family member.');
      return;
    }
    setList((prev) => prev.filter((entry) => entry.id !== item.id));
    if (editingId === item.id) resetForm();
  };

  return (
    <div className="mf-root">
      <Sidebar
        trustName={trust?.name || 'Trust'}
        onDashboard={() => navigate('/dashboard', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } })}
        onLogout={() => navigate('/login')}
      />

      <main className="mf-main">
        <PageHeader
          title="My Family"
          subtitle="Manage records from family_members table"
          onBack={() => navigate('/dashboard', { state: { userName, trust, sidebarNavKey: 'menu' } })}
        />

        <section className="mf-content">
          {error && <div className="mf-error">{error}</div>}
          {formError && <div className="mf-error">{formError}</div>}
          <div className="mf-shell">
            <aside className="mf-member-picker">
              <div className="mf-picker-head">
                <h3>All Members</h3>
                <span>{memberOptions.length}</span>
              </div>
              <div className="mf-picker-type-row">
                <button
                  type="button"
                  className={`mf-picker-chip ${memberTypeFilter === 'my' ? 'active my' : ''}`}
                  onClick={() => setMemberTypeFilter((prev) => (prev === 'my' ? 'all' : 'my'))}
                >
                  <strong>My</strong>
                  <span>{myMembersCount}</span>
                </button>
                <button
                  type="button"
                  className={`mf-picker-chip ${memberTypeFilter === 'others' ? 'active others' : ''}`}
                  onClick={() => setMemberTypeFilter((prev) => (prev === 'others' ? 'all' : 'others'))}
                >
                  <strong>Others</strong>
                  <span>{otherMembersCount}</span>
                </button>
              </div>
              <div className="mf-picker-role-row">
                <span>Role <em>{memberOptions.length}</em></span>
                <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                  <option value="all">All Roles ({memberOptions.length})</option>
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>
              <div className="mf-picker-role-row">
                <span>Sort</span>
                <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                  <option value="name_asc">Name (A-Z)</option>
                  <option value="name_desc">Name (Z-A)</option>
                </select>
              </div>
              <input
                className="mf-picker-search"
                placeholder="Search member..."
                value={memberPanelSearch}
                onChange={(event) => setMemberPanelSearch(event.target.value)}
              />
              <div className="mf-picker-list">
                {filteredMemberOptions.length === 0 && (
                  <div className="mf-picker-empty">No members found.</div>
                )}
                {paginatedMemberOptions.map((member) => {
                  const memberId = String(member.member_id || '');
                  const isSelected = memberId && memberId === selectedMemberId;
                  return (
                    <button
                      key={member.member_id}
                      type="button"
                      className={`mf-picker-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectMember(member)}
                    >
                      <div>
                        <strong>{member.name || 'Member'}</strong>
                        <p>{member.membership_number || member.company_name || '-'}</p>
                      </div>
                      <span className={`mf-picker-badge ${member.member_type === 'my' ? 'my' : 'others'}`}>
                        {member.member_type === 'my' ? 'My' : 'Others'}
                      </span>
                    </button>
                  );
                })}
              </div>
              {filteredMemberOptions.length > MEMBER_PICKER_PAGE_SIZE && (
                <div className="mf-picker-pagination">
                  <button
                    type="button"
                    className="mf-btn mf-btn-muted"
                    onClick={() => setMemberPage((prev) => Math.max(prev - 1, 1))}
                    disabled={memberPage === 1}
                  >
                    Prev
                  </button>
                  <span>Page {memberPage} of {memberPickerTotalPages}</span>
                  <button
                    type="button"
                    className="mf-btn mf-btn-muted"
                    onClick={() => setMemberPage((prev) => Math.min(prev + 1, memberPickerTotalPages))}
                    disabled={memberPage === memberPickerTotalPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </aside>

            <div className={`mf-layout ${isCreateRoute ? 'create-only' : 'records-only'}`}>
              {isCreateRoute && (
                <div className="mf-card">
                  <div className="mf-card-head">
                    <h3>{headingText}</h3>
                    <button type="button" className="mf-btn mf-btn-muted" onClick={navigateToRecords}>
                      Family Records
                    </button>
                  </div>
                  <div className="mf-form-grid">
                <label>
                  <span>Member *</span>
                  <input
                    list="mf-member-options"
                    value={memberSearch || memberLabelMap.get(String(form.members_id || '')) || ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      setMemberSearch(value);
                      const matched = memberOptions.find(
                        (member) => formatMemberLabel(member).toLowerCase() === value.trim().toLowerCase()
                      );
                      if (isCreateRoute && matched && matched.member_type !== 'my') {
                        setForm((prev) => ({ ...prev, members_id: '' }));
                        setFormError('Family member can be created only for My members.');
                        return;
                      }
                      setForm((prev) => ({ ...prev, members_id: matched ? String(matched.member_id) : '' }));
                    }}
                    onBlur={() => {
                      if (!form.members_id) return;
                      const exactLabel = memberLabelMap.get(String(form.members_id));
                      if (exactLabel) setMemberSearch(exactLabel);
                    }}
                    placeholder="Type to search member"
                  />
                  <datalist id="mf-member-options">
                    {memberOptions.map((member) => (
                      <option key={member.member_id} value={formatMemberLabel(member)} />
                    ))}
                  </datalist>
                </label>
                <label>
                  <span>Name *</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Family member name"
                  />
                </label>
                <label>
                  <span>Relation *</span>
                  <input
                    value={form.relation}
                    onChange={(event) => setForm((prev) => ({ ...prev, relation: event.target.value }))}
                    placeholder="Relation"
                  />
                </label>
                <div className="mf-field">
                  <span>Gender</span>
                  <div className="mf-radio-group" role="radiogroup" aria-label="Gender">
                    {GENDER_OPTIONS.map((option) => (
                      <label key={option} className="mf-radio-option">
                        <input
                          type="radio"
                          name="family-gender"
                          value={option}
                          checked={form.gender === option}
                          onChange={(event) => setForm((prev) => ({ ...prev, gender: event.target.value }))}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <label>
                  <span>Age</span>
                  <input
                    className={ageError ? 'mf-input-error' : ''}
                    type="number"
                    min="1"
                    step="1"
                    aria-invalid={ageError ? 'true' : 'false'}
                    value={form.age}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (nextValue === '') {
                        setForm((prev) => ({ ...prev, age: '' }));
                        setAgeError('');
                        if (formError === 'Age should be greater than 0.') setFormError('');
                        return;
                      }
                      const parsed = Number(nextValue);
                      if (!Number.isFinite(parsed)) return;
                      setForm((prev) => ({ ...prev, age: String(parsed) }));
                      if (parsed <= 0) {
                        setAgeError('Age should be greater than 0.');
                      } else {
                        setAgeError('');
                        if (formError === 'Age should be greater than 0.') setFormError('');
                      }
                    }}
                    placeholder="Age"
                  />
                  {ageError && <span className="mf-field-error">{ageError}</span>}
                </label>
                <label>
                  <span>Blood Group</span>
                  <select
                    value={form.blood_group}
                    onChange={(event) => setForm((prev) => ({ ...prev, blood_group: event.target.value }))}
                  >
                    <option value="">Select</option>
                    {BLOOD_GROUP_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Contact No</span>
                  <input
                    className={contactError ? 'mf-input-error' : ''}
                    value={form.contact_no}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={10}
                    aria-invalid={contactError ? 'true' : 'false'}
                    onChange={(event) => {
                      const cleaned = sanitizeDigits(event.target.value).slice(0, 10);
                      setForm((prev) => ({ ...prev, contact_no: cleaned }));
                      if (cleaned === '' || cleaned.length === 10) {
                        setContactError('');
                        if (formError === 'Contact number must be exactly 10 digits.') setFormError('');
                      } else {
                        setContactError('Contact number must be exactly 10 digits.');
                      }
                    }}
                    placeholder="Contact number"
                  />
                  {contactError && <span className="mf-field-error">{contactError}</span>}
                </label>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="Email"
                  />
                </label>
                <label className="mf-span-2">
                  <span>Address</span>
                  <textarea
                    rows="3"
                    value={form.address}
                    onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                    placeholder="Address"
                  />
                </label>
                  </div>
                  <div className="mf-actions">
                    <button type="button" className="mf-btn mf-btn-muted" onClick={resetForm} disabled={saving}>
                      Reset
                    </button>
                    <button type="button" className="mf-btn mf-btn-primary" onClick={handleSave} disabled={saving}>
                      {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              {!isCreateRoute && (
                <div className="mf-card">
                  <div className="mf-card-head">
                    <h3>{selectedMemberId ? 'Family Records (Selected Member)' : 'Family Records'}</h3>
                    <button type="button" className="mf-btn mf-btn-primary" onClick={navigateToCreateForm}>
                      Create Family Member
                    </button>
                  </div>
                  {loading && <div className="mf-empty">Loading...</div>}
                  {!loading && visibleFamilyRecords.length === 0 && (
                    <div className="mf-empty">
                      {selectedMemberId ? 'No family records for selected member yet.' : 'No family records yet.'}
                    </div>
                  )}
                  {!loading && visibleFamilyRecords.length > 0 && (
                    <div className="mf-list">
                      {visibleFamilyRecords.map((item) => (
                        <div key={item.id} className="mf-item">
                          <div className="mf-item-head">
                            <strong>{item.name || 'Family Member'}</strong>
                            <span className="mf-item-relation">{item.relation || '-'}</span>
                          </div>
                          <div className="mf-item-meta">
                            <span>Member: {item.__member_name || '-'}</span>
                            <span>Gender: {item.gender || '-'}</span>
                            <span>Age: {toText(item.age) || '-'}</span>
                            <span>Blood Group: {item.blood_group || '-'}</span>
                            <span>Contact: {item.contact_no || '-'} {item.email ? `| ${item.email}` : ''}</span>
                            <span>Created: {formatDate(item.created_at)}</span>
                            <span>Updated: {formatDate(item.updated_at)}</span>
                          </div>
                          {item.address && <div className="mf-item-address">{item.address}</div>}
                          <div className="mf-item-actions">
                            <button type="button" className="mf-btn mf-btn-muted" onClick={() => handleEdit(item)}>Edit</button>
                            <button type="button" className="mf-btn mf-btn-danger" onClick={() => handleDelete(item)}>Delete</button>
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
