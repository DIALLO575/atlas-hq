/** Signed Supabase TUS uploads: bounded 6 MiB chunks, retrying uncertain mobile requests. */
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

export function signedTusEndpoint(projectUrl) {
  const url = new URL(projectUrl);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('STORAGE_URL_INVALID');
  }
  if (url.hostname.endsWith('.supabase.co') && !url.hostname.endsWith('.storage.supabase.co')) {
    url.hostname = url.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co');
  }
  url.pathname = '/storage/v1/upload/resumable/sign';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function tusMetadata(metadata) {
  return Object.entries(metadata).map(([key, value]) => `${key} ${btoa(value)}`).join(',');
}

/** Only accepts an upload URL on this project's approved Storage hosts. */
function allowedUploadUrl(location, endpoint, projectUrl) {
  if (!location) throw new Error('STORAGE_TUS_LOCATION_MISSING');
  const url = new URL(location, endpoint);
  const project = new URL(projectUrl);
  const direct = new URL(endpoint);
  if (url.protocol !== direct.protocol || ![direct.host, project.host].includes(url.host)
    || !url.pathname.startsWith('/storage/v1/upload/resumable/')) throw new Error('STORAGE_TUS_LOCATION_INVALID');
  return url.toString();
}

async function readOffset(uploadUrl, token, publishableKey, request) {
  try {
    const response = await request(uploadUrl, {
      method: 'HEAD',
      headers: { 'Tus-Resumable': '1.0.0', 'x-signature': token, apikey: publishableKey },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const offset = Number(response.headers.get('Upload-Offset'));
    return Number.isSafeInteger(offset) && offset >= 0 ? offset : null;
  } catch { return null; }
}

/** Upload with signed token, without exposing user session JWT to Storage. */
export async function uploadSignedResumable({ projectUrl, publishableKey, path, token, file, onProgress = () => {}, request = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!token || !publishableKey || !path || file.size <= 0) throw new Error('STORAGE_TUS_INVALID');
  const endpoint = signedTusEndpoint(projectUrl);
  const contentType = /\.pdf$/i.test(path) ? 'application/pdf' : 'application/epub+zip';
  const headers = {
    'Tus-Resumable': '1.0.0',
    'Upload-Length': String(file.size),
    'Upload-Metadata': tusMetadata({ bucketName: 'books', objectName: path, contentType, cacheControl: '3600' }),
    'x-signature': token,
    apikey: publishableKey,
  };
  const retryDelays = [0, 750, 1500, 3000];
  let uploadUrl = null;
  for (let attempt = 0; attempt < retryDelays.length; attempt++) {
    if (attempt) await wait(retryDelays[attempt]);
    try {
      const response = await request(endpoint, { method: 'POST', headers, cache: 'no-store' });
      if (response.status !== 201) {
        if (response.status < 500 && response.status !== 408 && response.status !== 429) throw new Error(`STORAGE_TUS_CREATE_${response.status}`);
        continue;
      }
      uploadUrl = allowedUploadUrl(response.headers.get('Location'), endpoint, projectUrl);
      break;
    } catch (error) {
      if (String(error).includes('STORAGE_TUS_')) throw error;
    }
  }
  if (!uploadUrl) throw new Error('STORAGE_TUS_CREATE_FAILED');

  let offset = 0;
  onProgress(0);
  while (offset < file.size) {
    let uploaded = false;
    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
      if (attempt) await wait(retryDelays[attempt]);
      const end = Math.min(file.size, offset + TUS_CHUNK_BYTES);
      try {
        const response = await request(uploadUrl, {
          method: 'PATCH',
          headers: {
            'Tus-Resumable': '1.0.0',
            'Upload-Offset': String(offset),
            'Content-Type': 'application/offset+octet-stream',
            'x-signature': token,
            apikey: publishableKey,
          },
          body: file.slice(offset, end),
          cache: 'no-store',
        });
        if (response.status === 204) {
          const returned = response.headers.get('Upload-Offset');
          const next = returned === null ? end : Number(returned);
          if (!Number.isSafeInteger(next) || next <= offset || next > file.size) throw new Error('STORAGE_TUS_OFFSET_INVALID');
          offset = next;
          onProgress(Math.round(offset / file.size * 100));
          uploaded = true;
          break;
        }
        if (response.status < 500 && ![408, 409, 429].includes(response.status)) throw new Error(`STORAGE_TUS_PATCH_${response.status}`);
      } catch (error) {
        if (String(error).includes('STORAGE_TUS_')) throw error;
      }
      const resumed = await readOffset(uploadUrl, token, publishableKey, request);
      if (resumed !== null && resumed > offset && resumed <= file.size) {
        offset = resumed;
        onProgress(Math.round(offset / file.size * 100));
        uploaded = true;
        break;
      }
    }
    if (!uploaded) throw new Error('STORAGE_TUS_INTERRUPTED');
  }
  return true;
}
