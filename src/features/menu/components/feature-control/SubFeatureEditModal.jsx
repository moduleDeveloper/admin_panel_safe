import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FeatureIconRenderer } from '../../../dashboard/pages/Dashboard';
import { uploadFeatureLogo } from '../../services/featureControlService';
import { getAllowedImageFormatsMessage, prepareImageFileForUpload } from '../../../../core/utils/imageUpload';

function toDefaults(row) {
  return {
    display_name: row.display_name ?? '',
    tagline: row.tagline || row.master_subname || '',
    icon_url: row.icon_url || '',
    route: row.route || '',
    quick_order: row.quick_order ?? '',
  };
}

function normalizeRouteInput(value) {
  const route = String(value ?? '').trim();
  if (!route) return '';
  if (/^https?:\/\//i.test(route)) return route;
  return route.startsWith('/') ? route : `/${route}`;
}

function validate(values) {
  const errors = {};

  const quickOrder = String(values.quick_order).trim();
  if (quickOrder !== '' && !/^\d+$/.test(quickOrder)) {
    errors.quick_order = 'Quick order must be a numeric value.';
  }

  const iconUrl = String(values.icon_url || '').trim();
  const isUrl = /^https?:\/\//i.test(iconUrl);
  const isPath = /^\/?[A-Za-z0-9._\-/]+$/.test(iconUrl);
  const isData = /^data:image\//i.test(iconUrl);
  const isEmojiOrGlyph = !isUrl && !isPath && !isData && iconUrl.length <= 12;
  if (iconUrl && !(isUrl || isPath || isData || isEmojiOrGlyph)) {
    errors.icon_url = 'Icon should be URL/path/data image or emoji.';
  }

  const route = normalizeRouteInput(values.route);
  const isHttpRoute = /^https?:\/\//i.test(route);
  const isAppRoute = /^\/[A-Za-z0-9\-_/]*$/.test(route);
  if (route && !(isHttpRoute || isAppRoute)) {
    errors.route = 'Route should start with "/" or be an absolute URL.';
  }

  return errors;
}

export default function SubFeatureEditModal({
  open,
  row,
  trustId,
  parentFeatureName,
  tier,
  saving,
  saveError,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState(() => toDefaults(row || {}));
  const [fieldErrors, setFieldErrors] = useState({});
  const [uploadError, setUploadError] = useState('');
  const [instantPreviewUrl, setInstantPreviewUrl] = useState('');
  const [iconFile, setIconFile] = useState(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (instantPreviewUrl) URL.revokeObjectURL(instantPreviewUrl);
    };
  }, [instantPreviewUrl]);

  if (!open || !row || !form) return null;

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const handleIconFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const prepared = await prepareImageFileForUpload(file);
    if (prepared.error || !prepared.file) {
      setUploadError(prepared.error?.message || getAllowedImageFormatsMessage());
      return;
    }
    const uploadFile = prepared.file;

    if (uploadFile.size > 2 * 1024 * 1024) {
      setUploadError('Icon image should be under 2MB.');
      return;
    }

    if (instantPreviewUrl) URL.revokeObjectURL(instantPreviewUrl);
    setInstantPreviewUrl(URL.createObjectURL(uploadFile));
    setIconFile(uploadFile);
    setUploadError(prepared.warning || '');
  };

  const handleSubmit = async () => {
    const normalizedRoute = normalizeRouteInput(form.route);
    const errors = validate({ ...form, route: normalizedRoute });
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    let iconUrl = String(form.icon_url || '').trim();
    if (iconFile) {
      setUploadingIcon(true);
      setUploadError('');
      const { data: uploadData, error: uploadErrorData } = await uploadFeatureLogo(iconFile, {
        trustId,
        ownerId: row.sub_feature_id,
        type: 'sub-feature',
      });
      setUploadingIcon(false);

      if (uploadErrorData || !uploadData?.publicUrl) {
        setUploadError(uploadErrorData?.message || 'Unable to upload icon.');
        return;
      }

      iconUrl = uploadData.publicUrl;
    }

    onSave({
      quick_order: String(form.quick_order).trim() === '' ? null : Number(form.quick_order),
      display_name: String(form.display_name || '').trim() || null,
      tagline: String(form.tagline || '').trim(),
      icon_url: iconUrl,
      route: normalizedRoute,
    });
  };

  const handleRemoveIcon = () => {
    if (instantPreviewUrl) URL.revokeObjectURL(instantPreviewUrl);
    setInstantPreviewUrl('');
    setIconFile(null);
    handleChange('icon_url', '');
  };

  return createPortal(
    <div className="fc-modal-overlay" onClick={onClose}>
      <div className="fc-modal" onClick={(event) => event.stopPropagation()}>
        <div className="fc-modal-head">
          <div>
            <h3>Edit Sub Feature</h3>
            <p>Customize sub feature label, tagline, icon and display order.</p>
          </div>
          <button type="button" className="fc-close" onClick={onClose}>x</button>
        </div>

        <div className="fc-modal-content">
          <div className="fc-modal-readonly">
            <div><strong>Main Feature:</strong> {parentFeatureName || '-'}</div>
            <div><strong>Sub Feature:</strong> {row.master_name}</div>
            <div><strong>Tier:</strong> {tier}</div>
          </div>

          <div className="fc-modal-grid">
            <label>
              <span>Display Name</span>
              <input value={form.display_name} onChange={(event) => handleChange('display_name', event.target.value)} />
              {fieldErrors.display_name ? <small>{fieldErrors.display_name}</small> : null}
            </label>

            <label>
              <span>Tagline</span>
              <input value={form.tagline} onChange={(event) => handleChange('tagline', event.target.value)} />
            </label>

            <label className="fc-span-2">
              <span>Icon</span>
              <div className="fc-icon-editor">
                <div className="fc-icon-action-row">
                  <div className="fc-icon-upload-row">
                    <label className="fc-upload-btn">
                      Upload Icon
                      <input type="file" accept="image/*" onChange={handleIconFileChange} />
                    </label>
                    <button type="button" className="fc-btn" onClick={handleRemoveIcon} disabled={!form.icon_url && !instantPreviewUrl}>
                      Remove Icon
                    </button>
                  </div>
                  <div className="fc-icon-preview-panel" aria-live="polite">
                    {instantPreviewUrl || form.icon_url ? (
                      <div className="fc-icon-preview-box">
                        <FeatureIconRenderer icon_url={instantPreviewUrl || form.icon_url} route={row.route} size={28} />
                      </div>
                    ) : (
                      <div className="fc-icon-preview-empty">No Icon</div>
                    )}
                    <span className="fc-icon-preview-label">Preview</span>
                  </div>
                </div>
              </div>
              {uploadError ? <small>{uploadError}</small> : null}
            </label>

            <label>
              <span>Quick Order</span>
              <input
                type="number"
                min="0"
                value={form.quick_order}
                onChange={(event) => handleChange('quick_order', event.target.value)}
              />
              {fieldErrors.quick_order ? <small>{fieldErrors.quick_order}</small> : null}
            </label>

            <label>
              <span>Route</span>
              <input
                placeholder="/vip-login"
                value={form.route}
                onChange={(event) => handleChange('route', event.target.value)}
                onBlur={(event) => handleChange('route', normalizeRouteInput(event.target.value))}
              />
              {fieldErrors.route ? <small>{fieldErrors.route}</small> : null}
            </label>
          </div>
        </div>

        {saveError ? <div className="fc-error-inline">{saveError}</div> : null}

        <div className="fc-modal-actions">
          <button type="button" className="fc-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="fc-btn fc-btn-primary" onClick={handleSubmit} disabled={saving || uploadingIcon}>
            {saving || uploadingIcon ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
