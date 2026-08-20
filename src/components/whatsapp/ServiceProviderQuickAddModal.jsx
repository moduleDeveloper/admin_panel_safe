import { useState } from 'react';
import { createPortal } from 'react-dom';
import { createWaService, updateWaService } from '../../services/whatsapp/waServiceProviderService';
import '../../pages/NoticeboardPage.css';

function sanitizeDigits(value, maxLength = 10) {
  return String(value ?? '').replace(/\D/g, '').slice(0, maxLength);
}

const EMPTY_FORM = {
  provider: '',
  purpose: '',
  name: '',
  wa_number: '',
  company_id: '',
  endpoint: '',
  api_token: '',
  is_active: true,
};

function toFormValues(service) {
  return {
    provider: service.provider || '',
    purpose: service.purpose || '',
    name: service.name || '',
    wa_number: service.wa_number || '',
    company_id: service.company_id || '',
    endpoint: service.endpoint || '',
    api_token: service.api_token || '',
    is_active: service.is_active !== false,
  };
}

export default function ServiceProviderQuickAddModal({ trustId, editingService = null, onClose, onSaved }) {
  const isEditMode = Boolean(editingService);
  const [form, setForm] = useState(() => (editingService ? toFormValues(editingService) : EMPTY_FORM));
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [numberWarning, setNumberWarning] = useState('');

  const handleWaNumberChange = (rawValue) => {
    const raw = String(rawValue ?? '');
    const sanitized = sanitizeDigits(raw, 10);
    setNumberWarning(/\D/.test(raw) ? 'Only numbers are allowed in WhatsApp Number.' : '');
    setForm((prev) => ({ ...prev, wa_number: sanitized }));
  };

  const handleSave = async () => {
    setFormError('');
    if (!form.provider.trim()) {
      setFormError('Provider is required.');
      return;
    }
    if (!form.purpose.trim()) {
      setFormError('Purpose is required.');
      return;
    }
    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (form.wa_number.trim() && form.wa_number.trim().length !== 10) {
      setFormError('WhatsApp Number must be exactly 10 digits.');
      return;
    }

    setSaving(true);
    const { data, error } = isEditMode
      ? await updateWaService(editingService.id, form, trustId)
      : await createWaService({ ...form, trust_id: trustId });
    if (error) {
      setFormError(error.message || `Unable to ${isEditMode ? 'update' : 'create'} service provider.`);
      setSaving(false);
      return;
    }

    setSaving(false);
    onSaved(data);
  };

  return createPortal(
    <div className="nb-preview-backdrop" onClick={onClose}>
      <div className="nb-preview-modal" onClick={(event) => event.stopPropagation()}>
        <div className="nb-form-card" style={{ margin: 0, border: 0, padding: 0 }}>
          <h3>{isEditMode ? 'Edit Service Provider' : 'Create Service Provider'}</h3>
          <div className="nb-form-layout">
            <section className="nb-form-section">
              <h4 className="nb-section-title">Provider Details</h4>
              <div className="nb-form-grid nb-form-grid-2">
                <label>
                  <span>Provider *</span>
                  <input
                    value={form.provider}
                    onChange={(e) => setForm((prev) => ({ ...prev, provider: e.target.value }))}
                    placeholder="e.g. Blotato, Meta Cloud API"
                  />
                </label>
                <label>
                  <span>Purpose *</span>
                  <input
                    value={form.purpose}
                    onChange={(e) => setForm((prev) => ({ ...prev, purpose: e.target.value }))}
                    placeholder="e.g. OTP, Marketing"
                  />
                </label>
                <label>
                  <span>Name *</span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter display name"
                  />
                </label>
                <label>
                  <span>WhatsApp Number</span>
                  <input
                    value={form.wa_number}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={10}
                    onChange={(e) => handleWaNumberChange(e.target.value)}
                    placeholder="Enter 10 digit WhatsApp number"
                  />
                </label>
                <label>
                  <span>Company Id</span>
                  <input
                    value={form.company_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, company_id: e.target.value }))}
                    placeholder="Enter company id"
                  />
                </label>
                <label>
                  <span>Endpoint</span>
                  <input
                    value={form.endpoint}
                    onChange={(e) => setForm((prev) => ({ ...prev, endpoint: e.target.value }))}
                    placeholder="Enter API endpoint URL"
                    autoComplete="off"
                  />
                </label>
                <label>
                  <span>API Token</span>
                  <div className="nb-input-with-actions">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={form.api_token}
                      onChange={(e) => setForm((prev) => ({ ...prev, api_token: e.target.value }))}
                      placeholder="Enter API token"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="nb-input-action-btn"
                      onClick={() => setShowToken((prev) => !prev)}
                      title={showToken ? 'Hide token' : 'Show token'}
                    >
                      {showToken ? 'Hide' : 'Show'}
                    </button>
                  </div>
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
              {numberWarning && <div className="nb-warning-inline">{numberWarning}</div>}
            </section>
          </div>

          {formError && <div className="nb-error">{formError}</div>}
          <div className="nb-form-actions">
            <button className="nb-secondary-btn" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="nb-add-btn" onClick={handleSave} disabled={saving} type="button">
              {saving ? 'Saving...' : isEditMode ? 'Update Service Provider' : 'Save Service Provider'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
