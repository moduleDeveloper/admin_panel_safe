import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Sidebar from '../components/Sidebar';
import {
  ADMIN_MOBILE_SESSION_KEY,
  findMembersByMobile,
  findTrustsByMemberId,
} from '../services/authService';
import './SimplePage.css';
import './LinkedTrustsPage.css';

function normalizeMobile(value = '') {
  return String(value).replace(/\D/g, '').slice(-10);
}

function buildTrustMeta(trust) {
  return [
    trust?.registration?.membership_number ? { label: 'Membership No', value: trust.registration.membership_number } : null,
    trust?.registration?.role ? { label: 'Role', value: trust.registration.role } : null,
  ].filter(Boolean);
}

function buildMemberMeta(member) {
  if (!member) return [];
  return [
    member?.Name ? { label: 'Name', value: member.Name } : null,
    member?.Mobile ? { label: 'Mobile', value: member.Mobile } : null,
    member?.Email ? { label: 'Email', value: member.Email } : null,
    member['Address Home'] ? { label: 'Address Home', value: member['Address Home'] } : null,
    member['Company Name'] ? { label: 'Company Name', value: member['Company Name'] } : null,
    member['Address Office'] ? { label: 'Address Office', value: member['Address Office'] } : null,
    member['Office Landline'] ? { label: 'Office Landline', value: member['Office Landline'] } : null,
  ].filter(Boolean);
}

function buildMemberLabel(member) {
  if (!member) return 'Untitled Member';
  return member.Name || member.name || member['Company Name'] || 'Untitled Member';
}

export default function LinkedTrustsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null, superuserId = null } = location.state || {};
  const trustName = trust?.name || 'Trust';
  const storedMobile =
    typeof window !== 'undefined' ? window.sessionStorage.getItem(ADMIN_MOBILE_SESSION_KEY) || '' : '';

  const [mobile, setMobile] = useState(() => normalizeMobile(location.state?.phone || location.state?.fullMobile || storedMobile));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchedMobile, setSearchedMobile] = useState('');
  const [members, setMembers] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [trusts, setTrusts] = useState([]);

  const resultCountLabel = useMemo(() => {
    if (!searchedMobile) return 'Search a mobile number to view linked trusts.';
    if (!members.length) return `No registered member found for this number ${searchedMobile}.`;
    return `We found ${members.length} member${members.length === 1 ? '' : 's'} for this number ${searchedMobile}.`;
  }, [searchedMobile, members.length]);
  const selectedMember = useMemo(
    () => members.find((item) => String(item.members_id) === String(selectedMemberId)) || null,
    [members, selectedMemberId]
  );

  const handleSearch = async (event) => {
    event.preventDefault();
    const normalized = normalizeMobile(mobile);
    if (normalized.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.');
      setMembers([]);
      setSelectedMemberId('');
      setTrusts([]);
      return;
    }

    setLoading(true);
    setError('');
    setSearchedMobile(normalized);

    const { data: memberData, error: lookupError } = await findMembersByMobile(normalized);
    if (lookupError) {
      setError(lookupError.message || 'Unable to search this mobile number right now.');
      setMembers([]);
      setSelectedMemberId('');
      setTrusts([]);
      setLoading(false);
      return;
    }

    if (!memberData?.length) {
      setError('No registered member found for this mobile number.');
      setMembers([]);
      setSelectedMemberId('');
      setTrusts([]);
      setLoading(false);
      return;
    }

    setMembers(Array.isArray(memberData) ? memberData : []);
    const firstMemberId = memberData[0]?.members_id || '';
    setSelectedMemberId(firstMemberId);
    const { data: trustData, error: trustError } = await findTrustsByMemberId(firstMemberId);
    if (trustError) {
      setError(trustError.message || 'Unable to load trusts for selected member.');
      setTrusts([]);
      setLoading(false);
      return;
    }
    setTrusts(Array.isArray(trustData) ? trustData : []);
    setLoading(false);
  };

  const handleMemberSelect = async (memberItem) => {
    const memberId = memberItem?.members_id || '';
    if (!memberId) return;
    setSelectedMemberId(memberId);
    setLoading(true);
    setError('');
    const { data: trustData, error: trustError } = await findTrustsByMemberId(memberId);
    if (trustError) {
      setError(trustError.message || 'Unable to load trusts for selected member.');
      setTrusts([]);
    } else {
      setTrusts(Array.isArray(trustData) ? trustData : []);
    }
    setLoading(false);
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
          title="Linked Trusts"
          subtitle="Search a mobile number and view every trust connected with that member."
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
          <div className="simple-card lt-shell">
            <div className="simple-head lt-hero-head">
              <div>
                <h2 className="simple-title lt-title">Linked Trust Lookup</h2>
                <p className="simple-subtitle lt-subtitle">Find trust name, logo, description and member-linked trust details from a mobile number.</p>
              </div>
              <div className="simple-head-badge lt-head-badge">Member Search</div>
            </div>

            <form className="simple-form lt-search-panel" onSubmit={handleSearch}>
              <label className="simple-field lt-search-field">
                <span>Mobile Number</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  value={mobile}
                  onChange={(event) => setMobile(normalizeMobile(event.target.value))}
                  placeholder="Enter 10-digit mobile number"
                />
              </label>

              <div className="simple-actions lt-search-actions">
                <button type="submit" disabled={loading}>
                  {loading ? 'Searching...' : 'Search Trusts'}
                </button>
                <button
                  type="button"
                  className="simple-btn-secondary"
                  onClick={() => {
                    setMobile('');
                    setSearchedMobile('');
                    setMembers([]);
                    setSelectedMemberId('');
                    setTrusts([]);
                    setError('');
                  }}
                  disabled={loading}
                >
                  Clear
                </button>
              </div>
            </form>

            {error && <div className="simple-msg simple-msg-error lt-error">{error}</div>}

            <div className="lt-notice">
              <div className="lt-notice-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 8v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="16.5" r="1" fill="currentColor" />
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </div>
              <div className="lt-notice-copy">
                <strong>{resultCountLabel}</strong>
                <span>
                  {members.length
                    ? 'Select a member name to load the trusts linked to that member.'
                    : 'Matching members will appear here after search.'}
                </span>
              </div>
            </div>

            {members.length > 0 && (
              <div className="lt-trust-strip" aria-label="Matching member names">
                {members.map((item) => {
                  const active = String(item.members_id) === String(selectedMemberId);
                  return (
                    <button
                      key={`member-${item.members_id}`}
                      type="button"
                      className={`lt-trust-chip lt-member-chip ${active ? 'active' : ''}`}
                      onClick={() => handleMemberSelect(item)}
                    >
                      <div className="lt-trust-chip-logo">
                        {(item.Name || 'M').charAt(0).toUpperCase()}
                      </div>
                      <span className="lt-trust-chip-name" title={buildMemberLabel(item)}>
                        {buildMemberLabel(item)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedMember && (
              <div className="lt-member-panel lt-member-panel-single">
                <div className="lt-member-panel-head">
                  <div>
                    <div className="lt-section-kicker">Registered Member</div>
                    <div className="lt-section-title">Member Details</div>
                  </div>
                </div>
                <div className="lt-detail-grid">
                  {buildMemberMeta(selectedMember).map((entry) => (
                    <div key={`selected-member-${entry.label}`} className="lt-detail-item">
                      <span>{entry.label}</span>
                      <strong>{entry.value}</strong>
                    </div>
                  ))}
                </div>
                <div className="lt-member-note">
                  {`${buildMemberLabel(selectedMember)} is registered with this number in ${trusts.length} trust${trusts.length === 1 ? '' : 's'}.`}
                </div>
              </div>
            )}

            {trusts.length > 0 && (
              <div className="lt-trust-strip lt-trust-strip-inline" aria-label="Linked trust logos">
                {trusts.map((item) => (
                  <div key={`trust-${item.id}`} className="lt-trust-chip lt-trust-chip-trust">
                    <div className="lt-trust-chip-logo">
                      {item.icon_url ? (
                        <img
                          src={item.icon_url}
                          alt={item.name || 'Trust logo'}
                          className="lt-trust-chip-image"
                        />
                      ) : (
                        (item.name || 'T').charAt(0).toUpperCase()
                      )}
                    </div>
                    <span className="lt-trust-chip-name" title={item.name || 'Untitled Trust'}>
                      {item.name || 'Untitled Trust'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="lt-results-list">
              {!members.length && !loading && searchedMobile && !error && (
                <div className="lt-empty-state">No registered member found for this number.</div>
              )}
              {trusts.map((item) => {
                const meta = buildTrustMeta(item);
                return (
                  <article key={item.id} className="lt-card">
                    <div className="lt-card-top">
                      <div className="lt-logo">
                        {item.icon_url ? (
                          <img
                            src={item.icon_url}
                            alt={item.name || 'Trust logo'}
                            className="lt-logo-image"
                          />
                        ) : (
                          (item.name || 'T').charAt(0).toUpperCase()
                        )}
                      </div>

                      <div className="lt-card-main">
                        <div className="lt-card-headline">
                          <div>
                            <h3 className="lt-card-title">{item.name || 'Untitled Trust'}</h3>
                            <p className="lt-card-description">
                              {`You are registered with ${item.name || 'this trust'} using this number.`}
                            </p>
                          </div>
                        </div>

                        <div className="lt-pill-row">
                          {meta.map((entry) => (
                            <div key={`${item.id}-${entry.label}`} className="lt-pill">
                              <span>{entry.label}</span>
                              <strong>{entry.value}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
