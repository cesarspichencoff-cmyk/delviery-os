/* Smoke test: app.js under minimal DOM — initial + all 20 scenarios produce areas. */
"use strict";
const fs = require("fs");
const path = require("path");

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attrs = {};
    this.style = {};
    this.className = "";
    this._innerHTML = "";
    this.textContent = "";
    this.value = "";
    this.id = "";
    this.onclick = null;
    this.onchange = null;
    this.classList = {
      _s: new Set(),
      add: (...a) => {
        a.forEach((x) => this.classList._s.add(x));
        this.classList._sync();
      },
      remove: (...a) => {
        a.forEach((x) => this.classList._s.delete(x));
        this.classList._sync();
      },
      toggle: (c, f) => {
        if (f === undefined) {
          if (this.classList._s.has(c)) this.classList._s.delete(c);
          else this.classList._s.add(c);
        } else if (f) this.classList._s.add(c);
        else this.classList._s.delete(c);
        this.classList._sync();
        return this.classList._s.has(c);
      },
      contains: (c) => this.classList._s.has(c),
      _sync: () => {
        this.className = [...this.classList._s].join(" ");
        this.attrs.class = this.className;
      }
    };
    this.dataset = new Proxy(
      {},
      {
        set: (t, k, v) => {
          t[k] = String(v);
          this.attrs["data-" + k] = String(v);
          return true;
        },
        get: (t, k) => t[k]
      }
    );
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
    if (k === "class") {
      this.className = v;
      this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean));
    }
    if (k.indexOf("data-") === 0) {
      this.dataset[k.slice(5)] = v;
    }
  }
  getAttribute(k) {
    return this.attrs[k] == null ? null : this.attrs[k];
  }
  addEventListener(type, fn) {
    this["on" + type] = fn;
  }
  querySelectorAll(sel) {
    if (sel && sel.indexOf("[data-ex]") >= 0) return [];
    return [];
  }
  querySelector(sel) {
    if (!sel) return null;
    if (sel.indexOf("area") >= 0 && this.innerHTML.indexOf("area") >= 0) {
      return { className: "area" };
    }
    return null;
  }
  closest() {
    return null;
  }
  appendChild(c) {
    this.children.push(c);
    return c;
  }
  get innerHTML() {
    return this._innerHTML;
  }
  set innerHTML(v) {
    this._innerHTML = String(v == null ? "" : v);
  }
}

const byId = {};
function makeId(id, tag) {
  const e = new El(tag || "div");
  e.id = id;
  byId[id] = e;
  return e;
}

const body = new El("body");
body.dataset.surface = "desktop";
body.dataset.mode = "calmo";

[
  ["scenario-select", "select"],
  ["btn-desktop", "button"],
  ["btn-mobile", "button"],
  ["campo", "section"],
  ["mobile-wrap", "section"],
  ["campo-sussurro", "div"],
  ["organismo", "div"],
  ["phone-conn", "span"],
  ["phone-body", "div"],
  ["modal-title", "h3"],
  ["modal-body", "div"],
  ["modal-primary", "button"],
  ["modal-cancel", "button"],
  ["modal-backdrop", "div"],
  ["toast", "div"]
].forEach(([id, tag]) => makeId(id, tag));
byId.campo.classList.add("is-active");

global.document = {
  getElementById: (id) => byId[id] || null,
  body,
  addEventListener: () => {},
  createElement: (t) => new El(t)
};
global.window = global;
global.console = console;

const code = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
try {
  // eslint-disable-next-line no-eval
  eval(code);
} catch (e) {
  console.error("RUNTIME_ERROR", e.message);
  process.exit(1);
}

function countAreas(html) {
  return (String(html).match(/class="area[\s"]/g) || []).length;
}

const org0 = byId.organismo.innerHTML;
const phone0 = byId["phone-body"].innerHTML;
const options = (byId["scenario-select"].innerHTML.match(/<option/g) || []).length;

console.log("initial_mode", body.dataset.mode);
console.log("initial_areas", countAreas(org0));
console.log("initial_mobile_len", phone0.length);
console.log("options", options);

if (options !== 20 || countAreas(org0) < 1 || org0.length < 100 || phone0.length < 40) {
  console.error("SMOKE_FAIL_INITIAL");
  console.error(org0.slice(0, 500));
  process.exit(1);
}

// Drive all scenarios via select.onchange
const ids = [...byId["scenario-select"].innerHTML.matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
let failed = [];
ids.forEach((id) => {
  byId["scenario-select"].value = id;
  if (typeof byId["scenario-select"].onchange === "function") {
    byId["scenario-select"].onchange();
  }
  const html = byId.organismo.innerHTML;
  const n = countAreas(html);
  const mobile = byId["phone-body"].innerHTML;
  if (n < 1 || html.length < 80 || mobile.length < 40) {
    failed.push(id + "(areas=" + n + ")");
  }
});

// Mobile view
if (typeof byId["btn-mobile"].onclick === "function") {
  byId["btn-mobile"].onclick();
}
const mobileActive = byId["mobile-wrap"].classList.contains("is-active");
const desktopHidden = !byId.campo.classList.contains("is-active");

console.log("scenarios_ok", ids.length - failed.length + "/" + ids.length);
console.log("mobile_toggle", mobileActive && desktopHidden);
if (failed.length) {
  console.error("SMOKE_FAIL_SCENARIOS", failed.join(", "));
  process.exit(1);
}
if (!(mobileActive && desktopHidden)) {
  console.error("SMOKE_FAIL_MOBILE_TOGGLE");
  process.exit(1);
}
console.log("SMOKE_OK");
