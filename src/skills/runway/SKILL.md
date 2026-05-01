---
name: runway
description: Generate video with Runway's Gen-3 / Gen-4 models — text-to-video, image-to-video, or apply lipsync to existing footage. Best when the user wants cinematic motion that fal.ai's video models don't cover.
---

# Runway

The user's API key is available to bash as `$RUNWAY_API_KEY`. If
empty, tell them to set it via File → Integrations.

## Auth

Every endpoint takes `Authorization: Bearer $RUNWAY_API_KEY` and
`X-Runway-Version: 2024-11-06` (or newer when documented).

## Image-to-video (Gen-3 Alpha Turbo / Gen-4)

```bash
# 1. Submit
JOB=$(curl -s -X POST https://api.dev.runwayml.com/v1/image_to_video \
  -H "Authorization: Bearer $RUNWAY_API_KEY" \
  -H "X-Runway-Version: 2024-11-06" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gen3a_turbo",
    "promptImage": "<https url or data: URI of source frame>",
    "promptText": "slow dolly forward, golden hour",
    "duration": 5,
    "ratio": "1280:768"
  }')

TASK_ID=$(echo "$JOB" | jq -r '.id')

# 2. Poll until status is SUCCEEDED (typically 1–4m)
while :; do
  R=$(curl -s -H "Authorization: Bearer $RUNWAY_API_KEY" \
    -H "X-Runway-Version: 2024-11-06" \
    "https://api.dev.runwayml.com/v1/tasks/$TASK_ID")
  S=$(echo "$R" | jq -r '.status')
  [ "$S" = "SUCCEEDED" ] && { VIDEO_URL=$(echo "$R" | jq -r '.output[0]'); break; }
  [ "$S" = "FAILED" ] && { echo "$R" | jq -r '.failure'; exit 1; }
  sleep 10
done

# 3. Download
curl -sL "$VIDEO_URL" -o /workbook/assets/generated.mp4
```

`model` options:
- `gen3a_turbo` — faster, cheaper; good default for previews
- `gen4_turbo` — sharper motion + adherence (when available)

`ratio` options: `1280:768`, `768:1280`, `960:960`, `1104:832`,
`832:1104`, `1584:672`. Pick to match the workbook's aspect.

## Text-to-video (Gen-4 only)

```bash
JOB=$(curl -s -X POST https://api.dev.runwayml.com/v1/text_to_video \
  -H "Authorization: Bearer $RUNWAY_API_KEY" \
  -H "X-Runway-Version: 2024-11-06" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gen4_turbo",
    "promptText": "drone shot rising over a misty mountain forest at dawn",
    "duration": 10,
    "ratio": "1280:768"
  }')
# poll + download as above
```

## Lipsync (audio → existing video)

```bash
JOB=$(curl -s -X POST https://api.dev.runwayml.com/v1/lipsync \
  -H "Authorization: Bearer $RUNWAY_API_KEY" \
  -H "X-Runway-Version: 2024-11-06" \
  -H "Content-Type: application/json" \
  -d '{
    "videoUri": "<https url to source video>",
    "audioUri": "<https url to new dialogue audio>"
  }')
# poll + download as above
```

## Notes

- Costs are roughly $0.05/second of generated video for gen3a_turbo;
  warn the user before kicking off long jobs.
- The `promptImage` field accepts data URIs up to ~10 MB. For larger
  source images, host them via a public URL first (or convert to webp
  to fit under the limit).
- Output URLs expire — always download to `/workbook/assets/` so the
  asset stays attached to the composition.
