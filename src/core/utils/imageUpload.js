const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png']);
const KNOWN_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'jfif', 'webp', 'gif', 'bmp', 'svg', 'avif', 'heic', 'heif']);

function getFileExtension(name = '') {
  const value = String(name || '').trim();
  if (!value.includes('.')) return '';
  return value.split('.').pop().toLowerCase();
}

function stripFileExtension(name = '') {
  const value = String(name || '').trim();
  if (!value) return 'image';
  const base = value.replace(/\.[^/.]+$/, '').trim();
  return base || 'image';
}

function withJpegName(name = '') {
  return `${stripFileExtension(name)}.jpg`;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unable to process selected image.'));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function decodeImage(input) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(input);
    } catch {
      // Fallback to HTMLImageElement decode path below.
    }
  }
  return loadImageFromFile(input);
}

async function convertImageFileToJpeg(file, quality = 0.92) {
  const image = await decodeImage(file);
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to process selected image.');
  context.drawImage(image, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  if (typeof image?.close === 'function') image.close();
  if (!blob) throw new Error('Unable to process selected image.');
  return new File([blob], withJpegName(file?.name), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

function buildFormatWarning(fileName) {
  return `"${fileName || 'image'}" format converted to JPEG. Allowed formats: JPG, JPEG, PNG.`;
}

export function getAllowedImageFormatsMessage() {
  return 'Image format should be JPG, JPEG, or PNG. Other image formats are auto-converted to JPEG.';
}

export function isImageFileLike(file) {
  const mime = String(file?.type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  return KNOWN_IMAGE_EXTENSIONS.has(getFileExtension(file?.name));
}

export async function prepareImageFileForUpload(file, { quality = 0.92 } = {}) {
  if (!file) {
    return { file: null, warning: '', error: { message: 'No image file provided.' } };
  }

  const mime = String(file?.type || '').toLowerCase();
  const extension = getFileExtension(file?.name);
  const isImage = mime.startsWith('image/') || KNOWN_IMAGE_EXTENSIONS.has(extension);
  if (!isImage) {
    return { file: null, warning: '', error: { message: getAllowedImageFormatsMessage() } };
  }

  const allowedMime = ALLOWED_IMAGE_MIME_TYPES.has(mime);
  const allowedExtension = !extension || ALLOWED_IMAGE_EXTENSIONS.has(extension);
  if (allowedMime && allowedExtension) {
    return { file, warning: '', error: null };
  }

  try {
    if (mime === 'image/jpeg') {
      const renamed = new File([file], withJpegName(file?.name), {
        type: 'image/jpeg',
        lastModified: Number(file?.lastModified || Date.now()),
      });
      return { file: renamed, warning: buildFormatWarning(file?.name), error: null };
    }
    const converted = await convertImageFileToJpeg(file, quality);
    return { file: converted, warning: buildFormatWarning(file?.name), error: null };
  } catch (error) {
    return {
      file: null,
      warning: '',
      error: { message: error?.message || 'Unable to process selected image.' },
    };
  }
}

export async function normalizeImageDataUrlToJpeg(dataUrl = '', { quality = 0.92 } = {}) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!match) return { dataUrl: '', warning: '', error: { message: 'Invalid image data.' } };

  const mime = String(match[1] || '').toLowerCase();
  try {
    const toBlob = async (url) => {
      const response = await fetch(String(url || ''));
      if (!response.ok) throw new Error('Unable to process selected image.');
      return response.blob();
    };
    if (mime === 'image/jpeg' || mime === 'image/png') {
      const blob = await toBlob(dataUrl);
      return { dataUrl: String(dataUrl || ''), blob, warning: '', error: null };
    }

    const image = await new Promise((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error('Unable to process selected image.'));
      node.src = String(dataUrl || '');
    });

    const width = Math.max(1, image.naturalWidth || image.width || 1);
    const height = Math.max(1, image.naturalHeight || image.height || 1);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to process selected image.');
    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    if (!blob) throw new Error('Unable to process selected image.');
    const normalizedDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Unable to read selected image.'));
      reader.readAsDataURL(blob);
    });
    return {
      dataUrl: normalizedDataUrl,
      blob,
      warning: 'Image format converted to JPEG. Allowed formats: JPG, JPEG, PNG.',
      error: null,
    };
  } catch (error) {
    return { dataUrl: '', warning: '', error: { message: error?.message || 'Unable to process selected image.' } };
  }
}
