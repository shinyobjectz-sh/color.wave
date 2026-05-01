---
name: elevenlabs
description: Generate narration, voice clones, sound effects, or dub video into other languages via ElevenLabs. Best when the user asks for voiceover, TTS, ambient sound design, or audio in a specific voice/language.
---

# ElevenLabs

The user's API key is available to bash as `$ELEVENLABS_API_KEY`. If
empty, tell them to set it via File → Integrations.

## Auth

Every endpoint takes `xi-api-key: $ELEVENLABS_API_KEY` as a header.

## Text-to-speech

```bash
# Default voice "Rachel" (id 21m00Tcm4TlvDq8ikWAM); browse voices at
# https://elevenlabs.io/app/voice-lab to pick a different voice_id.
curl -s -X POST \
  "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "<your narration>",
    "model_id": "eleven_turbo_v2_5",
    "voice_settings": { "stability": 0.5, "similarity_boost": 0.75 }
  }' \
  -o /workbook/assets/voiceover.mp3
```

`model_id` options:
- `eleven_turbo_v2_5` — fast, multilingual, good default
- `eleven_multilingual_v2` — highest quality, slower
- `eleven_v3` — emotion + dialogue tags (experimental)

## List voices

```bash
curl -s -H "xi-api-key: $ELEVENLABS_API_KEY" \
  https://api.elevenlabs.io/v1/voices | jq '.voices[] | {voice_id, name, labels}'
```

## Sound effect generation

```bash
curl -s -X POST https://api.elevenlabs.io/v1/sound-generation \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "thunderclap with reverberant tail",
    "duration_seconds": 4
  }' \
  -o /workbook/assets/thunder.mp3
```

## Dubbing (video → other language with cloned voice)

```bash
# 1. Submit the dubbing job
JOB=$(curl -s -X POST https://api.elevenlabs.io/v1/dubbing \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -F "file=@/workbook/assets/source.mp4" \
  -F "target_lang=es" \
  -F "source_lang=auto")

DUB_ID=$(echo "$JOB" | jq -r '.dubbing_id')

# 2. Poll
while :; do
  S=$(curl -s -H "xi-api-key: $ELEVENLABS_API_KEY" \
    "https://api.elevenlabs.io/v1/dubbing/$DUB_ID" | jq -r '.status')
  [ "$S" = "dubbed" ] && break
  sleep 10
done

# 3. Download
curl -s -H "xi-api-key: $ELEVENLABS_API_KEY" \
  "https://api.elevenlabs.io/v1/dubbing/$DUB_ID/audio/es" \
  -o /workbook/assets/dubbed-es.mp4
```

## Voice cloning (instant)

```bash
curl -s -X POST https://api.elevenlabs.io/v1/voices/add \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -F "name=Custom Voice" \
  -F "files=@/workbook/assets/sample.mp3"
# → returns { "voice_id": "..." }; reuse that as voice_id in TTS calls
```

## Notes

- TTS responses are MP3 by default. Add `?output_format=mp3_44100_192`
  for higher quality, `pcm_44100` for raw PCM.
- All audio results land in `/workbook/assets/<name>.mp3`; the
  composition picks them up automatically once referenced by an
  `<audio data-src="...">` element.
