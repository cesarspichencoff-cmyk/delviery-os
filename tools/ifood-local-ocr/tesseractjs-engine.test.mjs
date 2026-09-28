import assert from "node:assert/strict";
import test from "node:test";
import {
  createTesseractJsLayoutEngine,
  IFOOD_ORDER_DATE_LAYOUT_PROFILE,
} from "./tesseractjs-engine.mjs";

function fakeDependencies() {
  const calls = [];
  const worker = {
    async setParameters(params) {
      calls.push({ type: "params", params });
    },
    async recognize(input) {
      calls.push({
        type: "recognize",
        input: Buffer.from(input).toString(),
      });
      return {
        data: {
          text: Buffer.from(input).toString() === "preprocessed-header"
            ? "29/08/2026"
            : "Pedido feito em\n4787 50/08/2026",
        },
      };
    },
    async terminate() {
      calls.push({ type: "terminate" });
    },
  };

  const sharpCalls = [];
  function sharp(input) {
    sharpCalls.push({ type: "input", input: Buffer.from(input).toString() });
    const chain = {
      extract(value) {
        sharpCalls.push({ type: "extract", value });
        return chain;
      },
      resize(value) {
        sharpCalls.push({ type: "resize", value });
        return chain;
      },
      grayscale() {
        sharpCalls.push({ type: "grayscale" });
        return chain;
      },
      threshold(value) {
        sharpCalls.push({ type: "threshold", value });
        return chain;
      },
      png() {
        sharpCalls.push({ type: "png" });
        return chain;
      },
      async toBuffer() {
        sharpCalls.push({ type: "toBuffer" });
        return Buffer.from("preprocessed-header");
      },
    };
    return chain;
  }

  return {
    calls,
    sharpCalls,
    tesseractLoader: async () => ({
      createWorker: async (language) => {
        calls.push({ type: "createWorker", language });
        return worker;
      },
      PSM: { SINGLE_BLOCK: "6" },
    }),
    sharpLoader: async () => ({ default: sharp }),
  };
}

test("full page OCR uses original image bytes without preprocessing", async () => {
  const deps = fakeDependencies();
  const engine = await createTesseractJsLayoutEngine(deps);
  const text = await engine.recognize({
    bytes: new TextEncoder().encode("original-image"),
    region: "FULL_PAGE",
  });

  assert.match(text, /4787/);
  assert.equal(deps.sharpCalls.length, 0);
  const recognition = deps.calls.find((call) => call.type === "recognize");
  assert.equal(recognition.input, "original-image");
});

test("order header applies the pinned benchmark preprocessing profile", async () => {
  const deps = fakeDependencies();
  const engine = await createTesseractJsLayoutEngine(deps);
  const text = await engine.recognize({
    bytes: new TextEncoder().encode("original-image"),
    region: "ORDER_HEADER",
  });

  assert.equal(text, "29/08/2026");
  assert.deepEqual(
    deps.sharpCalls.find((call) => call.type === "extract").value,
    {
      left: IFOOD_ORDER_DATE_LAYOUT_PROFILE.left,
      top: IFOOD_ORDER_DATE_LAYOUT_PROFILE.top,
      width: IFOOD_ORDER_DATE_LAYOUT_PROFILE.width,
      height: IFOOD_ORDER_DATE_LAYOUT_PROFILE.height,
    },
  );
  assert.deepEqual(
    deps.sharpCalls.find((call) => call.type === "resize").value,
    {
      width:
        IFOOD_ORDER_DATE_LAYOUT_PROFILE.width *
        IFOOD_ORDER_DATE_LAYOUT_PROFILE.scale,
      height:
        IFOOD_ORDER_DATE_LAYOUT_PROFILE.height *
        IFOOD_ORDER_DATE_LAYOUT_PROFILE.scale,
      kernel: "lanczos3",
    },
  );
  assert.equal(
    deps.sharpCalls.find((call) => call.type === "threshold").value,
    200,
  );

  const paramCalls = deps.calls.filter((call) => call.type === "params");
  assert.equal(
    paramCalls.at(-1).params.tessedit_char_whitelist,
    "0123456789/",
  );
});

test("engine rejects unknown regions and empty bytes", async () => {
  const deps = fakeDependencies();
  const engine = await createTesseractJsLayoutEngine(deps);

  await assert.rejects(
    () => engine.recognize({
      bytes: new Uint8Array([1]),
      region: "UNKNOWN",
    }),
    /IFOOD_TESSERACT_REGION_UNSUPPORTED/,
  );
  await assert.rejects(
    () => engine.recognize({
      bytes: new Uint8Array(),
      region: "FULL_PAGE",
    }),
    /IFOOD_TESSERACT_IMAGE_BYTES_REQUIRED/,
  );
});

test("terminate is idempotent and blocks later OCR", async () => {
  const deps = fakeDependencies();
  const engine = await createTesseractJsLayoutEngine(deps);

  await engine.terminate();
  await engine.terminate();

  assert.equal(
    deps.calls.filter((call) => call.type === "terminate").length,
    1,
  );
  await assert.rejects(
    () => engine.recognize({
      bytes: new Uint8Array([1]),
      region: "FULL_PAGE",
    }),
    /IFOOD_TESSERACT_ENGINE_TERMINATED/,
  );
});
