import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Sidebar from '../components/Sidebar';
import {
  createMemberNomination,
  deleteMemberNomination,
  fetchFamilyMembersByMemberId,
  fetchMemberNominationsByTrust,
  fetchRegisteredMembersByTrust,
  updateMemberNomination,
} from '../services/membersService';
import './SimplePage.css';

const EMPTY_FORM = {
  member_id: '',
  reg_id: '',
  family_member_id: '',
  nominee_type: 'primary',
  status: 'pending',
};

const formatMemberLabel = (member = {}) =>
  `${member.membership_number ? `${member.membership_number} - ` : ''}${member.name || member.Name || 'Member'}`;

const formatDate = (value) => {
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
};

export default function NominationsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null, superuserId = null } = location.state || {};
  const trustId = trust?.id || null;
  const trustName = trust?.name || 'Trust';

  const [registeredMembers, setRegisteredMembers] = useState([]);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [nominations, setNominations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  const filteredNominations = useMemo(() => {
    if (!selectedMemberId) return nominations;
    return nominations.filter((item) => String(item.member_id || '') === selectedMemberId);
  }, [nominations, selectedMemberId]);

  const selectedFamilyMembers = useMemo(() => {
    if (!form.member_id) return [];
    return familyMembers;
  }, [familyMembers, form.member_id]);

  const loadData = async () => {
    if (!trustId) return;
    setLoading(true);
    setError('');

    const [registeredRes, nominationsRes] = await Promise.all([
      fetchRegisteredMembersByTrust(trustId),
      fetchMemberNominationsByTrust(trustId),
    ]);

    if (registeredRes.error) {
      setError(registeredRes.error.message || 'Unable to load registered members.');
      setLoading(false);
      return;
    }

    if (nominationsRes.error) {
      setError(nominationsRes.error.message || 'Unable to load nominations.');
      setLoading(false);
      return;
    }

    setRegisteredMembers(Array.isArray(registeredRes.data) ? registeredRes.data : []);
    setNominations(Array.isArray(nominationsRes.data) ? nominationsRes.data : []);
    setLoading(false);
  };

  useEffect(() => {
    if (!trustId) {
      navigate('/dashboard', { replace: true, state: { userName, trust, superuserId, sidebarNavKey: 'menu' } });
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trustId]);

  useEffect(() => {
    const run = async () => {
      if (!form.member_id) {
        setFamilyMembers([]);
        return;
      }
      const { data, error: familyError } = await fetchFamilyMembersByMemberId(form.member_id);
      if (familyError) {
        setFormError(familyError.message || 'Unable to load family members.');
        setFamilyMembers([]);
        return;
      }
      setFamilyMembers(Array.isArray(data) ? data : []);
      if (form.family_member_id && !data?.some((item) => String(item.id) === String(form.family_member_id))) {
        setForm((prev) => ({ ...prev, family_member_id: '' }));
      }
    };
    run();
  }, [form.member_id, form.family_member_id]);

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      member_id: String(item.member_id || ''),
      reg_id: String(item.reg_id || ''),
      family_member_id: String(item.family_member_id || ''),
      nominee_type: String(item.nominee_type || 'primary'),
      status: String(item.status || 'pending'),
    });
    setFormError('');
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!trustId) return;

    if (!form.member_id) return setFormError('Registered member is required.');
    if (!form.reg_id) return setFormError('Registration record is required.');
    if (!form.family_member_id) return setFormError('Family member is required.');

    setSaving(true);
    setFormError('');

    const payload = {
      member_id: form.member_id,
      reg_id: form.reg_id,
      family_member_id: form.family_member_id,
      nominee_type: form.nominee_type,
      status: form.status,
    };

    const result = editingId
      ? await updateMemberNomination(editingId, payload, trustId)
      : await createMemberNomination(payload, trustId);

    if (result.error) {
      setFormError(result.error.message || 'Unable to save nomination.');
      setSaving(false);
      return;
    }

    await loadData();
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaving(false);
  };

  const handleDelete = async (item) => {
    const confirmDelete = window.confirm('Delete this nomination?');
    if (!confirmDelete) return;
    const result = await deleteMemberNomination(item.id);
    if (result.error) {
      setError(result.error.message || 'Unable to delete nomination.');
      return;
    }
    loadData();
  };

  return (
    <div className="simple-root">
      <Sidebar
        trustName={trustName}
        onDashboard={() =>
          navigate('/dashboard', {
            state: {
              userName,
              trust,
              superuserId,
              sidebarNavKey: 'extra',
            },
          })
        }
        onLogout={() => navigate('/login')}
      />

      <main className="simple-main">
        <PageHeader
          title="Nominations"
          subtitle="Create trust nominations by linking a registered member to one of their family members."
          onBack={() =>
            navigate('/dashboard', {
              state: {
                userName,
                trust,
                superuserId,
                sidebarNavKey: 'extra',
              },
            })
          }
        />

        <div className="simple-content">
          <div className="simple-card">
            <div className="simple-head">
              <div>
                <h2 className="simple-title">Nomination Workflow</h2>
                <p className="simple-subtitle">Select a registered member, then map one of their family members as primary or secondary nominee.</p>
              </div>
              <div className="simple-head-badge">Extra Module</div>
            </div>

            <div className="simple-meta" style={{ marginTop: 0 }}>
              <div><strong>Trust:</strong> {trustName}</div>
              <div><strong>Registered Members:</strong> {registeredMembers.length}</div>
              <div><strong>Nominations:</strong> {nominations.length}</div>
            </div>

            {error && <div className="simple-msg simple-msg-error" style={{ marginTop: 16 }}>{error}</div>}

            <form className="simple-form" onSubmit={handleSave} style={{ marginTop: 20 }}>
              <label className="simple-field">
                <span>Registered Member</span>
                <select
                  value={form.member_id}
                  onChange={async (event) => {
                    const memberId = event.target.value;
                    const regRows = registeredMembers.filter((item) => String(item.member_id) === String(memberId));
                    setForm((prev) => ({
                      ...prev,
                      member_id: memberId,
                      reg_id: regRows[0]?.id || '',
                      family_member_id: '',
                    }));
                  }}
                >
                  <option value="">Select registered member</option>
                  {registeredMembers.map((item) => (
                    <option key={item.id} value={item.member_id}>
                      {formatMemberLabel(item)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="simple-field">
                <span>Registration Record</span>
                <select
                  value={form.reg_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, reg_id: event.target.value }))}
                  disabled={!form.member_id}
                >
                  <option value="">Select registration</option>
                  {registeredMembers
                    .filter((item) => String(item.member_id) === String(form.member_id))
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.membership_number ? `${item.membership_number} - ` : ''}{item.role || 'Registered'}
                      </option>
                    ))}
                </select>
              </label>

              <label className="simple-field">
                <span>Family Member</span>
                <select
                  value={form.family_member_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, family_member_id: event.target.value }))}
                  disabled={!form.member_id}
                >
                  <option value="">Select family member</option>
                  {selectedFamilyMembers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} - {item.relation}
                    </option>
                  ))}
                </select>
              </label>

              <label className="simple-field">
                <span>Nominee Type</span>
                <select
                  value={form.nominee_type}
                  onChange={(event) => setForm((prev) => ({ ...prev, nominee_type: event.target.value }))}
                >
                  <option value="primary">Primary</option>
                  <option value="secondary">Secondary</option>
                </select>
              </label>

              <label className="simple-field">
                <span>Status</span>
                <select
                  value={form.status}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="revoked">Revoked</option>
                </select>
              </label>

              <div className="simple-actions">
                <button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : editingId ? 'Update Nomination' : 'Save Nomination'}
                </button>
                <button
                  type="button"
                  className="simple-btn-secondary"
                  onClick={startCreate}
                  disabled={saving}
                >
                  Clear
                </button>
              </div>

              {formError && <div className="simple-msg simple-msg-error">{formError}</div>}
            </form>

            <div style={{ display: 'grid', gap: 14, marginTop: 24 }}>
              <div className="simple-head" style={{ marginBottom: 0 }}>
                <div>
                  <h2 className="simple-title" style={{ fontSize: 28 }}>Saved Nominations</h2>
                  <p className="simple-subtitle">Use these records to manage nominee status for each registered member.</p>
                </div>
                <select
                  value={selectedMemberId}
                  onChange={(event) => setSelectedMemberId(event.target.value)}
                  className="simple-field"
                  style={{ maxWidth: 320 }}
                >
                  <option value="">All members</option>
                  {registeredMembers.map((item) => (
                    <option key={`filter-${item.id}`} value={item.member_id}>
                      {formatMemberLabel(item)}
                    </option>
                  ))}
                </select>
              </div>

              {loading && <div className="simple-msg">Loading nominations...</div>}

              {!loading && filteredNominations.length === 0 && (
                <div className="simple-msg">No nominations found for this trust.</div>
              )}

              {!loading && filteredNominations.map((item) => (
                <article key={item.id} className="simple-card" style={{ padding: 18 }}>
                  <div className="simple-head" style={{ marginBottom: 12 }}>
                    <div>
                      <h3 className="simple-title" style={{ fontSize: 22, margin: 0 }}>
                        {item.family_member?.name || 'Family member'}
                      </h3>
                      <p className="simple-subtitle" style={{ marginTop: 6 }}>
                        {item.family_member?.relation || 'Relation unknown'} | {item.nominee_type} nominee
                      </p>
                    </div>
                    <div className="simple-head-badge">{item.status}</div>
                  </div>

                  <div className="simple-meta" style={{ marginTop: 0 }}>
                    <div><strong>Member:</strong> {item.member?.name || item.registration?.Name || 'Member'}</div>
                    <div><strong>Reg No:</strong> {item.registration?.['Membership number'] || item.registration?.membership_number || '-'}</div>
                    <div><strong>Updated:</strong> {formatDate(item.updated_at || item.created_at)}</div>
                  </div>

                  <div className="simple-actions" style={{ marginTop: 16 }}>
                    <button type="button" onClick={() => startEdit(item)}>Edit</button>
                    <button type="button" className="simple-btn-secondary" onClick={() => handleDelete(item)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
