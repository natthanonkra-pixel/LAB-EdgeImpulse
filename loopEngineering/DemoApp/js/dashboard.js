import { ApiError, clearSession, getSessionValue, requestJson } from './api.js';
import { TelemetryRenderer } from './telemetry.js';
import { ThingsBoardSocket } from './ws.js';

export const telemetryRenderer = new TelemetryRenderer();
const connectionLabel = document.querySelector('#connection-state');
const deviceHeader = document.querySelector('.topbar__device');
const telemetryLabel = document.querySelector('#telemetry-state');
const liveIndicator = document.querySelector('.live-indicator');
const streamIndicator = document.querySelector('#stream-indicator');
const ledSwitch = document.querySelector('#led-switch');
const ledStateLabel = document.querySelector('#led-state-label');
let commandPending = false;
let ledAttributeRevision = 0;
const ledError = document.querySelector('#led-error');
const logoutButton = document.querySelector('#logout-button');

function setLedState(state) {
  const isOn = state === true;
  ledSwitch.checked = isOn;
  ledSwitch.setAttribute('aria-checked', String(isOn));
  ledStateLabel.textContent = isOn ? 'ON' : 'OFF';
  ledStateLabel.dataset.state = isOn ? 'on' : 'off';
}

function applyAttributeMessage(message) {
  if (commandPending || message?.subscriptionId !== 2 || !message.data?.led_state) {
    return;
  }

  const latest = message.data.led_state;
  if (!Array.isArray(latest) || latest.length === 0 || !Array.isArray(latest[0])) {
    return;
  }

  const value = latest[0][1];
  if (value === 'true' || value === 'false') {
    ledAttributeRevision += 1;
    setLedState(value === 'true');
  }
}

function updateConnectionState(state) {
  const labels = {
    connecting: ['Connecting', 'Opening live stream'],
    connected: ['Connected', 'Live stream connected'],
    disconnected: ['Reconnecting', 'Reconnecting to live stream'],
    closed: ['Disconnected', 'Live stream closed'],
  };
  const [connectionText, streamText] = labels[state] ?? labels.disconnected;
  connectionLabel.textContent = connectionText;
  deviceHeader.dataset.state = state;
  streamIndicator.textContent = streamText.toUpperCase();
  if (state === 'connected' && telemetryLabel.textContent !== 'Live signal') {
    telemetryLabel.textContent = 'Waiting for signal';
    liveIndicator.dataset.state = 'waiting';
  } else if (state !== 'connected' && telemetryLabel.textContent !== 'Live signal') {
    telemetryLabel.textContent = connectionText;
    liveIndicator.dataset.state = state;
  } else if (state === 'disconnected' || state === 'closed') {
    liveIndicator.dataset.state = state;
  }
}
  function showLedError(message) {
    ledError.textContent = message;
    ledError.hidden = false;
  }

  function clearLedError() {
    ledError.textContent = '';
    ledError.hidden = true;
  }

  function ledCommandError(error) {
    if (error instanceof ApiError && (error.status === 504 || error.status === 408)) {
      return 'Device not responding.';
    }
    if (error instanceof ApiError && error.kind === 'timeout') {
      return 'Connection timed out.';
    }
    return 'Command failed. Please retry.';
  }

  async function sendLedCommand(event) {
    const requestedState = event.currentTarget.checked;
    const previousState = !requestedState;
    commandPending = true;
    ledSwitch.disabled = true;
    ledStateLabel.textContent = 'WAIT';
    clearLedError();

    try {
      const deviceId = getSessionValue('deviceId');
      const response = await requestJson(`/api/rpc/twoway/${encodeURIComponent(deviceId)}`, {
        method: 'POST',
        body: { method: 'setLed', params: requestedState, timeout: 5000 },
      });
      if (response?.success !== true || typeof response.led_state !== 'boolean') {
        throw new Error('The device did not confirm the LED state.');
      }
      setLedState(response.led_state);
    } catch (error) {
      setLedState(previousState);
      showLedError(ledCommandError(error));
    } finally {
      commandPending = false;
      ledSwitch.disabled = false;
    }
  }

export const thingsBoardSocket = new ThingsBoardSocket({
  onTelemetry: handleTelemetryMessage,
  onAttribute: applyAttributeMessage,
  onState: updateConnectionState,
  onError: (message) => {
    telemetryLabel.textContent = message;
    streamIndicator.textContent = 'STREAM UNAVAILABLE';
  },
});

  ledSwitch.addEventListener('change', sendLedCommand);
  logoutButton.addEventListener('click', () => {
    thingsBoardSocket.close();
    telemetryRenderer.destroy();
    clearSession();
    window.location.replace('login.html');
  });

  window.addEventListener('pagehide', () => {
    thingsBoardSocket.close();
    telemetryRenderer.destroy();
  }, { once: true });
async function initializeLedState() {
  const startingRevision = ledAttributeRevision;
  setLedState(false);
  try {
    const deviceId = getSessionValue('deviceId');
    const attributes = await requestJson(
      `/api/plugins/telemetry/DEVICE/${encodeURIComponent(deviceId)}/values/attributes/CLIENT_SCOPE`
    );
    if (!Array.isArray(attributes)) {
      return;
    }
    const ledAttribute = attributes.find((attribute) => attribute?.key === 'led_state');
    if (startingRevision === ledAttributeRevision && typeof ledAttribute?.value === 'boolean') {
      setLedState(ledAttribute.value);
    }
  } catch (error) {
    if (startingRevision === ledAttributeRevision) {
      setLedState(false);
    }
  }
}

const requiredSessionValues = ['token', 'refreshToken', 'customerId', 'deviceId', 'deviceAccessToken'];
if (requiredSessionValues.some((key) => !getSessionValue(key))) {
  window.location.replace('login.html');
} else {
  void initializeLedState();
  thingsBoardSocket.start();
}

export function handleTelemetryMessage(message) {
  return telemetryRenderer.processMessage(message);
}