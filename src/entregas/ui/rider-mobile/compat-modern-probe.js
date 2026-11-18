/* Syntax probe executed ONLY as an ES module. WebView engines without
 * optional chaining / nullish coalescing cannot parse this file, so the
 * ES5 bootstrap keeps operational controls hidden. No I/O, data or eval. */
const syntaxSupported = ({ a: 1 })?.a === 1 && (null ?? 7) === 7;
// The Android app exposes a raw Java object ONLY as a guarded transport.
// If document-start injection is unavailable there is no privileged public
// facade. Fail closed instead of treating the installed APK as a web browser.
const nativeTransport = !!window.EntregasNativeRaw;
const safeFacade = !!window.EntregasNative
  && typeof window.EntregasNative.version === "function"
  && window.EntregasNative.version() === "android-bridge@1.0.0";
const authorizedStartup = !nativeTransport || safeFacade;
if (syntaxSupported && authorizedStartup &&
    typeof window.__entregasRiderCompatibilityPassed === "function") {
  window.__entregasRiderCompatibilityPassed();
}
