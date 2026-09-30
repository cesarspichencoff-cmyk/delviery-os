# César OS — encrypted ChatGPT bridge v1

This branch is an isolated transport surface. It must never be merged into DeliveryOS canonical branches.

## Exact branch

`cesarspichencoff-cmyk/delviery-os@cesar-os-cipher-v1`

DeliveryOS remains TATÁ Edge. This branch is transport only; it is not product truth and must not become the personal brain.

## Direct capture: ChatGPT -> César OS

Only explicit César-direct capture may be emitted:
- WATCH
- CHATGPT
- USER_DIRECT
- VOICE

Source observations, system inference and third-party requests must never be converted into a César commitment here.

### Capture transport

1. Read `bridge/public-key.json`.
2. Build plaintext JSON:
   `{"schema":"cesar-os-direct-capture-v1","synthetic":false,"capture":{...}}`.
3. UTF-8 encode and split into chunks of at most 400 bytes.
4. Encrypt each chunk with RSA-OAEP / SHA-256 using the published public JWK.
5. Base64url encode ciphertext chunks without padding.
6. Generate a fresh random `envelope_id`.
7. Replace `bridge/envelope.json` with schema `cesar-os-chat-cipher-envelope-v1`.
8. The Cloudflare bridge polls this exact branch every 2 minutes and deduplicates by `envelope_id`.

## Private read-back: César OS -> ChatGPT

Private cockpit plaintext must never be exposed on a public endpoint.

1. ChatGPT generates an ephemeral 4096-bit RSA key pair in its private execution context.
2. The private key never leaves that execution context.
3. Replace `bridge/read-request.json` with:
   - schema `cesar-os-read-request-v1`;
   - a fresh `request_id`;
   - mode `COCKPIT`;
   - algorithm `RSA-OAEP-256`;
   - only the ephemeral public JWK.
4. The Cloudflare bridge reads the request from this branch.
5. It queries the private runtime only through Cloudflare service binding.
6. It encrypts the cockpit response to the ephemeral public key.
7. Public read-response surfaces contain ciphertext only and expire after 10 minutes.
8. A durable minimized receipt prevents an expired request from being processed again.
9. ChatGPT decrypts the response only inside its private execution context.

## Privacy

GitHub may receive only:
- bridge public keys;
- ephemeral response public keys;
- transport ids/timestamps;
- ciphertext.

GitHub must never receive:
- personal commitment plaintext;
- cockpit plaintext;
- raw Gmail/calendar content;
- TATÁ operational payload copied into personal state.

Plaintext exists only in the ChatGPT private execution context before capture encryption and inside the private Cloudflare runtime after capture decryption; for read-back it exists inside the private runtime before encryption and in the ChatGPT private execution context after decryption.

## Proven behavior

Capture:
- encrypted synthetic direct capture -> exactly one PERSONAL / CESAR_PRIVATE commitment;
- replay -> `ALREADY_PROCESSED`;
- synthetic private rows cleaned after proof.

Read-back:
- ephemeral-key cockpit request -> encrypted response;
- ChatGPT decrypted the response to the exact private cockpit state;
- replay -> `ALREADY_RESPONDED`;
- natural cron proved both capture and read idempotency.

## Guards

- César-private state lives only in `cesar-os-private`.
- Bridge state lives separately in `cesar-os-chat-bridge-state`.
- The private runtime has no public target.
- Real capture requires explicit César-direct commitment intent.
- Zero commitments never means global all-clear.
- `external_effect_authorized=false`.
- Capture does not authorize email, calendar, restaurant, financial, notification, or other external action.
