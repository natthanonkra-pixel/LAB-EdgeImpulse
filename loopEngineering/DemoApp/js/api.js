const BASE_URL = 'https://thingsboard.cloud';
const REQUEST_TIMEOUT_MS = 10_000;
const SESSION_KEYS = ['token', 'refreshToken', 'customerId', 'deviceId', 'deviceAccessToken'];

let refreshInFlight = null;

export class ApiError extends Error {
  constructor(message, { status = 0, kind = 'http' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind;
  }
}

export function clearSession() {
  for (const key of SESSION_KEYS) {
    sessionStorage.removeItem(key);
  }
}

export function saveSession(values) {
  for (const key of SESSION_KEYS) {
    if (typeof values[key] === 'string' && values[key].length > 0) {
      sessionStorage.setItem(key, values[key]);
    }
  }
}

export function getSessionValue(key) {
  return sessionStorage.getItem(key);
}

async function sendRequest(path, { method = 'GET', body, authenticated = true } = {}) {
  const controller = new AbortController();
  const headers = { Accept: 'application/json' };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (authenticated) {
    const token = getSessionValue('token');
    if (!token) {
      throw new ApiError('Your session has expired. Please sign in again.', { kind: 'session' });
    }
    headers['X-Authorization'] = `Bearer ${token}`;
  }

  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ApiError('The service could not complete the request.', { status: response.status });
    }

    let responseText;
    try {
      responseText = await response.text();
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ApiError('The request timed out. Please try again.', { kind: 'timeout' });
      }
      throw new ApiError('The service returned an unreadable response.', { kind: 'response' });
    }

    if (responseText.length === 0) {
      return null;
    }

    try {
      return JSON.parse(responseText);
    } catch (error) {
      throw new ApiError('The service returned an invalid response.', { kind: 'response' });
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new ApiError('The request timed out. Please try again.', { kind: 'timeout' });
    }
    throw new ApiError('Could not connect to the service. Please try again.', { kind: 'network' });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function performTokenRefresh() {
  const refreshToken = getSessionValue('refreshToken');
  if (!refreshToken) {
    throw new ApiError('Your session has expired. Please sign in again.', { kind: 'session' });
  }

  const tokens = await sendRequest('/api/auth/token', {
    method: 'POST',
    body: { refreshToken },
    authenticated: false,
  });

  if (
    !tokens ||
    typeof tokens.token !== 'string' ||
    typeof tokens.refreshToken !== 'string'
  ) {
    throw new ApiError('The service could not renew your session.', { kind: 'response' });
  }

  saveSession({ token: tokens.token, refreshToken: tokens.refreshToken });
}

export async function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = performTokenRefresh()
      .catch((error) => {
        clearSession();
        window.location.replace('login.html?reason=session-expired');
        throw error;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

export async function requestJson(path, options = {}) {
  const authenticated = options.authenticated !== false;
  let retried = false;

  while (true) {
    try {
      return await sendRequest(path, { ...options, authenticated });
    } catch (error) {
      if (authenticated && error.status === 401 && !retried) {
        retried = true;
        await refreshSession();
        continue;
      }
      throw error;
    }
  }
}