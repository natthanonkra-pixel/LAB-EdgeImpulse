import { getSessionValue, refreshSession } from './api.js';
import { TELEMETRY_KEY_LIST } from './telemetry.js';

const WS_BASE_URL = 'wss://thingsboard.cloud/api/ws/plugins/telemetry?token=';
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const CONNECT_TIMEOUT_MS = 10_000;

export class ThingsBoardSocket {
  constructor({ onTelemetry, onAttribute, onState, onError } = {}) {
    this.onTelemetry = onTelemetry ?? (() => {});
    this.onAttribute = onAttribute ?? (() => {});
    this.onState = onState ?? (() => {});
    this.onError = onError ?? (() => {});
    this.socket = null;
    this.reconnectTimer = null;
    this.connectTimer = null;
    this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    this.closedByUser = false;
    this.generation = 0;
  }

  start() {
    this.closedByUser = false;
    this.connect();
  }

  connect() {
    if (this.closedByUser) {
      return;
    }

    const token = getSessionValue('token');
    if (!token) {
      this.onError('Your session has expired. Please sign in again.');
      return;
    }

    this.clearTimers();
    const generation = ++this.generation;
    this.onState('connecting');

    let socket;
    try {
      socket = new WebSocket(`${WS_BASE_URL}${encodeURIComponent(token)}`);
    } catch (error) {
      this.handleDisconnect(generation);
      return;
    }

    this.socket = socket;
    const handleOpen = () => {
      if (!this.isCurrent(socket, generation)) {
        socket.close();
        return;
      }
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
      this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      this.onState('connected');
      socket.send(JSON.stringify({
        tsSubCmds: [{
          entityType: 'DEVICE',
          entityId: getSessionValue('deviceId'),
          scope: 'LATEST_TELEMETRY',
          cmdId: 1,
          keys: TELEMETRY_KEY_LIST,
        }],
        historyCmds: [],
        attrSubCmds: [{
          entityType: 'DEVICE',
          entityId: getSessionValue('deviceId'),
          scope: 'CLIENT_SCOPE',
          keys: 'led_state',
          cmdId: 2,
        }],
      }));
    };

    const handleMessage = (event) => {
      if (!this.isCurrent(socket, generation) || typeof event.data !== 'string') {
        return;
      }
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        this.onError('A sensor update could not be read.');
        return;
      }

      if (!message || message.errorCode !== 0) {
        return;
      }
      if (message.subscriptionId === 1) {
        this.onTelemetry(message);
      } else if (message.subscriptionId === 2) {
        this.onAttribute(message);
      }
    };

    const handleFailure = () => {
      if (this.isCurrent(socket, generation)) {
        socket.close();
      }
    };

    const handleClose = () => {
      socket.removeEventListener('open', handleOpen);
      socket.removeEventListener('message', handleMessage);
      socket.removeEventListener('error', handleFailure);
      socket.removeEventListener('close', handleClose);
      if (this.isCurrent(socket, generation)) {
        this.socket = null;
        this.handleDisconnect(generation);
      }
    };

    socket.addEventListener('open', handleOpen);
    socket.addEventListener('message', handleMessage);
    socket.addEventListener('error', handleFailure);
    socket.addEventListener('close', handleClose);

    this.connectTimer = setTimeout(() => {
      if (this.isCurrent(socket, generation) && socket.readyState !== WebSocket.OPEN) {
        socket.close();
      }
    }, CONNECT_TIMEOUT_MS);
  }

  isCurrent(socket, generation) {
    return !this.closedByUser && this.socket === socket && this.generation === generation;
  }

  async handleDisconnect(generation) {
    if (this.closedByUser || generation !== this.generation) {
      return;
    }

    this.clearTimers();
    this.onState('disconnected');
    try {
      await refreshSession();
    } catch (error) {
      this.onError('Your session could not be renewed. Please sign in again.');
      return;
    }

    if (this.closedByUser || generation !== this.generation) {
      return;
    }

    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  clearTimers() {
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.connectTimer);
    this.reconnectTimer = null;
    this.connectTimer = null;
  }

  close() {
    this.closedByUser = true;
    this.generation += 1;
    this.clearTimers();
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      socket.close();
    }
    this.onState('closed');
  }
}
