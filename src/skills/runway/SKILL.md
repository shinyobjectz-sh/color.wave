---
name: runway
description: Generate video with Runway's Gen-3 / Gen-4 models — text-to-video, image-to-video, or apply lipsync to existing footage. Best when the user wants cinematic motion that fal.ai's video models don't cover.
---

# Runway

The user's API key is in the OS keychain under id `RUNWAY_API_KEY`.
Access it via `wb-fetch --secret=RUNWAY_API_KEY`; the daemon splices
the header. You never see the value. If the call returns "secret not
set for this workbook", tell the user to open File → Integrations.

## Auth

Every endpoint uses `Authorization: Bearer <RUNWAY_API_KEY>` and
`X-Runway-Version: 2024-11-06`:

```bash
wb-fetch --secret=RUNWAY_API_KEY --auth-format='Bearer {value}' \
  -H 'X-Runway-Version: 2024-11-06' \
  ...
```

## Image-to-video (Gen-3 Alpha Turbo / Gen-4)

```bash
# 1. Submit
wb-fetch --secret=RUNWAY_API_KEY --auth-format='Bearer {value}' \
  -H 'X-Runway-Version: 2024-11-06' \
  -X POST 'https://api.dev.runwayml.com/v1/image_to_video' \
  -H 'Content-Type: application/json' \
  -d '{"model":"gen3a_turbo","promptImage":"<https url or data: URI>","promptText":"slow dolly forward, golden hour","duration":5,"ratio":"1280:768"}' \
  > /tmp/runway-submit.json
TASK_ID=$(jq -r .id /tmp/runway-submit.json)

# 2. Poll until SUCCEEDED (1–4m)
while :; do
  wb-fetch --secret=RUNWAY_API_KEY --auth-format='Bearer {value}' \
    -H 'X-Runway-Version: 2024-11-06' \
    "https://api.dev.runwayml.com/v1/tasks/$TASK_ID" > /tmp/runway-poll.json
  S=$(jq -r .status /tmp/runway-poll.json)
  [ "$S" = "SUCCEEDED" ] && break
  [ "$S" = "FAILED" ] && { jq -r .failure /tmp/runway-poll.json; exit 1; }
  sleep 10
done

# 3. Download
VIDEO_URL=$(jq -r '.output[0]' /tmp/runway-poll.json)
wb-fetch -o /workbook/assets/generated.mp4 "$VIDEO_URL"
```

`model` options:
- `gen3a_turbo` — faster, cheaper; good default for previews
- `gen4_turbo` — sharper motion + adherence (when available)

`ratio`: `1280:768`, `768:1280`, `960:960`, `1104:832`, `832:1104`,
`1584:672`. Pick to match the workbook's aspect.

## Text-to-video (Gen-4)

```bash
wb-fetch --secret=RUNWAY_API_KEY --auth-format='Bearer {value}' \
  -H 'X-Runway-Version: 2024-11-06' \
  -X POST 'https://api.dev.runwayml.com/v1/text_to_video' \
  -H 'Content-Type: application/json' \
  -d '{"model":"gen4_turbo","promptText":"drone shot rising over a misty mountain forest at dawn","duration":10,"ratio":"1280:768"}' \
  > /tmp/runway-submit.json
# poll + download as above
```

## Lipsync

```bash
wb-fetch --secret=RUNWAY_API_KEY --auth-format='Bearer {value}' \
  -H 'X-Runway-Version: 2024-11-06' \
  -X POST 'https://api.dev.runwayml.com/v1/lipsync' \
  -H 'Content-Type: application/json' \
  -d '{"videoUri":"<https url to source>","audioUri":"<https url to dialogue>"}'
```

## Notes

- Costs ≈ $0.05/sec gen3a_turbo. Warn before long jobs.
- `promptImage` accepts data URIs up to ~10 MB. For larger sources,
  host as a public URL (or convert to webp first).
- Output URLs expire — always `-o /workbook/assets/...` to download.
