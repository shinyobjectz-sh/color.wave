---
name: elevenlabs
description: Generate narration, voice clones, sound effects, or dub video into other languages via ElevenLabs. Best when the user asks for voiceover, TTS, ambient sound design, or audio in a specific voice/language.
---

# ElevenLabs

The user's API key is in the OS keychain under id `ELEVENLABS_API_KEY`.
Access it via `wb-fetch --secret=ELEVENLABS_API_KEY`; the daemon
splices the header for you. You never see the value. If the call
returns "secret not set for this workbook", tell the user to open
File → Integrations.

## Auth

Every endpoint uses header `xi-api-key: <ELEVENLABS_API_KEY>`:

```bash
wb-fetch --secret=ELEVENLABS_API_KEY \
  --auth-header=xi-api-key --auth-format='{value}' \
  ...
```

## Text-to-speech

```bash
# Default voice "Rachel" (id 21m00Tcm4TlvDq8ikWAM); browse voices at
# https://elevenlabs.io/app/voice-lab to pick a different voice_id.
wb-fetch --secret=ELEVENLABS_API_KEY \
  --auth-header=xi-api-key --auth-format='{value}' \
  -X POST 'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM' \
  -H 'Content-Type: application/json' \
  -d '{"text":"<narration>","model_id":"eleven_turbo_v2_5","voice_settings":{"stability":0.5,"similarity_boost":0.75}}' \
  -o /workbook/assets/voiceover.mp3
```

`model_id` options:
- `eleven_turbo_v2_5` — fast, multilingual, good default
- `eleven_multilingual_v2` — highest quality, slower
- `eleven_v3` — emotion + dialogue tags (experimental)

## List voices

```bash
wb-fetch --secret=ELEVENLABS_API_KEY \
  --auth-header=xi-api-key --auth-format='{value}' \
  https://api.elevenlabs.io/v1/voices \
  | jq '.voices[] | {voice_id, name, labels}'
```

## Sound effect generation

```bash
wb-fetch --secret=ELEVENLABS_API_KEY \
  --auth-header=xi-api-key --auth-format='{value}' \
  -X POST 'https://api.elevenlabs.io/v1/sound-generation' \
  -H 'Content-Type: application/json' \
  -d '{"text":"thunderclap with reverberant tail","duration_seconds":4}' \
  -o /workbook/assets/thunder.mp3
```

## Dubbing (video → other language with cloned voice)

ElevenLabs dubbing wants multipart upload. wb-fetch only handles
JSON / utf8 bodies for now (Phase 1). For dubbing, tell the user
the workflow exists but is not yet wired through wb-fetch — they
can use ElevenLabs' web UI, then drag the resulting MP4 into the
Assets panel.

## Voice cloning

Same multipart constraint as dubbing — defer to UI for now and
flag this as a Phase 2 wb-fetch enhancement (multipart support).

## Notes

- TTS responses are MP3 by default. Add `?output_format=mp3_44100_192`
  for higher quality, `pcm_44100` for raw PCM.
- All audio results land in `/workbook/assets/` and the composition
  picks them up via `<audio data-src="...">`.
