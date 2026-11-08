/* Syntax probe executed ONLY as an ES module. WebView engines without
 * optional chaining / nullish coalescing cannot parse this file, so the
 * ES5 bootstrap keeps operational controls hidden. No I/O, data or eval. */
const syntaxSupported = ({ a: 1 })?.a === 1 && (null ?? 7) === 7;
if (syntaxSupported && typeof window.__entregasRiderCompatibilityPassed === "function") {
  window.__entregasRiderCompatibilityPassed();
}
