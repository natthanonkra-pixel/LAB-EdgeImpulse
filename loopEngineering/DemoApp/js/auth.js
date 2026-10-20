import { ApiError, clearSession, requestJson, saveSession } from './api.js';

const form = document.querySelector('#login-form');
const usernameInput = document.querySelector('#username');
const passwordInput = document.querySelector('#password');
const errorRegion = document.querySelector('#login-error');
const submitButton = form?.querySelector('[type="submit"]');
const submitLabel = submitButton?.querySelector('.login-submit__label');

function showError(message) {
  errorRegion.textContent = message;
  errorRegion.hidden = false;
}

function clearError() {
  errorRegion.textContent = '';
  errorRegion.hidden = true;
}

function validateResponse(value, predicate, message) {
  if (!predicate(value)) {
    throw new Error(message);
  }
  return value;
}

function loginErrorMessage(error) {
  if (error instanceof ApiError && error.status === 401) {
    return 'Invalid username or password.';
  }
  if (error instanceof ApiError && error.status === 400) {
    return 'Login request failed. Please check your input.';
  }
  if (error instanceof ApiError && error.status >= 500) {
    return 'Server unavailable. Please try again later.';
  }
  if (error instanceof ApiError && error.kind === 'timeout') {
    return 'The connection timed out. Please try again.';
  }
  if (error instanceof ApiError && error.kind === 'network') {
    return 'Could not connect to the service. Check your connection and try again.';
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Sign in could not be completed. Please try again.';
}

async function completeLogin(username, password) {
  clearSession();

  const loginResponse = validateResponse(
    await requestJson('/api/auth/login', {
      method: 'POST',
      body: { username, password },
      authenticated: false,
    }),
    (value) => typeof value?.token === 'string' && typeof value?.refreshToken === 'string',
    'The sign-in service returned an invalid response.'
  );

  saveSession({ token: loginResponse.token, refreshToken: loginResponse.refreshToken });

  const user = validateResponse(
    await requestJson('/api/auth/user'),
    (value) => typeof value?.customerId?.id === 'string',
    'This account is not assigned to a customer.'
  );
  const customerId = user.customerId.id;

  const devicesResponse = validateResponse(
    await requestJson(`/api/customer/${encodeURIComponent(customerId)}/devices?pageSize=50&page=0`),
    (value) => Array.isArray(value?.data),
    'The customer device list could not be read.'
  );
  const deviceId = devicesResponse.data[0]?.id?.id;
  if (typeof deviceId !== 'string' || deviceId.length === 0) {
    throw new Error('No device is assigned to this customer.');
  }

  const credentials = validateResponse(
    await requestJson(`/api/device/${encodeURIComponent(deviceId)}/credentials`),
    (value) => value?.credentialsType === 'ACCESS_TOKEN' && typeof value?.credentialsId === 'string',
    'The device access credentials could not be read.'
  );

  saveSession({
    customerId,
    deviceId,
    deviceAccessToken: credentials.credentialsId,
  });
  window.location.assign('dashboard.html');
}

if (form && usernameInput && passwordInput && errorRegion && submitButton && submitLabel) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username || !password || !usernameInput.validity.valid) {
      showError('Enter a valid email address and password.');
      (!username || !usernameInput.validity.valid ? usernameInput : passwordInput).focus();
      return;
    }

    submitButton.disabled = true;
    submitLabel.textContent = 'Connecting...';
    try {
      await completeLogin(username, password);
    } catch (error) {
      clearSession();
      showError(loginErrorMessage(error));
    } finally {
      submitButton.disabled = false;
      submitLabel.textContent = 'Login to Dashboard';
    }
  });

  const query = new URLSearchParams(window.location.search);
  if (query.get('reason') === 'session-expired') {
    showError('Your session expired. Please sign in again.');
    window.history.replaceState(null, '', window.location.pathname);
  }
}