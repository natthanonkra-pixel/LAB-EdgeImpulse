import { AccelerationChart } from './chart.js';

const TELEMETRY_KEYS = {
  mpu_temp: { min: -40, max: 85, element: 'value-mpu-temp' },
  acc_x: { min: -16, max: 16, element: 'value-acc-x' },
  acc_y: { min: -16, max: 16, element: 'value-acc-y' },
  acc_z: { min: -16, max: 16, element: 'value-acc-z' },
  gyro_x: { min: -2000, max: 2000, element: 'value-gyro-x' },
  gyro_y: { min: -2000, max: 2000, element: 'value-gyro-y' },
  gyro_z: { min: -2000, max: 2000, element: 'value-gyro-z' },
  angle_x: { min: -180, max: 180, element: 'value-angle-x' },
  angle_y: { min: -180, max: 180, element: 'value-angle-y' },
  angle_z: { min: -180, max: 180, element: 'value-angle-z' },
};

const ACCELERATION_KEYS = ['acc_x', 'acc_y', 'acc_z'];
const DECIMAL_VALUE_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function parseSample(sample, range) {
  if (!Array.isArray(sample) || sample.length < 2) {
    return null;
  }

  const [timestamp, rawValue] = sample;
  const numericText = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    numericText === '' ||
    !DECIMAL_VALUE_PATTERN.test(numericText)
  ) {
    return null;
  }

  const value = Number(numericText);
  if (!Number.isFinite(value) || value < range.min || value > range.max) {
    return null;
  }

  return { timestamp, value, rawValue };
}

export class TelemetryRenderer {
  constructor(documentRef = document) {
    this.document = documentRef;
    this.lastTimestamps = new Map();
    this.chart = new AccelerationChart(documentRef.querySelector('#acceleration-chart'));
    this.chartEmpty = documentRef.querySelector('#chart-empty');
    this.telemetryState = documentRef.querySelector('#telemetry-state');
    this.liveIndicator = documentRef.querySelector('.live-indicator');
    this.lastUpdate = documentRef.querySelector('#last-update');
    this.tiltDot = documentRef.querySelector('#tilt-dot');
    this.tiltX = documentRef.querySelector('#tilt-x-value');
    this.tiltY = documentRef.querySelector('#tilt-y-value');
  }

  processMessage(message) {
    if (
      !message ||
      message.subscriptionId !== 1 ||
      message.errorCode !== 0 ||
      !message.data ||
      typeof message.data !== 'object' ||
      Array.isArray(message.data)
    ) {
      return false;
    }

    const chartSamples = new Map();
    let newestAcceptedTimestamp = null;
    let acceptedAny = false;

    for (const [key, samples] of Object.entries(message.data)) {
      const definition = TELEMETRY_KEYS[key];
      if (!definition || !Array.isArray(samples)) {
        continue;
      }

      for (const sample of samples) {
        const parsed = parseSample(sample, definition);
        if (!parsed) {
          continue;
        }

        const previousTimestamp = this.lastTimestamps.get(key) ?? -1;
        if (parsed.timestamp < previousTimestamp) {
          continue;
        }

        this.lastTimestamps.set(key, parsed.timestamp);
        this.document.getElementById(definition.element).textContent = parsed.rawValue;
        acceptedAny = true;
        newestAcceptedTimestamp = Math.max(newestAcceptedTimestamp ?? parsed.timestamp, parsed.timestamp);

        if (ACCELERATION_KEYS.includes(key)) {
          let values = chartSamples.get(parsed.timestamp);
          if (!values) {
            values = {};
            chartSamples.set(parsed.timestamp, values);
          }
          values[key] = parsed.value;
        }
      }
    }

    for (const [timestamp, values] of chartSamples) {
      this.chart.addSample(timestamp, values);
    }

    this.updateTilt();
    if (acceptedAny) {
      this.chartEmpty.hidden = true;
      this.telemetryState.textContent = 'Live signal';
      this.liveIndicator.dataset.state = 'live';
      this.lastUpdate.textContent = `Updated ${new Date(newestAcceptedTimestamp).toLocaleTimeString()}`;
    }

    return acceptedAny;
  }

  updateTilt() {
    const x = this.latestValue('acc_x');
    const y = this.latestValue('acc_y');
    if (!x || !y) {
      return;
    }

    const xPercent = Math.min(100, Math.max(0, ((x.value + 1) / 2) * 100));
    const yPercent = Math.min(100, Math.max(0, ((y.value + 1) / 2) * 100));
    this.tiltDot.style.left = `${xPercent}%`;
    this.tiltDot.style.top = `${100 - yPercent}%`;
    this.tiltX.textContent = x.rawValue;
    this.tiltY.textContent = y.rawValue;
  }

  latestValue(key) {
    const definition = TELEMETRY_KEYS[key];
    const rawValue = this.document.getElementById(definition.element).textContent;
    const value = Number(rawValue);
    if (rawValue === '--' || !Number.isFinite(value)) {
      return null;
    }
    return { value, rawValue };
  }

  destroy() {
    this.chart.destroy();
  }
}

export const TELEMETRY_KEY_LIST = Object.keys(TELEMETRY_KEYS).join(',');
export { TELEMETRY_KEYS };