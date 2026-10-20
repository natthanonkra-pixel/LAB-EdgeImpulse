## 2026-10-19 Frontend Module Boundaries

- **Context**: The app has authentication, shared authenticated REST calls, telemetry streaming, canvas rendering, and device RPC behavior that need separate acceptance checks.
- **Decision**: Use native ES modules split into `api.js`, `auth.js`, `dashboard.js`, `telemetry.js`, `chart.js`, and `ws.js`; keep shared tokens in `sessionStorage`, and keep page-specific styles in `login.css` and `dashboard.css` importing `common.css`.
- **Alternatives**: Combine all behavior into one script; use a framework or external client/chart library. Rejected because native modules and browser APIs are the required stack and smaller modules keep task checks focused.

## 2026-10-19 Initial Device Selection

- **Context**: Login retrieves assigned devices and the dashboard supports only one device.
- **Decision**: Use the first device returned by the customer-device API, as specified by the requirement and API contract.
- **Alternatives**: Add a picker or filter by device name. Rejected because multi-device selection is out of scope and no name filter is required.

## 2026-10-19 Telemetry Validation and Plotting

- **Context**: WebSocket telemetry is untrusted, sparse, string-valued, and may arrive with malformed, stale, or out-of-range samples.
- **Decision**: Parse only decimal numeric strings with safe integer timestamps, validate against each sensor's contract range, preserve the last known-good tile on invalid data, ignore older samples, and plot acceleration by server timestamp within an eight-second window.
- **Alternatives**: Coerce any JavaScript numeric representation or replace invalid values with zero. Rejected because either choice can silently distort the readings and waveform.
