---
name: fal-ai
description: Call fal.ai's hosted inference API for image, video, and audio model generation. Best when the user asks to generate, animate, or edit a clip and the in-bundle WASM models can't cover it (text-to-video, image-to-video, voice cloning, etc.).
---

# fal.ai

fal.ai exposes hundreds of models behind a single REST API. The user
configured their API key in File → Integrations; it lives in the OS
keychain (NOT in any env var, NOT in the workbook file). You access
it only by naming the secret id `FAL_API_KEY` in `wb-fetch` — the
daemon splices the header, makes the call, and returns the response.
You never see the key value.

If the call fails with `secret 'FAL_API_KEY' not set for this
workbook`, tell the user to open File → Integrations and paste their
key. Don't try to invent one or look elsewhere — the daemon is the
only source of truth for secrets.

## Auth pattern

Every fal endpoint uses `Authorization: Key <FAL_API_KEY>`:

```bash
wb-fetch --secret=FAL_API_KEY --auth-format='Key {value}' \
  -X POST 'https://queue.fal.run/<model-id>' \
  -H 'Content-Type: application/json' \
  -d '{...}'
```

(`--auth-header` defaults to `Authorization`, so omit it for fal.)

## Common video-editing models

| Task                      | Model id                           |
| ------------------------- | ---------------------------------- |
| image → video             | `fal-ai/kling-video/v2/standard/image-to-video` |
| image → video (Veo)       | `fal-ai/veo3/image-to-video`       |
| image → video (MiniMax)   | `fal-ai/minimax/hailuo-02/standard/image-to-video` |
| text → image (Flux)       | `fal-ai/flux/dev`                  |
| upscale                   | `fal-ai/aura-sr`                   |
| background removal        | `fal-ai/birefnet`                  |
| sound effect              | `fal-ai/mmaudio-v2`                |

Browse the catalog at https://fal.ai/models — each model page shows
the exact request schema.

## Calling pattern (queue API)

fal's queue API is async — submit, poll status, fetch result:

```bash
# 1. Submit
wb-fetch --secret=FAL_API_KEY --auth-format='Key {value}' \
  -X POST 'https://queue.fal.run/fal-ai/kling-video/v2/standard/image-to-video' \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"<your prompt>","image_url":"<https url>"}' \
  > /tmp/fal-submit.json

REQUEST_ID=$(jq -r .request_id /tmp/fal-submit.json)
URL_BASE='https://queue.fal.run/fal-ai/kling-video/v2/standard/image-to-video'

# 2. Poll
while :; do
  wb-fetch --secret=FAL_API_KEY --auth-format='Key {value}' \
    "$URL_BASE/requests/$REQUEST_ID/status" > /tmp/fal-status.json
  S=$(jq -r .status /tmp/fal-status.json)
  [ "$S" = "COMPLETED" ] && break
  [ "$S" = "FAILED" ] && { cat /tmp/fal-status.json; exit 1; }
  sleep 5
done

# 3. Fetch + download the result video into the workbook's assets dir
wb-fetch --secret=FAL_API_KEY --auth-format='Key {value}' \
  "$URL_BASE/requests/$REQUEST_ID" > /tmp/fal-result.json
VIDEO_URL=$(jq -r '.video.url' /tmp/fal-result.json)

# Public CDN URL — no auth needed, no --secret.
wb-fetch -o /workbook/assets/generated.mp4 "$VIDEO_URL"
```

`-o /path` writes the response body to the bash VFS — handles binary
correctly so `.mp4` / `.png` round-trip cleanly into `/workbook/assets/`.

## Notes

- `wb-fetch` only allows HTTPS URLs. Plaintext is refused at the
  daemon.
- Costs vary by model; check the model page before kicking off long
  jobs. Tell the user the expected cost before spending.
