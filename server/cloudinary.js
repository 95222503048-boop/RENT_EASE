import https from 'node:https';
import { v2 as cloudinary } from 'cloudinary';

// Cloudinary's v2 API accepts options first and returns a promise without a callback.
export function pingCloudinary(credentials, sdk = cloudinary) {
  return sdk.api.ping(credentials);
}

export async function verifyCloudinaryThenPersist(credentials, persist, sdk = cloudinary) {
  try {
    await pingCloudinary(credentials, sdk);
  } catch (error) {
    return { ok: false, error };
  }
  return { ok: true, value: await persist() };
}

// The 2.11.0 uploader drops response details for unexpected statuses (including 403).
// In development only, observe the matching HTTPS response while preserving SDK handling.
export function captureCloudinaryUploadResponse(httpsModule, cloudName, maxBodyBytes = 4096) {
  const originalRequest = httpsModule.request;
  let captured = false;
  let settleResponse;
  const response = new Promise((resolve) => { settleResponse = resolve; });
  const wrappedRequest = function (...args) {
    const options = args[0];
    const callbackIndex = args.findIndex((arg, index) => index > 0 && typeof arg === 'function');
    const uploadPath = `/v1_1/${cloudName}/image/upload`;
    const matches = !captured && options && typeof options === 'object'
      && typeof options.path === 'string' && options.path.includes(uploadPath);
    if (!matches || callbackIndex < 0) return originalRequest.apply(this, args);

    captured = true;
    const originalResponseCallback = args[callbackIndex];
    args[callbackIndex] = function (res) {
      const chunks = [];
      let capturedBytes = 0;
      let bodyTruncated = false;
      res.on('data', (chunk) => {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = maxBodyBytes - capturedBytes;
        if (remaining > 0) {
          const excerpt = data.subarray(0, remaining);
          chunks.push(excerpt);
          capturedBytes += excerpt.length;
        }
        if (data.length > remaining) bodyTruncated = true;
      });
      res.once('end', () => settleResponse({
        status:res.statusCode,
        xCldError:typeof res.headers?.['x-cld-error'] === 'string' ? res.headers['x-cld-error'].slice(0,1000) : '',
        body:Buffer.concat(chunks).toString('utf8'),
        bodyTruncated
      }));
      res.once('error', () => settleResponse(null));
      return originalResponseCallback.call(this, res);
    };

    const request = originalRequest.apply(this, args);
    request.once?.('error', () => settleResponse(null));
    return request;
  };
  httpsModule.request = wrappedRequest;

  return {
    response,
    restore() {
      if (httpsModule.request === wrappedRequest) httpsModule.request = originalRequest;
    }
  };
}

export function uploadCloudinaryImage(buffer, credentials, folder, { sdk = cloudinary, captureResponse = false, httpsModule = https } = {}) {
  return new Promise((resolve, reject) => {
    const capture = captureResponse
      ? captureCloudinaryUploadResponse(httpsModule, credentials.cloud_name)
      : null;
    try {
      const stream = sdk.uploader.upload_stream({
        ...credentials,
        asset_folder:folder,
        use_asset_folder_as_public_id_prefix:true,
        resource_type:'image',
        allowed_formats:['jpg','jpeg','png','webp','avif']
      }, (error, result) => {
        if (!error) return resolve(result);
        if (!capture) return reject(error);
        capture.response.then((cloudinaryResponse) => {
          const details = cloudinaryResponse ? { cloudinaryResponse } : {};
          reject({ name:error.name, message:error.message, http_code:error.http_code, ...details });
        }, () => reject(error));
      });
      capture?.restore();
      stream.end(buffer);
    } catch (error) {
      capture?.restore();
      reject(error);
    }
  });
}

function sanitizeDiagnosticText(value, credentials, maxLength = 300) {
  if (typeof value !== 'string') return '';
  let message = value;
  for (const secret of [credentials.api_key, credentials.api_secret].filter((entry) => typeof entry === 'string' && entry.length > 0)) {
    message = message.split(secret).join('[redacted]');
    const encoded = encodeURIComponent(secret);
    if (encoded !== secret) message = message.split(encoded).join('[redacted]');
  }
  return message
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[redacted URL]')
    .replace(/["']?authorization["']?\s*[:=]\s*["']?(?:(?:Bearer|Basic)\s+)?[^"'\s,;}]+["']?/gi, 'Authorization=[redacted]')
    .replace(/\b(api[_-]?key|api[_-]?secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, maxLength);
}

export function safeCloudinaryError(error, credentials = {}) {
  const rawStatus = error?.http_code ?? error?.statusCode ?? error?.status;
  const parsedStatus = Number(rawStatus);
  const status = Number.isInteger(parsedStatus) && parsedStatus >= 100 && parsedStatus <= 599
    ? parsedStatus
    : undefined;
  const name = typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,60}$/.test(error.name)
    ? error.name
    : 'Error';
  const diagnostic = {
    name,
    ...(status ? { status } : {}),
    message:sanitizeDiagnosticText(error?.message || 'Unknown Cloudinary error',credentials)
  };
  const response = error?.cloudinaryResponse;
  if (response && typeof response === 'object') {
    const responseStatus = Number(response.status);
    if (Number.isInteger(responseStatus) && responseStatus >= 100 && responseStatus <= 599) diagnostic.responseStatus = responseStatus;
    if (typeof response.xCldError === 'string' && response.xCldError) {
      diagnostic.xCldError = sanitizeDiagnosticText(response.xCldError,credentials,500);
    }
    if (typeof response.body === 'string' && response.body) {
      let bodyMessage = response.body;
      try {
        const parsed = JSON.parse(response.body);
        bodyMessage = parsed?.error?.message ?? parsed?.message ?? (typeof parsed?.error === 'string' ? parsed.error : bodyMessage);
      } catch { /* Keep only the bounded, sanitized response excerpt. */ }
      diagnostic.responseMessage = sanitizeDiagnosticText(bodyMessage,credentials,500);
      if (response.bodyTruncated) diagnostic.responseBodyTruncated = true;
    }
  }
  return diagnostic;
}
