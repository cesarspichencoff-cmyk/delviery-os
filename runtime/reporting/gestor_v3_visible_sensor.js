"use strict";
/*
 * Delivery OS — Gestor V3 visible facts review, read-only, never production-authoritative.
 * Configurable selectors MUST first be qualified on an authorised isolated session.
 * No clicks, focus/scroll changes, fetch, cookies, credentials, storage or order actions.
 */
(function (host, make) {
  const api = make();
  if (typeof module === "object" && module.exports) module.exports = api;
  else Object.defineProperty(host, "DeliveryGestorV3Review", { value: api, configurable: false });
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SCHEMA = "deliveryos.gestor-visible-facts-review.v3";
  const STATUS = Object.freeze({
    "Novo": "NEW_VISIBLE", "Aceito": "ACCEPTED_VISIBLE",
    "Em preparo": "PREPARING_HEADER_VISIBLE", "Pronto": "READY_HEADER_VISIBLE",
    "Despachado": "DISPATCHED_HEADER_VISIBLE", "Cancelado": "CANCELLED_HEADER_VISIBLE"
  });
  const SECRET = /(?:\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:cliente|telefone|endere[cç]o|cpf|whatsapp|email|e-mail)\b|\b(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[- ]?\d{4}\b)/i;
  const NAME_RE = /^(?!\s*$)[^\u0000-\u001f]{1,100}$/u;
  const ORDER_RE = /^#?[0-9]{3,8}$/;
  const q = (el, selector) => Array.from(el.querySelectorAll(selector));
  function visible(el) {
    if (!el || el.isConnected === false || !el.getClientRects || el.getClientRects().length === 0) return false;
    for (let p = el, n = 0; p && n < 35; p = p.parentElement, n++) {
      if (p.hidden || p.inert || p.getAttribute?.("aria-hidden") === "true") return false;
      const st = p.ownerDocument?.defaultView?.getComputedStyle?.(p);
      if (st && (st.display === "none" || st.visibility !== "visible" || Number(st.opacity) === 0)) return false;
    }
    return true;
  }
  function text(el, max) {
    if (!visible(el)) return null;
    const t = (typeof el.innerText === "string" ? el.innerText : el.textContent);
    if (typeof t !== "string") return null;
    const v = t.replace(/\s+/g, " ").trim();
    return v.length && v.length <= max && !SECRET.test(v) && NAME_RE.test(v) ? v : null;
  }
  function single(row, selector, max) {
    const els = q(row, selector);
    return els.length === 1 ? text(els[0], max) : null;
  }
  function quantity(s) {
    if (!s || !/^(?:[xX]\s*)?[1-9][0-9]{0,2}(?:\s*[xX])?$/.test(s)) return null;
    const n = Number(s.replace(/[^0-9]/g, ""));
    return n >= 1 && n <= 200 ? n : null;
  }
  const fail = (state, count = 0) => Object.freeze({
    schema: SCHEMA, state, readOnly: true, actionsExecuted: 0,
    merchantVerified: false, coverageVerified: false, ordersPublishable: 0,
    coverage: "UNKNOWN", visibleCards: count, orders: [], detail: null
  });
  function selectorConfig(c) {
    if (!c || typeof c !== "object" || !c.selectors || typeof c.selectors !== "object") return false;
    if (c.layout !== undefined && c.layout !== "FLAT" && c.layout !== "GROUPED") return false;
    const keys = c.layout === "GROUPED"
      ? ["root", "card", "detail", "detailOrder", "detailOrderReference", "item", "itemName", "itemQuantity", "option"]
      : ["root", "card", "reference", "status", "detail", "detailReference", "item", "itemName", "itemQuantity", "option"];
    for (const key of keys) {
      const s = c.selectors[key];
      if (typeof s !== "string" || !s.length || s.length > 110 || /[\u0000-\u001f]/.test(s)) return false;
    }
    return true;
  }
  // A Gestor group card is NOT an order. Read only the individually numbered
  // order blocks inside an already open group detail; never click open a group.
  function groupedReview(doc, config, cards) {
    let opened;
    try { opened = q(doc, config.selectors.detail).filter(visible); }
    catch { return fail("HOLD_SELECTOR", cards.length); }
    if (opened.length > 1) return fail("HOLD_MULTIPLE_DETAILS", cards.length);
    if (!opened.length) return Object.freeze({
      ...fail("HOLD_GROUP_DETAIL_NOT_OPEN", cards.length),
      groupCount: cards.length, orderCountScope: "UNKNOWN"
    });
    const detail = opened[0];
    if (String(detail.tagName).toLowerCase() === "dialog" && !detail.hasAttribute("open"))
      return fail("HOLD_CLOSED_DIALOG", cards.length);
    try {
      const blocks = q(detail, config.selectors.detailOrder);
      if (!blocks.length || blocks.length > 100 || blocks.some(x => !visible(x)))
        return fail("HOLD_GROUP_DETAIL_INCOMPLETE", cards.length);
      // Every item row in this detail must belong to exactly one order.
      if (blocks.some((b, i) => blocks.some((other, j) => i !== j && b.contains(other))))
        return fail("HOLD_OVERLAPPING_ORDER_SCOPE", cards.length);
      const detailLines = q(detail, config.selectors.item);
      if (!detailLines.length || detailLines.length > 1000 ||
          detailLines.some(line => !visible(line) ||
            blocks.filter(block => block.contains(line)).length !== 1))
        return fail("HOLD_ITEM_SCOPE_AMBIGUOUS", cards.length);
      const seen = new Set(), orders = [];
      for (const block of blocks) {
        const ref = single(block, config.selectors.detailOrderReference, 20);
        if (!ref || !ORDER_RE.test(ref) || seen.has(ref))
          return fail("HOLD_AMBIGUOUS_ORDER", cards.length);
        seen.add(ref);
        const lines = q(block, config.selectors.item);
        if (!lines.length || lines.length > 70 || lines.some(x => !visible(x)))
          return fail("HOLD_DETAIL_INCOMPLETE", cards.length);
        const items = [];
        for (const line of lines) {
          const name = single(line, config.selectors.itemName, 100);
          const qty = quantity(single(line, config.selectors.itemQuantity, 12));
          if (!name || qty === null) return fail("HOLD_ITEM_INVALID", cards.length);
          const opts = q(line, config.selectors.option);
          if (opts.length > 25 || opts.some(x => !visible(x)))
            return fail("HOLD_OPTION_INCOMPLETE", cards.length);
          const options = opts.map(x => text(x, 110));
          if (options.some(x => x === null)) return fail("HOLD_OPTION_SENSITIVE", cards.length);
          items.push({ name, quantity: qty, options });
        }
        orders.push({ reference_candidate: ref, items });
      }
      // Cards = visible groups; order count only covers ONE open group detail.
      // No inferred status, merchant, group-to-order linkage or full coverage.
      return Object.freeze({
        schema: SCHEMA, state: "REVIEW_ONLY", readOnly: true, actionsExecuted: 0,
        merchantVerified: false, coverageVerified: false, ordersPublishable: 0,
        coverage: "OPEN_GROUP_DETAIL_ONLY", visibleCards: cards.length,
        groupCount: cards.length, orderCountScope: "OPEN_DETAIL_ONLY",
        groupLinkVerified: false,
        orders: orders.map(({reference_candidate}) => ({ reference_candidate, header_status: null })),
        detail: { state: "VISIBLE_GROUP_DETAIL_CANDIDATES", orders }
      });
    } catch { return fail("HOLD_SELECTOR", cards.length); }
  }
  function scan(doc, config) {
    if (!doc?.querySelectorAll || !selectorConfig(config)) return fail("HOLD_CONFIG");
    const hostname = doc.location?.hostname || "";
    if (!(config.mode === "FIXTURE" && ["", "127.0.0.1", "localhost"].includes(hostname)) &&
        !(config.mode === "FIELD_REVIEW" && hostname === "gestordepedidos.ifood.com.br")) return fail("HOLD_SCOPE");
    let root;
    try {
      const roots = q(doc, config.selectors.root);
      if (roots.length !== 1 || !visible(roots[0])) return fail("HOLD_ROOT");
      root = roots[0];
    } catch { return fail("HOLD_SELECTOR"); }
    let cards;
    try { cards = q(root, config.selectors.card); }
    catch { return fail("HOLD_SELECTOR"); }
    if (cards.length > 200) return fail("HOLD_CARD_LIMIT", cards.length);
    if (!cards.length) return fail("HOLD_EMPTY_NOT_ZERO");
    if (cards.some(x => !visible(x))) return fail("HOLD_HIDDEN_CARD", cards.length);
    if (config.layout === "GROUPED") return groupedReview(doc, config, cards);
    const orders = [], seen = new Set();
    try {
      for (const card of cards) {
        const ref = single(card, config.selectors.reference, 20);
        const status = single(card, config.selectors.status, 42);
        if (!ref || !ORDER_RE.test(ref) || !status || !Object.hasOwn(STATUS, status) || seen.has(ref))
          return fail("HOLD_AMBIGUOUS_ORDER", cards.length);
        seen.add(ref);
        orders.push({ reference_candidate: ref, header_status: STATUS[status] });
      }
      let detail = { state: "NOT_OPEN", for_candidate: null, items: [] };
      const opened = q(doc, config.selectors.detail).filter(visible);
      if (opened.length > 1) return fail("HOLD_MULTIPLE_DETAILS", cards.length);
      if (opened.length === 1) {
        const d = opened[0];
        if (String(d.tagName).toLowerCase() === "dialog" && !d.hasAttribute("open"))
          return fail("HOLD_CLOSED_DIALOG", cards.length);
        const ref = single(d, config.selectors.detailReference, 20);
        if (!ref || !seen.has(ref)) return fail("HOLD_DETAIL_UNBOUND", cards.length);
        const lines = q(d, config.selectors.item);
        if (!lines.length || lines.length > 70 || lines.some(x => !visible(x)))
          return fail("HOLD_DETAIL_INCOMPLETE", cards.length);
        const items = [];
        for (const line of lines) {
          const name = single(line, config.selectors.itemName, 100);
          const qty = quantity(single(line, config.selectors.itemQuantity, 12));
          if (!name || qty === null) return fail("HOLD_ITEM_INVALID", cards.length);
          const opts = q(line, config.selectors.option);
          if (opts.length > 25 || opts.some(x => !visible(x))) return fail("HOLD_OPTION_INCOMPLETE", cards.length);
          const options = opts.map(x => text(x, 110));
          if (options.some(x => x === null)) return fail("HOLD_OPTION_SENSITIVE", cards.length);
          items.push({ name, quantity: qty, options });
        }
        detail = { state: "VISIBLE_DETAIL_CANDIDATE", for_candidate: ref, items };
      }
      // "VISIBLE_ONLY" is a hard limit: no proof of total orders, merchant,
      // authorised station, physical prep, packaging or server freshness.
      return Object.freeze({ schema: SCHEMA, state: "REVIEW_ONLY",
        readOnly: true, actionsExecuted: 0, merchantVerified: false,
        coverageVerified: false, ordersPublishable: 0, coverage: "VISIBLE_ONLY",
        visibleCards: cards.length, orders, detail });
    } catch { return fail("HOLD_SELECTOR", cards.length); }
  }
  function watch(doc, config, onChange, ttlMs = 60000) {
    if (typeof onChange !== "function" || !Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > 120000)
      throw Error("INVALID_WATCH_ARGUMENT");
    let stopped = false, pending = false, last = null, latestAt = 0;
    let changedAt = 0, previous = "";
    // Local DOM observation is NOT an upstream iFood heartbeat.
    // Repeated unchanged scans must not make the visible content seem newer.
    const receipt = (snapshot) => Object.freeze({
      ...snapshot, observed_at: new Date(latestAt).toISOString(),
      visibleContentChangedAt: changedAt ? new Date(changedAt).toISOString() : null,
      freshnessBasis: "LOCAL_DOM_SCAN_ONLY",
      sourceFreshnessVerified: false, sourceUpdatedAt: null,
    });
    function reconcile() {
      if (stopped) return null;
      const snapshot = scan(doc, config);
      latestAt = Date.now();
      last = snapshot;
      const signature = JSON.stringify(snapshot);
      if (signature !== previous) {
        previous = signature;
        changedAt = latestAt;
        onChange(receipt(snapshot));
      }
      return snapshot;
    }
    const observer = new MutationObserver(() => {
      if (stopped || pending) return;
      pending = true;
      queueMicrotask(() => { pending = false; reconcile(); });
    });
    // Attribute-only UI changes (hidden, open, class, aria-* and data-*) can alter
    // visibility, order identity or the selected detail without changing text.
    observer.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
    reconcile();
    return Object.freeze({
      reconcile,
      current(now = Date.now()) {
        if (!last || now < latestAt - 2000 || now - latestAt > ttlMs)
          return fail("HOLD_STALE");
        return receipt(last);
      },
      stop() { stopped = true; observer.disconnect(); },
    });
  }

  // React's mounted order prop is a PRIVATE, fragile observation surface.
  // This is deliberately review-only: NO DOM action, navigation, fetch,
  // persistent storage, home feed, customer payload or provider API call.
  function scanMountedOrderProps(doc, cfg) {
    const out=(reason,n=0)=>Object.freeze({
      schema:"deliveryos.gestor-mounted-order-review.v1",state:"HOLD",reason,
      visibleCards:n,candidateOrders:0,candidateLines:0,candidateUnits:0,
      candidateDirectNotes:0,candidateOptions:0,candidateCodes:0,
      coverage:"UNKNOWN",readOnly:true,actionsExecuted:0,
      merchantVerified:false,identityIndependentlyVerified:false,
      statusSemanticsProven:false,sourceFreshnessVerified:false,
      detailCompletenessProven:false,homePublishAuthorized:false,
      ordersPublishable:0,printAuthorized:false,
      rawOrderIdsExported:0,rawProductNamesExported:0,
      rawNoteTextExported:0,customerDataExported:false
    });
    try {
      if (!doc?.querySelectorAll || !cfg ||
          !["FIXTURE","FIELD_REVIEW"].includes(cfg.mode))
        return out("REVIEW_CONTEXT_INVALID");
      const hostname=String(doc.location?.hostname??"");
      if (cfg.mode==="FIELD_REVIEW"
          ? hostname!=="gestordepedidos.ifood.com.br"
          : !["","localhost","127.0.0.1"].includes(hostname))
        return out("GESTOR_ORIGIN_NOT_QUALIFIED");
      // This selector was directly observed on the dedicated Gestor session.
      const cards=[...doc.querySelectorAll('[data-testid="card"]')];
      if (!cards.length || cards.length>200)
        return out("MOUNTED_CARD_COVERAGE_UNKNOWN",cards.length);
      const ids=new Set(),shorts=new Set(),merchants=new Set();
      const candidates=[];let lines=0,units=0,notes=0,options=0,codes=0;
      for (const card of cards) {
        if (!visible(card))return out("CARD_NOT_VISIBLE",cards.length);
        const props=Object.keys(card).filter(k=>/^__reactFiber\$/.test(k));
        if (props.length!==1)
          return out("REACT_VERSION_OR_CARD_BINDING_UNKNOWN",cards.length);
        let node=card[props[0]],order=null;
        for(let depth=0;node&&depth<16;depth++,node=node.return) {
          if (node.memoizedProps?.order) {
            if (order)return out("MULTIPLE_ORDER_BINDINGS",cards.length);
            order=node.memoizedProps.order;
          }
        }
        if (!order || typeof order.id!=="string" ||
            order.id.length<8 || order.id.length>128 ||
            typeof order.displayId!=="string" ||
            !/^\d{4}$/.test(order.displayId) ||
            !String(card.innerText??"").includes(order.displayId))
          return out("CARD_ORDER_IDENTITY_UNPROVEN",cards.length);
        if (ids.has(order.id)||shorts.has(order.displayId))
          return out("DUPLICATE_MOUNTED_ORDER",cards.length);
        if (order.isTest===true)return out("TEST_ORDER_NOT_OPERATIONAL",cards.length);
        ids.add(order.id);shorts.add(order.displayId);
        if (typeof order.merchant?.id!=="string" ||
            !order.merchant.id.trim() || order.merchant.id.length>128)
          return out("MERCHANT_PROP_UNREADABLE",cards.length);
        merchants.add(order.merchant.id);
        if (!Array.isArray(order.items)||!order.items.length||
            order.items.length>100)return out("ITEM_LIST_UNREADABLE",cards.length);
        const items=[];
        for (const item of order.items) {
          if (!item || typeof item.name!=="string" ||
              !NAME_RE.test(item.name)||SECRET.test(item.name)||
              !Number.isSafeInteger(item.quantity) ||
              item.quantity<1||item.quantity>200)
            return out("ITEM_CONTENT_UNSAFE",cards.length);
          const note=item.observations??"";
          if (typeof note!=="string" || note.length>1200 ||
              /[\x00-\x1f\x7f]/.test(note)||SECRET.test(note))
            return out("NOTE_CONTENT_UNSAFE",cards.length);
          const opts=item.options??[];
          if (!Array.isArray(opts)||opts.length>30||item.changedFor ||
              opts.some(o=>o?.changedFor ||
                (Array.isArray(o?.customizations)&&o.customizations.length)))
            return out("MODIFIER_STRUCTURE_UNVERIFIED",cards.length);
          const selected=[];
          for (const opt of opts) {
            if (!opt || typeof opt.name!=="string" ||
                !NAME_RE.test(opt.name)||SECRET.test(opt.name)||
                !Number.isSafeInteger(opt.quantity)||
                opt.quantity<1||opt.quantity>200||
                (opt.observations&&opt.observations!==""))
              return out("OPTION_STRUCTURE_UNVERIFIED",cards.length);
            selected.push(Object.freeze({name:opt.name,quantity:opt.quantity}));
            options++;
          }
          const productCode=item.externalCode??null;
          if (productCode!==null && (typeof productCode!=="string"||
              !/^(?:\d{10}|\d\.\d{2}\.\d{2}\.\d{3}\.\d{2})$/.test(productCode)))
            return out("EXTERNAL_PRODUCT_CODE_INVALID",cards.length);
          if(productCode)codes++;
          if(note.trim())notes++;
          lines++;units+=item.quantity;
          items.push(Object.freeze({name:item.name,quantity:item.quantity,
            observations:note,options:Object.freeze(selected),
            externalCode:productCode}));
        }
        // Keep only the opaque provider HEADER status token, never interpret
        // it as physical cooking, station ready, conference or dispatch.
        const statusRaw=order.currentStatus??null;
        const statusClaim=typeof statusRaw==="string"?statusRaw:
          (statusRaw&&typeof statusRaw==="object"&&
          typeof statusRaw.code==="string"?statusRaw.code:null);
        if(statusRaw!==null&&(statusClaim===null||
          !/^[A-Za-z0-9_-]{1,64}$/.test(statusClaim)))
          return out("HEADER_STATUS_STRUCTURE_UNVERIFIED",cards.length);
        candidates.push(Object.freeze({
          id:order.id,shortCode:order.displayId,
          statusClaim,merchantId:order.merchant.id,
          placedAt:typeof order.createdAt==="string"&&
            Number.isFinite(Date.parse(order.createdAt))?order.createdAt:null,
          items:Object.freeze(items)
        }));
      }
      if(merchants.size!==1)return out("MULTIPLE_MERCHANTS_IN_VIEW",cards.length);
      const result={
        schema:"deliveryos.gestor-mounted-order-review.v1",
        state:"PRIVATE_REVIEW_ONLY",source:"MOUNTED_GESTOR_CARD_PROPS",
        visibleCards:cards.length,candidateOrders:candidates.length,
        candidateLines:lines,candidateUnits:units,
        candidateDirectNotes:notes,candidateOptions:options,
        candidateCodes:codes,coverage:"MOUNTED_CARDS_ONLY",
        readOnly:true,actionsExecuted:0,merchantVerified:false,
        identityIndependentlyVerified:false,statusSemanticsProven:false,
        sourceFreshnessVerified:false,detailCompletenessProven:false,
        homePublishAuthorized:false,ordersPublishable:0,printAuthorized:false,
        rawOrderIdsExported:0,rawProductNamesExported:0,
        rawNoteTextExported:0,customerDataExported:false
      };
      // The review result cannot leak IDs/notes through ordinary JSON/logs.
      // Explicitly accessing this field is permitted only in LOCAL PRIVATE
      // analysis and is not permission to persist, publish or transmit it.
      Object.defineProperty(result,"privateCandidates",{value:Object.freeze(candidates),
        enumerable:false,configurable:false,writable:false});
      return Object.freeze(result);
    }catch{return out("MOUNTED_ORDER_INSPECTION_FAILED");}
  }

  return Object.freeze({ SCHEMA, scan, watch, scanMountedOrderProps });
});
