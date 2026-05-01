---
name: fal-ai
description: Call fal.ai's hosted inference API for image, video, and audio model generation. Best when the user asks to generate, animate, or edit a clip and the in-bundle WASM models can't cover it (text-to-video, image-to-video, voice cloning, etc.).
---

# fal.ai

fal.ai exposes hundreds of models behind a single REST API. The user
configured their API key in the Integrations panel; it's available to
your bash sandbox as `$FAL_API_KEY`.

If `$FAL_API_KEY` is empty, tell the user to open File → Integrations
and paste their key — never invent or hardcode one.

## Auth

```bash
curl -s -H "Authorization: Key $FAL_API_KEY" \
     -H "Content-Type: application/json" \
     https://queue.fal.run/<model-id>
```

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
the exact request schema and a "Try it" curl example.

## Calling pattern (queue API)

fal's queue API is async — submit a job, poll, then fetch the result:

```bash
# 1. Submit
JOB=$(curl -s -X POST "https://queue.fal.run/fal-ai/kling-video/v2/standard/image-to-video" \
  -H "Authorization: Key $FAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "<your prompt>",
    "image_url": "<https url to the source frame>"
  }')

REQUEST_ID=$(echo "$JOB" | jq -r '.request_id')

# 2. Poll until status is COMPLETED (typically 30s–5m for video)
while :; do
  S=$(curl -s -H "Authorization: Key $FAL_API_KEY" \
    "https://queue.fal.run/fal-ai/kling-video/v2/standard/image-to-video/requests/$REQUEST_ID/status" \
    | jq -r '.status')
  [ "$S" = "COMPLETED" ] && break
  [ "$S" = "FAILED" ] && { echo "fal job failed"; exit 1; }
  sleep 5
done

# 3. Fetch result
RESULT=$(curl -s -H "Authorization: Key $FAL_API_KEY" \
  "https://queue.fal.run/fal-ai/kling-video/v2/standard/image-to-video/requests/$REQUEST_ID")
VIDEO_URL=$(echo "$RESULT" | jq -r '.video.url')

# 4. Download the asset and add it to the workbook
curl -sL "$VIDEO_URL" -o /workbook/assets/generated.mp4
```

## Notes

- All fal endpoints accept HTTPS image URLs OR base64 data URIs.
- For models that take an `image_url`, you can host the source asset
  by encoding it as a data URI; no external upload needed.
- Costs vary by model; check the model page before kicking off long jobs.
