## 2026-10-19 WebSocket Token Expiry

- **Question**: Should WebSocket reconnects reuse the current token until an HTTP 401, or refresh the token after a WebSocket disconnect?
- **Answer**: On any WebSocket disconnect, always attempt one silent token refresh before reconnecting; do not wait for an HTTP 401.
- **Impact**: `DemoApp/js` WebSocket reconnect and shared token-refresh logic.
