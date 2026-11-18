/* pilot-session-boot
 * Classic (non-module), same-origin script. Runs during <head> parsing before
 * rider modules; never inline, so the rider CSP can block injected scripts.
 * This file does not issue commands, read a customer order or access the
 * Android native bridge. It preserves the pilot's existing login contract.
 */
const TOKEN_KEY = "entregas_pilot_token";
const origFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const t = localStorage.getItem(TOKEN_KEY);
  const headers = new Headers(init.headers || {});
  if (t && !headers.has("Authorization")) headers.set("Authorization", "Bearer " + t);
  return origFetch(input, { ...init, headers });
};
window.entregasPilotLogin = async (token) => {
  const r = await origFetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const data = await r.json();
  if (data.ok) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  return data;
};
