import { auth } from './firebase';

/**
 * Compresses an uploaded image file via Canvas so it stays under 350KB
 * and persists reliably in Firestore without hitting 1MB doc limits.
 */
export async function compressImageToDataUrl(
  file: File,
  maxDimension = 1080,
  quality = 0.8
): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);

  let { width, height } = img;
  if (width > maxDimension || height > maxDimension) {
    const ratio = Math.min(maxDimension / width, maxDimension / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, width, height);

  let result = canvas.toDataURL('image/webp', quality);
  if (!result.startsWith('data:image/webp') || result.length > 420_000) {
    result = canvas.toDataURL('image/jpeg', Math.min(quality, 0.72));
  }
  if (result.length > 480_000) {
    result = canvas.toDataURL('image/jpeg', 0.52);
  }
  return result;
}

export function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read media file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to decode image file.'));
    img.src = src;
  });
}

/**
 * Uploads video or voice recording blobs to the Express backend /api/upload
 * with Firebase ID token authentication.
 */
export async function uploadMediaBlob(fileOrBlob: File | Blob): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to upload media.');
  const token = await user.getIdToken();
  const dataUrl = await readFileAsDataUrl(fileOrBlob);

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        dataUrl,
        mimeType: fileOrBlob.type,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as { url: string };
      return data.url;
    }

    // If backend route is unavailable (e.g. standalone Android APK) and dataUrl fits Firestore limit, store directly
    if (dataUrl.length <= 450_000) {
      return dataUrl;
    }

    const err = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Media upload failed.');
  } catch (error) {
    if (dataUrl.length <= 450_000) {
      return dataUrl;
    }
    throw error instanceof Error ? error : new Error('Media upload failed.');
  }
}

export function formatRelativeTime(timestamp: unknown): string {
  let ms = 0;
  if (!timestamp) return 'Just now';
  if (typeof timestamp === 'object' && timestamp !== null && 'toMillis' in timestamp) {
    ms = (timestamp as { toMillis: () => number }).toMillis();
  } else if (typeof timestamp === 'number') {
    ms = timestamp;
  } else if (typeof timestamp === 'string') {
    ms = Date.parse(timestamp);
  }
  if (!ms || Number.isNaN(ms)) return 'Just now';

  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(ms).toLocaleDateString();
}
