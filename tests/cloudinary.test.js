import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { pingCloudinary, safeCloudinaryError, verifyCloudinaryThenPersist, uploadCloudinaryImage } from '../server/cloudinary.js';

const credentials = {
  cloud_name: 'rent-ease-test',
  api_key: 'test_api_key_123456',
  api_secret: 'test_api_secret_abcdefghijkl',
  secure: true
};

test('Cloudinary ping passes credentials as options and returns the SDK promise', async () => {
  const result = { status: 'ok' };
  const sdk = { api: { ping: (options) => {
    assert.deepEqual(options, credentials);
    return Promise.resolve(result);
  } } };

  assert.equal(await pingCloudinary(credentials, sdk), result);
});

test('Cloudinary ping preserves rejected credential and network errors for the caller', async (t) => {
  for (const [label, error] of [
    ['invalid credentials', Object.assign(new Error('Unauthorized'), { http_code: 401 })],
    ['network failure', Object.assign(new Error('DNS lookup failed'), { code: 'ENOTFOUND' })]
  ]) {
    await t.test(label, async () => {
      const sdk = { api: { ping: (options) => {
        assert.deepEqual(options, credentials);
        return Promise.reject(error);
      } } };
      await assert.rejects(pingCloudinary(credentials, sdk), error);
    });
  }
});
test('verified credentials persist only after ping succeeds', async () => {
  const order = [];
  const sdk = { api: { ping: async (options) => {
    assert.deepEqual(options, credentials);
    order.push('verified');
    return { status: 'ok' };
  } } };
  const result = await verifyCloudinaryThenPersist(credentials, async () => {
    order.push('saved');
    return 'stored';
  }, sdk);

  assert.deepEqual(order, ['verified', 'saved']);
  assert.deepEqual(result, { ok: true, value: 'stored' });
});

test('rejected verification never invokes persistence', async () => {
  let persisted = false;
  const error = Object.assign(new Error('Unauthorized'), { http_code: 401 });
  const sdk = { api: { ping: async () => { throw error; } } };
  const result = await verifyCloudinaryThenPersist(credentials, async () => { persisted = true; }, sdk);

  assert.equal(result.ok, false);
  assert.equal(result.error, error);
  assert.equal(persisted, false);
});

test('Cloudinary image upload streams the buffer with per-admin credentials and folder options', async () => {
  const buffer = Buffer.from('mock-image-bytes');
  const result = { public_id: 'rentease/admins/admin-test/products/item' };
  const folder = 'rentease/admins/admin-test/products';
  const sdk = { uploader: { upload_stream: (options, callback) => {
    assert.equal(options.cloud_name, credentials.cloud_name);
    assert.equal(options.api_key, credentials.api_key);
    assert.equal(options.api_secret, credentials.api_secret);
    assert.equal(options.asset_folder, folder);
    assert.equal(options.use_asset_folder_as_public_id_prefix, true);
    assert.equal(options.resource_type, 'image');
    assert.deepEqual(options.allowed_formats, ['jpg', 'jpeg', 'png', 'webp', 'avif']);
    return { end: (sentBuffer) => {
      assert.equal(sentBuffer, buffer);
      callback(undefined, result);
    } };
  } } };

  assert.equal(await uploadCloudinaryImage(buffer, credentials, folder, { sdk }), result);
});

test('Cloudinary upload rejects with the original error for sanitized development diagnostics', async () => {
  const error = Object.assign(new Error(
    `Upload denied for ${credentials.api_key}/${credentials.api_secret} at https://api.cloudinary.com/v1_1/private/upload Authorization: Bearer private-token`
  ), { http_code: 401 });
  const sdk = { uploader: { upload_stream: (_options, callback) => ({ end: () => callback(error) }) } };

  await assert.rejects(uploadCloudinaryImage(Buffer.from('mock'), credentials, 'rentease/test', { sdk }), error);
  const diagnostic = safeCloudinaryError(error, credentials);
  const serialized = JSON.stringify(diagnostic);
  assert.equal(diagnostic.status, 401);
  assert.doesNotMatch(serialized, new RegExp(credentials.api_key));
  assert.doesNotMatch(serialized, new RegExp(credentials.api_secret));
  assert.doesNotMatch(serialized, /private-token|api\.cloudinary\.com|Authorization:/i);
});
test('development upload diagnostics capture and sanitize a 403 body and X-Cld-Error header', async () => {
  const body = JSON.stringify({ error: { message: `Upload denied for ${credentials.api_secret}` } });
  const responseHeader = `Account ${credentials.api_key} cannot upload`;
  const httpsModule = { request: (_options, callback) => {
    const request = new EventEmitter();
    queueMicrotask(() => {
      const response = new EventEmitter();
      response.statusCode = 403;
      response.headers = { 'x-cld-error': responseHeader };
      callback(response);
      response.emit('data', Buffer.from(body));
      response.emit('end');
    });
    return request;
  } };
  const sdk = { uploader: { upload_stream: (options, callback) => {
    httpsModule.request({ path: `/v1_1/${options.cloud_name}/image/upload` }, (response) => {
      response.on('end', () => callback({ name: 'UnexpectedResponse', message: 'Server returned unexpected status code - 403', http_code: 403 }));
    });
    return { end: () => {} };
  } } };

  await assert.rejects(
    uploadCloudinaryImage(Buffer.from('mock-image-bytes'), credentials, 'rentease/test', { sdk, captureResponse:true, httpsModule }),
    (error) => {
      const diagnostic = safeCloudinaryError(error, credentials);
      const serialized = JSON.stringify(diagnostic);
      assert.equal(diagnostic.responseStatus, 403);
      assert.equal(diagnostic.responseMessage, 'Upload denied for [redacted]');
      assert.equal(diagnostic.xCldError, 'Account [redacted] cannot upload');
      assert.doesNotMatch(serialized, new RegExp(credentials.api_key));
      assert.doesNotMatch(serialized, new RegExp(credentials.api_secret));
      assert.doesNotMatch(serialized, /mock-image-bytes/);
      return true;
    }
  );
  assert.equal(httpsModule.request.name, 'request');
});
test('Cloudinary diagnostics redact keys, secrets, authorization values, and URLs', () => {
  const error = Object.assign(new Error(
    `Request failed https://api:${credentials.api_secret}@api.cloudinary.com/v1_1/${credentials.cloud_name}/ping?api_key=${credentials.api_key} Authorization: Bearer token-value "Authorization": "Basic sensitive-header-value" api_secret=${credentials.api_secret}`
  ), { http_code: 401 });
  const diagnostic = safeCloudinaryError(error, credentials);
  const serialized = JSON.stringify(diagnostic);

  assert.equal(diagnostic.name, 'Error');
  assert.equal(diagnostic.status, 401);
  assert.doesNotMatch(serialized, new RegExp(credentials.api_secret));
  assert.doesNotMatch(serialized, new RegExp(credentials.api_key));
  assert.doesNotMatch(serialized, /token-value|sensitive-header-value|api\.cloudinary\.com|Authorization:/i);
  assert.match(diagnostic.message, /\[redacted URL\]/);
});

