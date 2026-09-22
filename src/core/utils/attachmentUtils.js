const ATTACHMENT_SEPARATOR = '||::||';

function getNameFromUrl(url = '', fallback = 'Attachment') {
  try {
    const parsed = new URL(url, window.location.origin);
    const lastPart = parsed.pathname.split('/').filter(Boolean).pop();
    return decodeURIComponent(lastPart || fallback);
  } catch {
    return fallback;
  }
}

export function parseAttachmentItem(rawValue = '', index = 0) {
  const raw = String(rawValue || '').trim();
  if (!raw) {
    return null;
  }

  const unquoted = raw.replace(/^"(.*)"$/, '$1').trim();
  if (unquoted.startsWith('{') && unquoted.endsWith('}')) {
    try {
      const parsed = JSON.parse(unquoted);
      const value = String(parsed?.value || parsed?.url || '').trim();
      if (!value) return null;
      return {
        name: String(parsed?.name || getNameFromUrl(value, `Attachment-${index + 1}`)).trim(),
        value,
        isDataUrl: value.startsWith('data:'),
      };
    } catch {
      // fall through to existing parsing modes
    }
  }

  if (unquoted.includes(ATTACHMENT_SEPARATOR)) {
    const [encodedName, ...rest] = unquoted.split(ATTACHMENT_SEPARATOR);
    const value = rest.join(ATTACHMENT_SEPARATOR).trim();
    if (!value) return null;
    return {
      name: decodeURIComponent(encodedName || `Attachment-${index + 1}`),
      value,
      isDataUrl: value.startsWith('data:'),
    };
  }

  if (unquoted.startsWith('data:')) {
    return {
      name: `Attachment-${index + 1}`,
      value: unquoted,
      isDataUrl: true,
    };
  }

  return {
    name: getNameFromUrl(unquoted, `Attachment-${index + 1}`),
    value: unquoted,
    isDataUrl: false,
  };
}

export function serializeAttachmentItem(item = {}) {
  const name = encodeURIComponent(String(item.name || 'Attachment').trim());
  const value = String(item.value || '').trim();
  if (!value) return '';
  return `${name}${ATTACHMENT_SEPARATOR}${value}`;
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file?.name || 'Attachment',
        value: String(reader.result || ''),
        isDataUrl: true,
      });
    };
    reader.onerror = () => reject(new Error('Unable to read selected file.'));
    reader.readAsDataURL(file);
  });
}
