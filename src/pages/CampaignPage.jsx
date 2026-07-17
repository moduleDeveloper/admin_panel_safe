import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Sidebar from '../components/Sidebar';
import { fetchCampaigns, fetchSchedules, setupCampaign } from '../services/campaignService';
import { fetchRegisteredMembersDirectory } from '../services/membersService';
import './CampaignPage.css';

const CAMPAIGN_MODES = {
  existing: 'existing',
  create: 'create',
};

const initialCampaignForm = {
  name: '',
  org_type: '',
  cause: '',
  template_name: '',
  status: 'draft',
  scheduled_at: '',
  batch_size: '100',
};

const audienceOptions = [
  {
    id: 'all_members',
    title: 'All Members',
    description: 'Send to everyone in the selected trust.',
  },
  {
    id: 'campaign_leads',
    title: 'Campaign Leads',
    description: 'Use the leads already linked to this campaign.',
  },
  {
    id: 'filtered_audience',
    title: 'Filtered Audience',
    description: 'Choose a targeted audience from the audience API.',
  },
];

const AUDIENCE_PAGE_SIZE = 6;

function formatDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CampaignPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null, superuserId = null } = location.state || {};
  const trustName = trust?.name || 'Trust';
  const trustId = trust?.id || '';

  const [mode, setMode] = useState(CAMPAIGN_MODES.existing);
  const [activeStep, setActiveStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [campaignSearch, setCampaignSearch] = useState('');
  const [scheduleSearch, setScheduleSearch] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [selectedAudienceId, setSelectedAudienceId] = useState('');
  const [selectedAudienceMemberIds, setSelectedAudienceMemberIds] = useState([]);
  const [audienceMembers, setAudienceMembers] = useState([]);
  const [audienceMembersLoading, setAudienceMembersLoading] = useState(false);
  const [audienceMembersError, setAudienceMembersError] = useState('');
  const [audienceSearch, setAudienceSearch] = useState('');
  const [audiencePage, setAudiencePage] = useState(1);
  const [campaignForm, setCampaignForm] = useState(initialCampaignForm);
  const campaignNameRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const loadCampaignData = async () => {
      if (!trustId) {
        if (isMounted) {
          setError('Trust information is missing.');
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError('');

      const [campaignResponse, scheduleResponse] = await Promise.all([
        fetchCampaigns({ trustId }),
        fetchSchedules(),
      ]);

      if (!isMounted) return;

      if (campaignResponse.error) {
        setError(campaignResponse.error.message || 'Failed to load campaigns.');
      }

      if (scheduleResponse.error) {
        setError((current) => current || scheduleResponse.error.message || 'Failed to load schedules.');
      }

      setCampaigns(Array.isArray(campaignResponse.data) ? campaignResponse.data : []);
      setSchedules(Array.isArray(scheduleResponse.data) ? scheduleResponse.data : []);
      setLoading(false);
    };

    loadCampaignData();

    return () => {
      isMounted = false;
    };
  }, [trustId]);

  useEffect(() => {
    if (activeStep === 2 && mode === CAMPAIGN_MODES.create) {
      window.requestAnimationFrame(() => {
        campaignNameRef.current?.focus?.();
      });
    }
  }, [activeStep, mode]);

  const filteredCampaigns = useMemo(() => {
    const query = campaignSearch.trim().toLowerCase();
    if (!query) return campaigns;
    return campaigns.filter((item) => {
      const haystack = [item?.name, item?.org_type, item?.cause, item?.template_name, item?.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [campaignSearch, campaigns]);

  const filteredSchedules = useMemo(() => {
    const query = scheduleSearch.trim().toLowerCase();
    return schedules.filter((item) => {
      if (!query) return true;
      const haystack = [item?.status, item?.batch_size, item?.scheduled_at, item?.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [scheduleSearch, schedules]);

  const campaignOrgTypeSuggestions = useMemo(() => {
    return [...new Set(campaigns.map((item) => String(item?.org_type || '').trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );
  }, [campaigns]);

  const campaignCauseSuggestions = useMemo(() => {
    return [...new Set(campaigns.map((item) => String(item?.cause || '').trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );
  }, [campaigns]);

  const selectedCampaign = campaigns.find((item) => String(item?.id || '') === selectedCampaignId) || null;
  const selectedSchedule = schedules.find((item) => String(item?.id || '') === selectedScheduleId) || null;

  useEffect(() => {
    if (!selectedCampaignId) return;
    const campaignExists = campaigns.some((item) => String(item?.id || '') === selectedCampaignId);
    if (!campaignExists) {
      setSelectedCampaignId('');
      setSelectedScheduleId('');
      return;
    }

    if (selectedScheduleId) {
      const scheduleExists = schedules.some((item) => String(item?.id || '') === selectedScheduleId);
      if (!scheduleExists) {
        setSelectedScheduleId('');
      }
    }
  }, [campaigns, schedules, selectedCampaignId, selectedScheduleId]);

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    setError('');
    setSuccess('');
    setActiveStep(2);
    setSelectedAudienceId('');
    setSelectedAudienceMemberIds([]);
    setAudienceMembers([]);
    setAudienceMembersError('');
    setAudienceSearch('');
    setAudiencePage(1);
    if (nextMode === CAMPAIGN_MODES.create) {
      setSelectedCampaignId('');
      setSelectedScheduleId('');
    }
  };

  const validateCampaignStep = () => {
    if (mode === CAMPAIGN_MODES.existing) {
      if (!selectedCampaignId) {
        setError('Please select a campaign.');
        return false;
      }
      return true;
    }

    if (!String(campaignForm.name || '').trim()) {
      setError('Campaign name is required.');
      return false;
    }
    if (!String(campaignForm.org_type || '').trim()) {
      setError('Org type is required.');
      return false;
    }
    if (!String(campaignForm.template_name || '').trim()) {
      setError('Template name is required.');
      return false;
    }
    return true;
  };

  const validateScheduleStep = () => {
    if (mode === CAMPAIGN_MODES.existing) {
      if (!selectedScheduleId) {
        setError('Please select a schedule.');
        return false;
      }
      return true;
    }

    if (!String(campaignForm.scheduled_at || '').trim()) {
      setError('Scheduled date and time is required.');
      return false;
    }
    return true;
  };

  const handleNextStep = () => {
    setError('');
    setSuccess('');

    if (activeStep === 1) {
      setActiveStep(2);
      return;
    }

    if (activeStep === 2) {
      if (!validateCampaignStep()) return;
      setActiveStep(3);
      return;
    }

    if (activeStep === 3) {
      if (!validateScheduleStep()) return;
      setActiveStep(4);
    }
  };

  const handleBackStep = () => {
    setError('');
    setSuccess('');
    setActiveStep((current) => Math.max(1, current - 1));
  };

  const handleCampaignFormChange = (field) => (event) => {
    const { value } = event.target;
    setCampaignForm((current) => ({ ...current, [field]: value }));
  };

  const handleCampaignSelect = (campaignId) => {
    setSelectedCampaignId(campaignId);
    setSelectedScheduleId('');
    setSelectedAudienceId('');
    setSelectedAudienceMemberIds([]);
    setAudienceMembers([]);
    setAudienceMembersError('');
    setAudienceSearch('');
    setAudiencePage(1);
    setSuccess('');
    setError('');
    setActiveStep(3);
  };

  const handleScheduleSelect = (scheduleId) => {
    setSelectedScheduleId(scheduleId);
    setSelectedAudienceId('');
    setSelectedAudienceMemberIds([]);
    setAudienceMembers([]);
    setAudienceMembersError('');
    setAudienceSearch('');
    setAudiencePage(1);
    setSuccess('');
    setError('');
  };

  const handleAudienceSelect = (audienceId) => {
    setSelectedAudienceId(audienceId);
    setSelectedAudienceMemberIds([]);
    setAudienceMembersError('');
    setAudienceSearch('');
    setAudiencePage(1);
    setSuccess('');
    setError('');
  };

  const handleAudienceMemberToggle = (memberId) => {
    const cleanMemberId = String(memberId || '');
    if (!cleanMemberId) return;

    setSelectedAudienceMemberIds((current) =>
      current.includes(cleanMemberId)
        ? current.filter((item) => item !== cleanMemberId)
        : [...current, cleanMemberId]
    );
  };

  useEffect(() => {
    let isMounted = true;

    const loadAudienceMembers = async () => {
      if (activeStep !== 4 || selectedAudienceId !== 'filtered_audience' || !trustId) return;

      setAudienceMembersLoading(true);
      setAudienceMembersError('');

      const { data, error: fetchError } = await fetchRegisteredMembersDirectory(trustId);
      if (!isMounted) return;

      if (fetchError) {
        setAudienceMembers([]);
        setAudienceMembersError(fetchError.message || 'Failed to load audience members.');
      } else {
        setAudienceMembers(Array.isArray(data) ? data : []);
      }

      setAudienceMembersLoading(false);
    };

    loadAudienceMembers();

    return () => {
      isMounted = false;
    };
  }, [activeStep, selectedAudienceId, trustId]);

  const filteredAudienceMembers = useMemo(() => {
    const query = audienceSearch.trim().toLowerCase();
    if (!query) return audienceMembers;

    return audienceMembers.filter((member) => {
      const haystack = [
        member?.name,
        member?.company_name,
        member?.mobile,
        member?.membership_number,
        member?.email,
        member?.address_home,
        member?.address_office,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [audienceMembers, audienceSearch]);

  const audienceTotalPages = Math.max(1, Math.ceil(filteredAudienceMembers.length / AUDIENCE_PAGE_SIZE));
  const safeAudiencePage = Math.min(audiencePage, audienceTotalPages);

  useEffect(() => {
    setAudiencePage((current) => Math.min(current, audienceTotalPages));
  }, [audienceTotalPages]);

  const paginatedAudienceMembers = useMemo(() => {
    const start = (safeAudiencePage - 1) * AUDIENCE_PAGE_SIZE;
    return filteredAudienceMembers.slice(start, start + AUDIENCE_PAGE_SIZE);
  }, [filteredAudienceMembers, safeAudiencePage]);

  const selectedAudienceMemberCount = selectedAudienceMemberIds.length;

  const handleProceed = async () => {
    if (!trustId) {
      setError('Trust information is missing.');
      return;
    }

    if (!validateCampaignStep() || !validateScheduleStep()) {
      return;
    }

    if (!selectedAudienceId) {
      setError('Please choose an audience.');
      return;
    }

    if (selectedAudienceId === 'filtered_audience' && !selectedAudienceMemberIds.length) {
      setError('Please select at least one audience member.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    const payload =
      mode === CAMPAIGN_MODES.create
        ? {
            trust_id: trustId,
            name: campaignForm.name,
            org_type: campaignForm.org_type,
            cause: campaignForm.cause,
            template_name: campaignForm.template_name,
            status: campaignForm.status,
            scheduled_at: campaignForm.scheduled_at,
            batch_size: campaignForm.batch_size,
            audience_type: selectedAudienceId,
            audience_member_ids:
              selectedAudienceId === 'filtered_audience' ? selectedAudienceMemberIds : [],
          }
        : {
            trust_id: trustId,
            campaign_id: selectedCampaignId,
            schedule_id: selectedScheduleId || null,
            audience_type: selectedAudienceId,
            audience_member_ids:
              selectedAudienceId === 'filtered_audience' ? selectedAudienceMemberIds : [],
          };

    const { data, error: setupError } = await setupCampaign(payload);

    if (setupError) {
      setError(setupError.message || 'Failed to setup campaign.');
      setSaving(false);
      return;
    }

    const campaignId = data?.campaign_id || selectedCampaignId || '';
    const scheduleId = data?.schedule_id || selectedScheduleId || '';
    const successMessage =
      mode === CAMPAIGN_MODES.create
        ? 'Campaign and schedule created successfully.'
        : 'Campaign setup saved successfully.';
    setSuccess(successMessage);
    setSaving(false);

    if (campaignId || scheduleId) {
      const [campaignResponse, scheduleResponse] = await Promise.all([
        fetchCampaigns({ trustId }),
        fetchSchedules(),
      ]);

      if (!campaignResponse.error) {
        setCampaigns(Array.isArray(campaignResponse.data) ? campaignResponse.data : []);
      }
      if (!scheduleResponse.error) {
        setSchedules(Array.isArray(scheduleResponse.data) ? scheduleResponse.data : []);
      }

      setSelectedCampaignId(campaignId);
      setSelectedScheduleId(scheduleId);
    }

  };

  return (
    <div className="campaign-page-root">
      <Sidebar
        trustName={trustName}
        onDashboard={() =>
          navigate('/dashboard', {
            state: { userName, trust, superuserId, sidebarNavKey: 'dashboard' },
          })
        }
        onLogout={() => navigate('/login')}
      />

      <main className="campaign-page-main">
        <PageHeader
          title="Setup Campaign"
          subtitle="Select an existing campaign & schedule, or create a new campaign first and then schedule it."
          onBack={() =>
            navigate('/sales-marketing', {
              state: { userName, trust, superuserId, sidebarNavKey: 'sales-marketing' },
            })
          }
        />

        <section className="campaign-page-content">
          <div className="campaign-shell">
            <div className="campaign-stepper" aria-label="Campaign setup steps">
              <div className={`campaign-step ${activeStep > 1 ? 'is-complete' : ''} ${activeStep === 1 ? 'is-active' : ''}`}>
                <span>{activeStep > 1 ? '✓' : '1'}</span>
                <strong>🧭 Choose flow</strong>
              </div>
              <div className={`campaign-step ${activeStep > 2 ? 'is-complete' : ''} ${activeStep === 2 ? 'is-active' : ''}`}>
                <span>{activeStep > 2 ? '✓' : '2'}</span>
                <strong>📣 Campaign</strong>
              </div>
              <div className={`campaign-step ${activeStep > 3 ? 'is-complete' : ''} ${activeStep === 3 ? 'is-active' : ''}`}>
                <span>{activeStep > 3 ? '✓' : '3'}</span>
                <strong>⏰ Schedule</strong>
              </div>
              <div className={`campaign-step ${activeStep >= 4 ? 'is-active' : ''}`}>
                <span>4</span>
                <strong>👥 Choose audience</strong>
              </div>
            </div>

            {error && <div className="campaign-alert campaign-alert-error">{error}</div>}
            {success && <div className="campaign-alert campaign-alert-success">{success}</div>}

            {activeStep === 1 && (
              <div className="campaign-choice-step">
                <p className="campaign-step-helper">What do you want to do?</p>
                <div className="campaign-choice-grid">
                  <button
                    type="button"
                    className={`campaign-choice-card ${mode === CAMPAIGN_MODES.create ? 'is-active' : ''}`}
                    onClick={() => handleModeChange(CAMPAIGN_MODES.create)}
                  >
                    <span className="campaign-choice-icon">+</span>
                    <div>
                      <strong>Create a new campaign</strong>
                      <span>Start from scratch</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`campaign-choice-card ${mode === CAMPAIGN_MODES.existing ? 'is-active' : ''}`}
                    onClick={() => handleModeChange(CAMPAIGN_MODES.existing)}
                  >
                    <span className="campaign-choice-icon campaign-choice-icon-alt">↺</span>
                    <div>
                      <strong>Use an existing campaign</strong>
                      <span>Add a new schedule to it</span>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {activeStep === 2 && mode === CAMPAIGN_MODES.create && (
              <article className="campaign-panel">
                <div className="campaign-panel-head">
                  <div>
                    <span className="campaign-panel-kicker">1</span>
                    <h3>Create Campaign</h3>
                  </div>
                  <span className="campaign-panel-sub">Fill campaign details first</span>
                </div>

                <div className="campaign-form-grid">
                  <label className="campaign-field campaign-field-span-2">
                    <span>Name</span>
                    <input
                      ref={campaignNameRef}
                      type="text"
                      value={campaignForm.name}
                      onChange={handleCampaignFormChange('name')}
                      placeholder="Campaign name"
                    />
                  </label>
                  <label className="campaign-field">
                    <span>Org Type</span>
                    <select value={campaignForm.org_type} onChange={handleCampaignFormChange('org_type')}>
                      <option value="">Select organization type</option>
                      {campaignOrgTypeSuggestions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="campaign-field">
                    <span>Status</span>
                    <select value={campaignForm.status} onChange={handleCampaignFormChange('status')}>
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                    </select>
                  </label>
                  <label className="campaign-field campaign-field-span-2">
                    <span>Cause</span>
                    <select value={campaignForm.cause} onChange={handleCampaignFormChange('cause')}>
                      <option value="">Select cause</option>
                      {campaignCauseSuggestions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="campaign-field campaign-field-span-3">
                    <span>Template Name</span>
                    <input
                      type="text"
                      value={campaignForm.template_name}
                      onChange={handleCampaignFormChange('template_name')}
                      placeholder="Template name"
                    />
                  </label>
                </div>

              </article>
            )}

            {activeStep === 2 && mode === CAMPAIGN_MODES.existing && (
              <article className="campaign-panel">
                <div className="campaign-panel-head">
                  <div>
                    <span className="campaign-panel-kicker">1</span>
                    <h3>Select Existing Campaign</h3>
                  </div>
                  <button type="button" className="campaign-inline-btn" onClick={() => handleModeChange(CAMPAIGN_MODES.create)}>
                    + New Campaign
                  </button>
                </div>

                <label className="campaign-search">
                  <input
                    type="search"
                    value={campaignSearch}
                    onChange={(event) => setCampaignSearch(event.target.value)}
                    placeholder="Search campaigns..."
                  />
                </label>

                <div className="campaign-list">
                  {loading ? (
                    <div className="campaign-empty">Loading campaigns...</div>
                  ) : filteredCampaigns.length > 0 ? (
                    filteredCampaigns.map((item) => {
                      const isSelected = selectedCampaignId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`campaign-list-item ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => handleCampaignSelect(item.id)}
                        >
                          <div className="campaign-list-item-top">
                            <strong>{item.name || 'Untitled campaign'}</strong>
                            <span className={`campaign-status-pill campaign-status-pill-${String(item.status || 'draft').toLowerCase()}`}>
                              {item.status || 'draft'}
                            </span>
                          </div>
                          <div className="campaign-list-item-meta">
                            <span>{item.org_type || '-'}</span>
                            <span>{item.template_name || '-'}</span>
                            <span>{item.cause || '-'}</span>
                          </div>
                          <div className="campaign-list-item-foot">ID: {item.id}</div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="campaign-empty">No campaigns found.</div>
                  )}
                </div>
              </article>
            )}

            {activeStep === 3 && mode === CAMPAIGN_MODES.create && (
              <article className="campaign-panel">
                <div className="campaign-panel-head">
                  <div>
                    <span className="campaign-panel-kicker campaign-panel-kicker-alt">2</span>
                    <h3>Create Schedule</h3>
                  </div>
                  <span className="campaign-panel-sub">Add date, time and batch size</span>
                </div>

                <div className="campaign-form-grid">
                  <label className="campaign-field campaign-field-full">
                    <span>Scheduled At</span>
                    <input type="datetime-local" value={campaignForm.scheduled_at} onChange={handleCampaignFormChange('scheduled_at')} />
                  </label>
                  <label className="campaign-field campaign-field-full">
                    <span>Batch Size</span>
                    <input type="number" min="1" value={campaignForm.batch_size} onChange={handleCampaignFormChange('batch_size')} />
                  </label>
                </div>
              </article>
            )}

            {activeStep === 3 && mode === CAMPAIGN_MODES.existing && (
              <article className="campaign-panel">
                <div className="campaign-panel-head">
                  <div>
                    <span className="campaign-panel-kicker campaign-panel-kicker-alt">2</span>
                    <h3>Select Existing Schedule</h3>
                  </div>
                  <button type="button" className="campaign-inline-btn campaign-inline-btn-green" onClick={() => handleModeChange(CAMPAIGN_MODES.create)}>
                    + New Schedule
                  </button>
                </div>

                <label className="campaign-search">
                  <input
                    type="search"
                    value={scheduleSearch}
                    onChange={(event) => setScheduleSearch(event.target.value)}
                    placeholder="Search schedules..."
                  />
                </label>

                <div className="campaign-list campaign-list-schedule">
                  {loading ? (
                    <div className="campaign-empty">Loading schedules...</div>
                  ) : filteredSchedules.length > 0 ? (
                    filteredSchedules.map((item) => {
                      const isSelected = selectedScheduleId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`campaign-list-item campaign-list-item-schedule ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => handleScheduleSelect(item.id)}
                        >
                          <div className="campaign-list-item-top">
                            <strong>{formatDateTime(item.scheduled_at)}</strong>
                            <span className={`campaign-status-pill campaign-status-pill-${String(item.status || 'pending').toLowerCase()}`}>
                              {item.status || 'pending'}
                            </span>
                          </div>
                          <div className="campaign-list-item-meta">
                            <span>Batch {item.batch_size || '-'}</span>
                            <span>Campaign {item.campaign_id || '-'}</span>
                          </div>
                          <div className="campaign-list-item-foot">ID: {item.id}</div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="campaign-empty">No schedules found.</div>
                  )}
                </div>
              </article>
            )}

            {activeStep === 4 && (
              <article className="campaign-panel">
                <div className="campaign-panel-head">
                  <div>
                    <span className="campaign-panel-kicker campaign-panel-kicker-alt">4</span>
                    <h3>Choose Audience</h3>
                  </div>
                  <span className="campaign-panel-sub">
                    {selectedAudienceId ? 'Audience selected' : 'Pick one audience to continue'}
                  </span>
                </div>

                <div className="campaign-audience-grid">
                  {audienceOptions.map((audience) => {
                    const isSelected = selectedAudienceId === audience.id;
                    return (
                      <button
                        key={audience.id}
                        type="button"
                        className={`campaign-audience-card ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => handleAudienceSelect(audience.id)}
                      >
                        <span className="campaign-audience-icon">{isSelected ? '✓' : '◌'}</span>
                        <div>
                          <strong>{audience.title}</strong>
                          <span>{audience.description}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedAudienceId === 'filtered_audience' && (
                  <div className="campaign-audience-members">
                    <div className="campaign-audience-members-head">
                      <div>
                        <strong>Select Members</strong>
                        <span>Pick members for the audience. Search and page through the list.</span>
                      </div>
                      <span className="campaign-panel-sub">
                        {selectedAudienceMemberCount} selected
                      </span>
                    </div>

                    <label className="campaign-search">
                      <input
                        type="search"
                        value={audienceSearch}
                        onChange={(event) => {
                          setAudienceSearch(event.target.value);
                          setAudiencePage(1);
                        }}
                        placeholder="Search members..."
                      />
                    </label>

                    {audienceMembersLoading ? (
                      <div className="campaign-empty">Loading members...</div>
                    ) : audienceMembersError ? (
                      <div className="campaign-alert campaign-alert-error">{audienceMembersError}</div>
                    ) : paginatedAudienceMembers.length > 0 ? (
                      <>
                        <div className="campaign-member-list">
                          {paginatedAudienceMembers.map((member) => {
                            const memberId = String(member?.member_id || '');
                            const isSelected = selectedAudienceMemberIds.includes(memberId);
                            return (
                              <button
                                key={memberId}
                                type="button"
                                className={`campaign-member-card ${isSelected ? 'is-selected' : ''}`}
                                onClick={() => handleAudienceMemberToggle(memberId)}
                              >
                                <span className="campaign-member-checkbox">{isSelected ? '✓' : ''}</span>
                                <div className="campaign-member-copy">
                                  <strong>{member?.name || member?.company_name || 'Member'}</strong>
                                  <span>{member?.membership_number || member?.mobile || '-'}</span>
                                  <span>{member?.company_name || member?.address_home || member?.address_office || '-'}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <div className="campaign-pagination">
                          <button
                            type="button"
                            className="campaign-pagination-btn"
                            disabled={safeAudiencePage <= 1}
                            onClick={() => setAudiencePage((current) => Math.max(1, current - 1))}
                          >
                            Prev
                          </button>
                          <div className="campaign-pagination-info">
                            Page {safeAudiencePage} of {audienceTotalPages}
                          </div>
                          <button
                            type="button"
                            className="campaign-pagination-btn"
                            disabled={safeAudiencePage >= audienceTotalPages}
                            onClick={() => setAudiencePage((current) => Math.min(audienceTotalPages, current + 1))}
                          >
                            Next
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="campaign-empty">No members found.</div>
                    )}
                  </div>
                )}
              </article>
            )}

            <div className="campaign-summary">
              <div>
                <span>Trust</span>
                <strong>{trustName}</strong>
              </div>
              <div>
                <span>Campaign</span>
                <strong>{selectedCampaign?.name || campaignForm.name || 'Not selected'}</strong>
              </div>
              <div>
                <span>Schedule</span>
                <strong>{selectedSchedule ? formatDateTime(selectedSchedule.scheduled_at) : campaignForm.scheduled_at || 'Not selected'}</strong>
              </div>
              <div>
                <span>Audience</span>
                <strong>{audienceOptions.find((item) => item.id === selectedAudienceId)?.title || 'Not selected'}</strong>
              </div>
              {selectedAudienceId === 'filtered_audience' && (
                <div>
                  <span>Selected Members</span>
                  <strong>{selectedAudienceMemberCount || 'Not selected'}</strong>
                </div>
              )}
            </div>

            <div className="campaign-actions">
              <button type="button" className="campaign-secondary-btn" onClick={() => navigate('/sales-marketing', { state: { userName, trust, superuserId, sidebarNavKey: 'sales-marketing' } })}>
                Cancel
              </button>
              {activeStep > 1 && (
                <button type="button" className="campaign-secondary-btn" onClick={handleBackStep}>
                  Back
                </button>
              )}
              {activeStep < 4 ? (
                <button type="button" className="campaign-primary-btn" onClick={handleNextStep}>
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  className="campaign-primary-btn"
                  disabled={saving || (selectedAudienceId === 'filtered_audience' && !selectedAudienceMemberCount)}
                  onClick={handleProceed}
                >
                  {saving
                    ? 'Saving...'
                    : selectedAudienceId === 'filtered_audience' && !selectedAudienceMemberCount
                      ? 'Choose Members'
                      : 'Confirm & Proceed'}
                </button>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
