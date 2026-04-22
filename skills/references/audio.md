# audio

Text-to-audio generation via `POST /v1/t2a_v2`.

**Prerequisites**: read the shared basics in [`../SKILL.md`](../SKILL.md) for config, region, token, and debug rules. The `init` command saves `audioModel` and `voiceId`; both are used as defaults and can be overridden per-call.

## Command

```bash
minimax audio <text> -o <output> [options]
```

## Arguments and options

| Flag                     | Required | Default                | Description |
| ------------------------ | -------- | ---------------------- | ----------- |
| `<text>`                 | yes      |                        | Text to synthesize (max 10,000 characters) |
| `-o, --output <path>`    | yes      |                        | Output file path; parent directory is created if missing |
| `-f, --format <format>`  | no       | `mp3`                  | One of `mp3` `wav` `pcm` `flac` |
| `--model <name>`         | no       | `audioModel` in config | Override the saved audio model |
| `--voice <voice-id>`     | no       | `voiceId` in config    | Override the saved voice ID |
| `--emotion <emotion>`    | no       |                        | One of `happy` `sad` `angry` `fearful` `disgusted` `surprised` `calm` `fluent` `whisper` |
| `--speed <number>`       | no       | `1.0`                  | Speaking speed, range `[0.5, 2]` |
| `--volume <number>`      | no       | `1.0`                  | Volume, range `(0, 10]` |
| `--pitch <integer>`      | no       | `0`                    | Pitch, range `[-12, 12]` |
| `--sample-rate <hz>`     | no       | `32000`                | One of `8000` `16000` `22050` `24000` `32000` `44100` |
| `--bitrate <bps>`        | no       | `128000`               | One of `32000` `64000` `128000` `256000` |
| `--channel <n>`          | no       | `1`                    | `1` (mono) or `2` (stereo) |
| `--debug`                | no       |                        | Print the HTTP request/response to stderr (token masked) |

## Output path rules

Mirrors `image`:

- **Extension in `--output` wins over `--format`.** If the path ends with `.mp3` / `.wav` / `.pcm` / `.flac`, that format is used and `-f` is ignored.
- If the path has no recognised audio extension, the resolved `-f` is appended (e.g. `foo` + `-f mp3` → `foo.mp3`).
- Parent directory is created if missing.
- **Never overwrites.** Before the API call, the CLI checks whether the target already exists; if so, the command aborts so a mistake costs zero tokens.

## Agent workflow

1. Verify config (region, token, audioModel, voiceId) per the shared basics. If `audioModel` or `voiceId` are missing, ask the user to run `minimax init`.
2. Decide whether the user's `--output` carries an extension:
   - With extension → let it determine the format; omit `-f`.
   - Without extension → rely on `-f` or the `mp3` default.
3. Only pass `--emotion` / `--speed` / `--volume` / `--pitch` when the user actually asked for a particular feel; otherwise skip and let the API defaults apply.
4. Use `--debug` when generation fails and the API message isn't self-explanatory.

## Examples

```bash
# Default settings, format from extension
minimax audio "Hello, world." -o ./out/hello.mp3

# Override voice per call
minimax audio "今天天气不错。" \
  -o ./out/weather.wav \
  --voice female-shaonv

# Emotional delivery + speed adjustment
minimax audio "Welcome back!" \
  -o ./out/welcome.mp3 \
  --emotion happy --speed 1.1

# Override the model, request 44.1 kHz stereo flac
minimax audio "High-fidelity mix." \
  -o ./out/hifi.flac \
  --model speech-2.8-hd \
  --sample-rate 44100 --channel 2
```

## Agent rules

- **Do not** propose a `--force` / overwrite flag — none exists. Suggest deleting the old file or choosing a different `--output`.
- **Do not** invent values outside the documented ranges; the CLI rejects them with the allowed set.
- **Do not** put the raw hex string from the API into the user's chat; the CLI decodes it to a file, that's all anyone should see.
