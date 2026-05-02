---
name: huggingface
description: Call HuggingFace's Inference API for any public model on the Hub — image classification, segmentation, embeddings, ASR, image generation, etc. Best when fal.ai doesn't host the specific model the user named.
---

# HuggingFace

The token is OPTIONAL — public models work without auth but with
strict rate limits. Setting a token unlocks higher quotas and gated
models. If the user has set one, it's in the OS keychain under id
`HUGGINGFACE_TOKEN`.

## Auth (optional)

If the secret is configured, splice it as `Authorization: Bearer …`:

```bash
wb-fetch --secret=HUGGINGFACE_TOKEN --auth-format='Bearer {value}' \
  -X POST 'https://api-inference.huggingface.co/models/...' \
  --data-binary @/workbook/assets/photo.jpg
```

If it isn't configured, run the same call without `--secret` /
`--auth-*` — public models accept anonymous traffic up to a low rate
limit:

```bash
wb-fetch -X POST \
  'https://api-inference.huggingface.co/models/openai/whisper-large-v3' \
  --data-binary @/workbook/assets/clip.mp3 \
  -o /workbook/assets/transcript.json
```

If you hit a 429 or 503, mention the limits and offer to use a token.

## Common models for video work

| Task                          | Model                                  |
| ----------------------------- | -------------------------------------- |
| ASR (transcribe)              | `openai/whisper-large-v3`              |
| translation                   | `facebook/nllb-200-distilled-600M`     |
| image gen (fast)              | `black-forest-labs/FLUX.1-schnell`     |
| image gen (quality)           | `black-forest-labs/FLUX.1-dev`         |
| upscaling                     | `stabilityai/stable-diffusion-x4-upscaler` |
| segmentation                  | `facebook/sam2-hiera-large`            |
| embeddings (semantic search)  | `sentence-transformers/all-MiniLM-L6-v2` |

## Cold-start handling

The first call to a model can return `503` with an `estimated_time`
field while the model loads onto a worker. Retry after that delay:

```bash
RESP=$(wb-fetch ${TOKEN_FLAGS} -X POST -d '...' "$URL")
ETA=$(echo "$RESP" | jq -r '.estimated_time // empty')
if [ -n "$ETA" ]; then
  sleep "${ETA%.*}"
  RESP=$(wb-fetch ${TOKEN_FLAGS} -X POST -d '...' "$URL")
fi
```

## Notes

- Anonymous limits: ~10/min. Free token: ~1000/day. Pro: much higher.
- Inference Endpoints (paid, dedicated) are out of scope for this
  skill — link the user to https://huggingface.co/inference-endpoints.
