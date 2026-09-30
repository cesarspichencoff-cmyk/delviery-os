# César OS — encrypted ChatGPT capture bridge v1

This branch is an isolated transport surface. It must never be merged into DeliveryOS canonical branches.

## Purpose

Allow ChatGPT to hand a direct César capture to the private César OS runtime without storing plaintext on GitHub.

## Authority

Only explicit César-direct capture may be emitted:
- WATCH
- CHATGPT
- USER_DIRECT
- VOICE

Source observations, system inference and third-party requests must never be converted into a César commitment here.

## Transport

1. Read `bridge/public-key.json`.
2. Build plaintext JSON:
   `{"schema":"cesar-os-direct-capture-v1","synthetic":false,"capture":{...}}`.
3. UTF-8 encode and split into chunks of at most 400 bytes.
4. Encrypt each chunk with RSA-OAEP / SHA-256 using the published public JWK.
5. Base64url encode ciphertext chunks without padding.
6. Generate a fresh random `envelope_id`.
7. Replace `bridge/envelope.json` with schema `cesar-os-chat-cipher-envelope-v1`.
8. The Cloudflare bridge polls this exact branch every 2 minutes and deduplicates by `envelope_id`.

## Privacy

GitHub receives only:
- key id;
- algorithm;
- envelope id;
- timestamp;
- ciphertext.

Plaintext exists only in the ChatGPT execution context before encryption and inside the private Cloudflare runtime after decryption.

## Guards

- DeliveryOS remains only the transport repository; this branch is not canonical product state.
- César-private commitments stay in `cesar-os-private`.
- `external_effect_authorized=false`.
- No email/calendar/restaurant write is implied by commitment capture.
- Replays of the same envelope must not duplicate commitments.
