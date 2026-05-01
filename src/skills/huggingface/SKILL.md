---
name: huggingface
description: Call HuggingFace's Inference API for any public model on the Hub — image classification, segmentation, embeddings, ASR, image generation, etc. Best when fal.ai doesn't host the specific model the user named.
---

# HuggingFace

`$HUGGINGFACE_TOKEN` is OPTIONAL — public models work without auth
but with strict rate limits. Setting a token unlocks higher quotas
and gated models.

## Inference API

The Hub serves any public model at:
`https://api-inference.huggingface.co/models/<owner>/<name>`

```bash
# With token
AUTH=()
[ -n "$HUGGINGFACE_TOKEN" ] && AUTH=(-H "Authorization: Bearer $HUGGINGFACE_TOKEN")

# Image classification (binary input)
curl -s -X POST "${AUTH[@]}" \
  --data-binary @/workbook/assets/photo.jpg \
  https://api-inference.huggingface.co/models/google/vit-base-patch16-224

# Image generation (JSON input → binary output)
curl -s -X POST "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"inputs":"a cat surfing"}' \
  -o /workbook/assets/generated.png \
  https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell

# Speech recognition
curl -s -X POST "${AUTH[@]}" \
  --data-binary @/workbook/assets/clip.mp3 \
  https://api-inference.huggingface.co/models/openai/whisper-large-v3
```

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

## Spaces API

Hosted demos on https://huggingface.co/spaces expose a `/run/predict`
endpoint via gradio_client. Use `pip install gradio_client` inside the
sandbox if needed.

## Cold-start handling

The first call to a model can return `503` with a `estimated_time`
field while the model loads onto a worker. Retry after that delay:

```bash
RESPONSE=$(curl -s "${AUTH[@]}" -X POST -d '...' "$URL")
ETA=$(echo "$RESPONSE" | jq -r '.estimated_time // empty')
if [ -n "$ETA" ]; then
  sleep "${ETA%.*}"
  RESPONSE=$(curl -s "${AUTH[@]}" -X POST -d '...' "$URL")
fi
```

## Notes

- Rate limits without a token: ~10/min, very small. With a free
  token: ~1000/day. Pro/Enterprise: much higher.
- For models too big for the serverless inference (most 70B+ LLMs),
  use Inference Endpoints instead — paid, dedicated; out of scope for
  this skill but link the user to https://huggingface.co/inference-endpoints.
