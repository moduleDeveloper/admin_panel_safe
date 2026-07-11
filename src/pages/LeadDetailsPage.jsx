import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import './LeadManagementPage.css';
import './LeadDetailsPage.css';
import {
  fetchLeadChatHistory,
  fetchMatchedMembersByMobile,
  insertMktAction,
  fetchTrustOwnerDetailsByMobile,
  fetchTrustMembersByMobile,
} from '../services/leadsService';

function formatCellValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === 'object') {
          return item.trust_name || item.name || item.membership_number || '';
        }
        return String(item);
      })
      .filter(Boolean)
      .join(', ') || '-';
  }
  if (typeof value === 'object') {
    return value.trust_name || value.name || value.membership_number || '-';
  }
  return String(value);
}

function formatChatDateLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Unknown date';
  const isoValue = raw.replace(' ', 'T');
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatChatTimeLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const [, timePart = ''] = raw.split(' ');
  return timePart || raw;
}

function parseChatTimestamp(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const parsed = Date.parse(raw.replace(' ', 'T'));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeChatHistory(data) {
  if (Array.isArray(data?.chat)) return data.chat;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data)) return data;
  return [];
}

function normalizeActionMobile(value) {
  const digitsOnly = String(value || '').replace(/\D/g, '');
  if (!digitsOnly) return '';
  if (digitsOnly.length === 10) return `91${digitsOnly}`;
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) return `91${digitsOnly.slice(1)}`;
  return digitsOnly;
}

export default function LeadDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const { userName = 'Admin', trust = null, superuserId = null, lead = null } = location.state || {};
  const trustName = trust?.name || 'Trust';
  const leadMobile = String(lead?.mobile || '').trim();
  const leadName = String(lead?.name || '').trim();
  const [loading, setLoading] = useState(true);
  const [memberError, setMemberError] = useState('');
  const [members, setMembers] = useState([]);
  const [trustLoading, setTrustLoading] = useState(true);
  const [trustError, setTrustError] = useState('');
  const [trustMembers, setTrustMembers] = useState([]);
  const [trustOwnerLoading, setTrustOwnerLoading] = useState(true);
  const [trustOwnerError, setTrustOwnerError] = useState('');
  const [trustOwnerDetails, setTrustOwnerDetails] = useState([]);
  const [chatLoading, setChatLoading] = useState(true);
  const [chatError, setChatError] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatSortOrder, setChatSortOrder] = useState('desc');
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [actionSaving, setActionSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionForm, setActionForm] = useState({
    name: '',
    marks: '',
    trigger: '',
    action: '',
    flow: '',
  });
  const chatScrollRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const loadMatchedMembers = async () => {
      if (!leadMobile) {
        if (isMounted) {
          setMembers([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setMemberError('');

      const { data, error } = await fetchMatchedMembersByMobile({
        trustId: trust?.id || '',
        mobile: leadMobile,
        force: true,
      });

      if (!isMounted) return;

      if (error) {
        setMemberError(error.message || 'Unable to load matched member.');
        setMembers([]);
        setLoading(false);
        return;
      }

      setMembers(Array.isArray(data?.members) ? data.members : []);
      setLoading(false);
    };

    loadMatchedMembers();

    return () => {
      isMounted = false;
    };
  }, [leadMobile, trust?.id]);

  useEffect(() => {
    let isMounted = true;

    const loadTrustMembers = async () => {
      if (!leadMobile) {
        if (isMounted) {
          setTrustMembers([]);
          setTrustLoading(false);
        }
        return;
      }

      setTrustLoading(true);
      setTrustError('');

      const { data, error } = await fetchTrustMembersByMobile({
        trustId: trust?.id || '',
        trustName,
        mobile: leadMobile,
        force: true,
      });

      if (!isMounted) return;

      if (error) {
        setTrustError(error.message || 'Unable to load trust member details.');
        setTrustMembers([]);
        setTrustLoading(false);
        return;
      }

      setTrustMembers(Array.isArray(data?.members) ? data.members : []);
      setTrustLoading(false);
    };

    loadTrustMembers();

    return () => {
      isMounted = false;
    };
  }, [leadMobile, trust?.id, trustName]);

  useEffect(() => {
    let isMounted = true;

    const loadTrustOwnerDetails = async () => {
      if (!leadMobile) {
        if (isMounted) {
          setTrustOwnerDetails([]);
          setTrustOwnerLoading(false);
        }
        return;
      }

      setTrustOwnerLoading(true);
      setTrustOwnerError('');

      const { data, error } = await fetchTrustOwnerDetailsByMobile({
        trustId: trust?.id || '',
        mobile: leadMobile,
        force: true,
      });

      if (!isMounted) return;

      if (error) {
        setTrustOwnerError(error.message || 'Unable to load trust owner details.');
        setTrustOwnerDetails([]);
        setTrustOwnerLoading(false);
        return;
      }

      setTrustOwnerDetails(Array.isArray(data?.trusts) ? data.trusts : []);
      setTrustOwnerLoading(false);
    };

    loadTrustOwnerDetails();

    return () => {
      isMounted = false;
    };
  }, [leadMobile, trust?.id]);

  useEffect(() => {
    let isMounted = true;

    const loadChatHistory = async () => {
      if (!leadMobile) {
        if (isMounted) {
          setChatHistory([]);
          setChatLoading(false);
        }
        return;
      }

      setChatLoading(true);
      setChatError('');

      const { data, error } = await fetchLeadChatHistory({
        trustId: trust?.id || '',
        mobile: leadMobile,
        force: true,
      });

      if (!isMounted) return;

      if (error) {
        setChatError(error.message || 'Unable to load chat history.');
        setChatHistory([]);
        setChatLoading(false);
        return;
      }

      setChatHistory(normalizeChatHistory(data));
      setChatLoading(false);
    };

    loadChatHistory();

    return () => {
      isMounted = false;
    };
  }, [leadMobile, trust?.id]);

  const selectedMember = members[0] || null;
  const selectedTrustMember = trustMembers[0] || null;
  const openActionModal = () => {
    setActionForm({
      name: leadName,
      marks: String(lead?.marks || '').trim(),
      trigger: '',
      action: '',
      flow: '',
    });
    setActionError('');
    setIsActionModalOpen(true);
  };

  const closeActionModal = () => {
    if (actionSaving) return;
    setIsActionModalOpen(false);
    setActionError('');
  };

  const handleActionFieldChange = (field) => (event) => {
    const { value } = event.target;
    setActionForm((current) => ({ ...current, [field]: value }));
  };

  const handleAddAction = async (event) => {
    event.preventDefault();
    if (!leadMobile) {
      setActionError('Mobile number is missing for this lead.');
      return;
    }

    setActionSaving(true);
    setActionError('');

    const { error } = await insertMktAction({
      name: actionForm.name,
      mobile: normalizeActionMobile(leadMobile),
      source: 'admin panel',
      action: actionForm.action,
      trigger: actionForm.trigger,
      flow: actionForm.flow,
      type: 'marketing',
    });

    if (error) {
      setActionError(error.message || 'Unable to add action.');
      setActionSaving(false);
      return;
    }

    const { data, error: chatReloadError } = await fetchLeadChatHistory({
      trustId: trust?.id || '',
      mobile: leadMobile,
      force: true,
    });

    if (chatReloadError) {
      setChatError(chatReloadError.message || 'Action added, but chat history did not refresh.');
    } else {
      setChatError('');
      setChatHistory(normalizeChatHistory(data));
    }

    setIsActionModalOpen(false);
    setActionForm({
      name: '',
      marks: '',
      trigger: '',
      action: '',
      flow: '',
    });
    setActionSaving(false);
  };

  const leadEntries = useMemo(
    () => [
      { key: 'name', label: 'Name', value: lead?.name || '' },
      { key: 'marks', label: 'Marks', value: lead?.marks || '' },
      { key: 'mobile', label: 'Mobile', value: lead?.mobile || '' },
      { key: 'type', label: 'Type', value: lead?.type || lead?.last_type || '' },
      { key: 'last_flow', label: 'Last Message', value: lead?.last_flow || lead?.flow || '' },
      { key: 'last_action', label: 'Last Action', value: lead?.last_action || lead?.action || '' },
      { key: 'source', label: 'Source', value: lead?.source || lead?.last_source || '' },
    ],
    [lead]
  );

  const detailEntries = useMemo(() => {
    if (!selectedMember) return [];

    const preferredOrder = [
      'name',
      'mobile',
      'email',
      'company_name',
      'address_home',
      'address_office',
      'resident_landline',
      'office_landline',
      'membership_number',
      'role',
      'joined_date',
      'serial_no',
      'is_active',
      'member_type',
      'member_id',
      'trust_id',
    ];

    const entries = Object.entries(selectedMember)
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
      .map(([key, value]) => ({ key, label: key.replace(/_/g, ' '), value }));

    return [
      ...preferredOrder
        .map((key) => entries.find((item) => item.key === key))
        .filter(Boolean),
      ...entries.filter((item) => !preferredOrder.includes(item.key)),
    ];
  }, [selectedMember]);

  const visibleMemberEntries = useMemo(() => {
    const excludedKeys = new Set([
      'name',
      'mobile',
      'trust_id',
      'member_id',
      'members_id',
      'clean_mobile',
      'cleanMobile',
    ]);

    return detailEntries.filter((item) => !excludedKeys.has(item.key));
  }, [detailEntries]);

  const trustDetailEntries = useMemo(() => {
    if (!selectedTrustMember) return [];

    const preferredOrder = [
      'trust_name',
      'name',
      'mobile',
      'email',
      'company_name',
      'address_home',
      'address_office',
      'resident_landline',
      'office_landline',
      'membership_number',
      'role',
      'joined_date',
      'serial_no',
      'is_active',
      'member_type',
      'member_id',
      'trust_id',
    ];

    const entries = Object.entries(selectedTrustMember)
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
      .map(([key, value]) => ({ key, label: key.replace(/_/g, ' '), value }));

    return [
      ...preferredOrder.map((key) => entries.find((item) => item.key === key)).filter(Boolean),
      ...entries.filter((item) => !preferredOrder.includes(item.key)),
    ];
  }, [selectedTrustMember]);

  const visibleTrustEntries = useMemo(() => {
    const excludedKeys = new Set([
      'trust_name',
      'name',
      'mobile',
      'trust_count',
      'trust_id',
      'member_id',
      'members_id',
      'clean_mobile',
      'cleanMobile',
      'trusts',
    ]);

    return trustDetailEntries.filter((item) => !excludedKeys.has(item.key));
  }, [trustDetailEntries]);

  const trustBreakdown = useMemo(() => {
    if (!selectedTrustMember || !Array.isArray(selectedTrustMember.trusts)) return [];

    return selectedTrustMember.trusts
      .filter(Boolean)
      .map((item, index) => ({
        key: `${item?.trust_id || item?.trust_name || index}`,
        trustName: item?.trust_name || item?.name || 'Trust',
        entries: [
          { key: 'role', label: 'Role', value: item?.role },
          { key: 'membership_number', label: 'Membership Number', value: item?.membership_number },
          { key: 'joined_date', label: 'Joined Date', value: item?.joined_date },
          { key: 'is_active', label: 'Active', value: item?.is_active },
        ].filter((field) => field.value !== null && field.value !== undefined && String(field.value).trim() !== ''),
      }));
  }, [selectedTrustMember]);

  const trustCount = selectedTrustMember?.trust_count || trustBreakdown.length || 0;
  const trustOwnerCount = trustOwnerDetails.length || 0;

  const trustOwnerCards = useMemo(() => {
    return trustOwnerDetails.map((item, index) => {
      const entries = Object.entries(item || {})
        .filter(([key]) => ['trust_name', 'created_at', 'expected_members'].includes(key))
        .map(([key, value]) => ({ key, label: key.replace(/_/g, ' '), value }));

      return {
        key: `${item?.trust_id || item?.trust_name || index}`,
        title: item?.trust_name || item?.name || 'Trust',
        entries,
      };
    });
  }, [trustOwnerDetails]);

  const groupedChats = useMemo(() => {
    const groupMap = new Map();

    chatHistory.forEach((item, index) => {
      const timestamp = parseChatTimestamp(item?.date_time);
      const dateLabel = formatChatDateLabel(item?.date_time);
      const dateKey = timestamp !== null ? new Date(timestamp).toISOString().slice(0, 10) : dateLabel;

      if (!groupMap.has(dateKey)) {
        groupMap.set(dateKey, {
          key: `${dateKey}-${index}`,
          dateLabel,
          sortTs: timestamp ?? 0,
          items: [],
        });
      }

      const group = groupMap.get(dateKey);
      if (timestamp !== null) {
        group.sortTs = group.sortTs ? Math.min(group.sortTs, timestamp) : timestamp;
      }

      group.items.push({
        ...item,
        key: `${item?.date_time || index}-${item?.action || 'chat'}-${index}`,
        sortTs: timestamp ?? 0,
        timeLabel: formatChatTimeLabel(item?.date_time),
      });
    });

    return Array.from(groupMap.values())
      .sort((left, right) => (chatSortOrder === 'asc' ? left.sortTs - right.sortTs : right.sortTs - left.sortTs))
      .map((group) => ({
        ...group,
        items: [...group.items].sort((left, right) => {
          const leftTime = left.sortTs ?? 0;
          const rightTime = right.sortTs ?? 0;
          return chatSortOrder === 'asc' ? leftTime - rightTime : rightTime - leftTime;
        }),
      }));
  }, [chatHistory, chatSortOrder]);

  useLayoutEffect(() => {
    const scrollEl = chatScrollRef.current;
    if (!scrollEl || groupedChats.length === 0) return;

    requestAnimationFrame(() => {
      scrollEl.scrollTop = 0;
    });
  }, [chatSortOrder, groupedChats.length]);

  const closePage = () => {
    navigate('/sales-marketing/leads', {
      state: { userName, trust, superuserId, sidebarNavKey: 'sales-marketing' },
    });
  };

  return (
    <div className="lms-page-root">
      <Sidebar
        trustName={trustName}
        onDashboard={() =>
          navigate('/dashboard', {
            state: { userName, trust, superuserId, sidebarNavKey: 'dashboard' },
          })
        }
        onLogout={() => navigate('/login')}
      />

      <main className="lms-page-main">
        <div className="lms-detail-page-topbar">
          <div className="lms-detail-page-title">
            <h1>Member Details</h1>
            <p>{selectedMember?.name || leadName || 'Lead information'}</p>
          </div>
          <button type="button" className="lms-detail-close" onClick={closePage} aria-label="Close lead details">
            X
          </button>
        </div>

        <section className="lms-page-content lms-detail-page-content">
          {loading || trustLoading || chatLoading ? (
            <div className="lms-page-card lms-detail-page-card">
              <div className="lms-state">Checking member match...</div>
            </div>
          ) : (
            <div className="lms-page-card lms-detail-page-card">
              <div className="lms-detail-shell">
                <div className="lms-detail-hero">
                  <div className="lms-detail-hero-copy">
                    <span className="lms-detail-kicker">Selected Lead</span>
                    <h2>{leadName || selectedMember?.name || 'Unknown Lead'}</h2>
                    <p>{leadMobile || selectedMember?.mobile || '-'}</p>
                  </div>
                  <div className="lms-detail-hero-chip">{trustName}</div>
                </div>

                <div className="lms-detail-section-title">Lead Info</div>
                <div className="lms-detail-grid lms-detail-grid-page lms-detail-grid-lead lms-scroll-panel lms-scroll-panel-compact">
                  {leadEntries.map((item) => (
                    <div className={`lms-detail-item lms-lead-item lms-lead-item-${item.key}`} key={item.key}>
                      <span>{item.label}</span>
                      <strong>{formatCellValue(item.value)}</strong>
                    </div>
                  ))}
                </div>

                {selectedMember && (
                  <div className="lms-detail-member-block">
                    <div className="lms-detail-member-head">
                      <div>
                        <h3>Member Details</h3>
                      </div>
                    </div>

                    <div className="lms-detail-grid lms-detail-grid-page lms-scroll-panel lms-scroll-panel-member">
                      {visibleMemberEntries.map((item) => (
                        <div className="lms-detail-item" key={item.key}>
                          <span>{item.label}</span>
                          <strong>{formatCellValue(item.value)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!selectedMember && !memberError && (
                  <div className="lms-member-empty">
                    No member details found for this mobile number.
                  </div>
                )}

                {memberError && <div className="lms-state lms-state-error lms-state-inline">{memberError}</div>}

                <div className="lms-detail-member-block">
                  <div className="lms-detail-member-head">
                    <div>
                      <h3>Trust Member Details</h3>
                    </div>
                  </div>

                  {selectedTrustMember ? (
                    <div className="lms-detail-grid lms-detail-grid-page lms-scroll-panel lms-scroll-panel-compact">
                      {visibleTrustEntries.map((item) => (
                        <div className="lms-detail-item" key={`trust-${item.key}`}>
                          <span>{item.label}</span>
                          <strong>{formatCellValue(item.value)}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="lms-member-empty">
                      No trust member details found for this mobile number.
                    </div>
                  )}

                  {trustBreakdown.length > 0 && (
                    <div className="lms-trust-summary-card">
                      <div>
                        <span>Total Trusts Registered</span>
                        <strong>{trustCount}</strong>
                      </div>
                      <div className="lms-trust-summary-icon" aria-hidden="true">
                        &#8962;
                      </div>
                    </div>
                  )}

                  {trustBreakdown.length > 0 && (
                    <div className="lms-trust-accordion lms-scroll-panel lms-scroll-panel-trusts">
                      {trustBreakdown.map((trustItem) => (
                        <article className="lms-trust-accordion-card is-static" key={trustItem.key}>
                          <div className="lms-trust-accordion-toggle">
                            <strong>{trustItem.trustName}</strong>
                          </div>

                          <div className="lms-trust-inline-grid">
                            {trustItem.entries.map((entry) => (
                              <div className="lms-trust-inline-item" key={entry.key}>
                                <span>{entry.label}</span>
                                <strong>{formatCellValue(entry.value)}</strong>
                              </div>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}

                {trustError && <div className="lms-state lms-state-error lms-state-inline">{trustError}</div>}
              </div>

                <div className="lms-detail-member-block">
                  <div className="lms-detail-member-head">
                    <div>
                      <h3>Trust Owner Details</h3>
                    </div>
                  </div>

                  {trustOwnerLoading ? (
                    <div className="lms-member-empty">Loading trust owner details...</div>
                  ) : trustOwnerCards.length > 0 ? (
                    <>
                      <div className="lms-trust-summary-card lms-trust-owner-summary-card">
                        <div>
                          <span>Trusts Found</span>
                          <strong>{trustOwnerCount}</strong>
                        </div>
                        <div className="lms-trust-summary-icon" aria-hidden="true">
                          &#9733;
                        </div>
                      </div>

                      <div className="lms-trust-owner-list lms-scroll-panel lms-scroll-panel-trusts">
                        {trustOwnerCards.map((trustOwner) => (
                          <article className="lms-trust-owner-card" key={trustOwner.key}>
                            <div className="lms-trust-owner-head">
                              <strong>{trustOwner.title}</strong>
                            </div>
                            <div className="lms-trust-owner-grid">
                              {trustOwner.entries.map((entry) => (
                                <div className="lms-trust-owner-item" key={`${trustOwner.key}-${entry.key}`}>
                                  <span>{entry.label}</span>
                                  <strong>{formatCellValue(entry.value)}</strong>
                                </div>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="lms-member-empty">No trust owner details found for this mobile number.</div>
                  )}

                  {trustOwnerError && <div className="lms-state lms-state-error lms-state-inline">{trustOwnerError}</div>}
                </div>

                <div className="lms-detail-member-block">
                  <div className="lms-detail-member-head">
                    <div className="lms-chat-head-row">
                      <h3>All Chats</h3>
                      <div className="lms-chat-head-actions">
                        <button type="button" className="lms-chat-action-btn" onClick={openActionModal}>
                          + Add action
                        </button>
                        <label className="lms-chat-filter">
                          <span>Sort</span>
                          <select value={chatSortOrder} onChange={(event) => setChatSortOrder(event.target.value)}>
                            <option value="desc">Newest first</option>
                            <option value="asc">Oldest first</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>

                  {chatHistory.length > 0 ? (
                    <div className="lms-chat-panel lms-scroll-panel lms-scroll-panel-chat" ref={chatScrollRef}>
                      <div className="lms-chat-summary-row">
                        <span>All Chats</span>
                        <strong>{chatHistory.length}</strong>
                      </div>
                      <div className="lms-chat-list">
                        {groupedChats.map((group) => (
                          <section className="lms-chat-day-group" key={group.key}>
                            <div className="lms-chat-day-pill">{group.dateLabel}</div>
                            <div className="lms-chat-day-list">
                              {group.items.map((item) => (
                                <div className="lms-chat-card-row is-left" key={item.key}>
                                  <article className="lms-chat-card">
                                    <div className="lms-chat-card-head">
                                      <strong>{formatCellValue(item?.action)}</strong>
                                      <span className="lms-chat-card-time">{item.timeLabel}</span>
                                    </div>
                                    <div className="lms-chat-card-tags">
                                      <span className="lms-chat-tag lms-chat-tag-trigger">{formatCellValue(item?.trigger)}</span>
                                      <span className="lms-chat-tag lms-chat-tag-flow">{formatCellValue(item?.flow)}</span>
                                    </div>
                                  </article>
                                </div>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="lms-member-empty">
                      No chat history found for this mobile number.
                    </div>
                  )}

                  {chatError && <div className="lms-state lms-state-error lms-state-inline">{chatError}</div>}
                </div>
              </div>
            </div>
          )}
        </section>

        {isActionModalOpen && (
          <div className="lms-action-modal-backdrop" role="presentation" onClick={closeActionModal}>
            <div className="lms-action-modal" role="dialog" aria-modal="true" aria-labelledby="add-action-title" onClick={(event) => event.stopPropagation()}>
              <div className="lms-action-modal-header">
                <div>
                  <h3 id="add-action-title">Add Action</h3>
                  <p>Creates a marketing action for this mobile number.</p>
                </div>
                <button type="button" className="lms-action-modal-close" onClick={closeActionModal} aria-label="Close action modal">
                  ×
                </button>
              </div>

              <form className="lms-action-modal-form" onSubmit={handleAddAction}>
                <div className="lms-action-modal-note">
                  Mobile: <strong>{leadMobile || '-'}</strong>
                </div>

                <div className="lms-action-modal-grid">
                  <label className="lms-action-field">
                    <span>Name</span>
                    <input type="text" value={actionForm.name} readOnly aria-readonly="true" />
                  </label>

                  <label className="lms-action-field">
                    <span>Marks</span>
                    <input
                      type="text"
                      value={actionForm.marks}
                      onChange={handleActionFieldChange('marks')}
                      placeholder="Enter marks"
                      autoComplete="off"
                    />
                  </label>

                  <label className="lms-action-field">
                    <span>Trigger</span>
                    <input
                      type="text"
                      value={actionForm.trigger}
                      onChange={handleActionFieldChange('trigger')}
                      placeholder="Enter trigger"
                      autoComplete="off"
                    />
                  </label>

                  <label className="lms-action-field">
                    <span>Action</span>
                    <input
                      type="text"
                      value={actionForm.action}
                      onChange={handleActionFieldChange('action')}
                      placeholder="Enter action"
                      autoComplete="off"
                    />
                  </label>

                  <label className="lms-action-field lms-action-field-full">
                    <span>Flow</span>
                    <input
                      type="text"
                      value={actionForm.flow}
                      onChange={handleActionFieldChange('flow')}
                      placeholder="Enter flow"
                      autoComplete="off"
                    />
                  </label>

                </div>

                {actionError && <div className="lms-action-error">{actionError}</div>}

                <div className="lms-action-modal-actions">
                  <button type="button" className="lms-action-btn lms-action-btn-secondary" onClick={closeActionModal} disabled={actionSaving}>
                    Cancel
                  </button>
                  <button type="submit" className="lms-action-btn lms-action-btn-primary" disabled={actionSaving}>
                    {actionSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
