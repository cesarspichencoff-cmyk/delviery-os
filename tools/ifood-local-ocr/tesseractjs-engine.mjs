export const IFOOD_TESSERACTJS_ENGINE_VERSION =
  "ifood-tesseractjs-layout-engine@0.1.0";

export const IFOOD_ORDER_DATE_LAYOUT_PROFILE = Object.freeze({
  profile_id: "ifood-review-order-date-2026-09-v1",
  left: 25,
  top: 55,
  width: 305,
  height: 80,
  scale: 4,
  threshold: 200,
});

async function defaultTesseractLoader() {
  return import("tesseract.js");
}

async function defaultSharpLoader() {
  return import("sharp");
}

function bytesToBuffer(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new TypeError("IFOOD_TESSERACT_IMAGE_BYTES_REQUIRED");
  }
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export async function createTesseractJsLayoutEngine({
  tesseractLoader = defaultTesseractLoader,
  sharpLoader = defaultSharpLoader,
  language = "eng",
  profile = IFOOD_ORDER_DATE_LAYOUT_PROFILE,
} = {}) {
  const [tesseractModule, sharpModule] = await Promise.all([
    tesseractLoader(),
    sharpLoader(),
  ]);

  const createWorker = tesseractModule?.createWorker;
  const psmSingleBlock = tesseractModule?.PSM?.SINGLE_BLOCK ?? "6";
  const sharp = sharpModule?.default ?? sharpModule;

  if (typeof createWorker !== "function") {
    throw new TypeError("IFOOD_TESSERACT_CREATE_WORKER_MISSING");
  }
  if (typeof sharp !== "function") {
    throw new TypeError("IFOOD_SHARP_FACTORY_MISSING");
  }

  const worker = await createWorker(language);
  if (
    !worker ||
    typeof worker.recognize !== "function" ||
    typeof worker.setParameters !== "function" ||
    typeof worker.terminate !== "function"
  ) {
    throw new TypeError("IFOOD_TESSERACT_WORKER_INVALID");
  }

  let terminated = false;

  return {
    id: `tesseract.js@7.0.0+sharp@0.35.4/${profile.profile_id}`,

    async recognize({ bytes, region }) {
      if (terminated) throw new Error("IFOOD_TESSERACT_ENGINE_TERMINATED");
      const input = bytesToBuffer(bytes);

      if (region === "FULL_PAGE") {
        await worker.setParameters({
          tessedit_pageseg_mode: psmSingleBlock,
          tessedit_char_whitelist: "",
        });
        const result = await worker.recognize(input);
        return String(result?.data?.text ?? "");
      }

      if (region === "ORDER_HEADER") {
        const processed = await sharp(input)
          .extract({
            left: profile.left,
            top: profile.top,
            width: profile.width,
            height: profile.height,
          })
          .resize({
            width: profile.width * profile.scale,
            height: profile.height * profile.scale,
            kernel: "lanczos3",
          })
          .grayscale()
          .threshold(profile.threshold)
          .png()
          .toBuffer();

        await worker.setParameters({
          tessedit_pageseg_mode: psmSingleBlock,
          tessedit_char_whitelist: "0123456789/",
        });
        const result = await worker.recognize(processed);
        return String(result?.data?.text ?? "");
      }

      throw new TypeError("IFOOD_TESSERACT_REGION_UNSUPPORTED");
    },

    async terminate() {
      if (terminated) return;
      terminated = true;
      await worker.terminate();
    },
  };
}
