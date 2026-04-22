# minimax-cli

A command-line tool for MiniMax — generate images and search the web from your terminal.

## Installation

```bash
pnpm install -g @ikeq/minimax-cli
```

Or use it locally via `npx` / `pnpm dlx`:

```bash
pnpm dlx @ikeq/minimax-cli <command>
```

## Quick start

Run `init` once to configure your region, API token and default image model:

```bash
minimax init
```

You'll be prompted for:

- **Region** — `china` or `global`
- **Token** — your MiniMax API key
- **Image model** — e.g. `image-01`

The config is saved to `~/.minimax-cli/config.json`. Re-running `init` keeps existing values as defaults (token is shown masked as `first6...last6`).

## Commands

### `init`

Initialize or update your configuration.

```bash
minimax init
```

### `image`

Generate images from a text prompt.

```bash
minimax image <prompt> -o <output> [options]
```

**Arguments**

| Argument   | Required | Description                      |
| ---------- | -------- | -------------------------------- |
| `<prompt>` | yes      | Text description of the image (max 1500 chars) |

**Options**

| Option                       | Required | Default                | Description                                                             |
| ---------------------------- | -------- | ---------------------- | ----------------------------------------------------------------------- |
| `-o, --output <path>`        | yes      |                        | Output file path; parent directory is created if missing                |
| `-r, --aspect-ratio <ratio>` | no       | `16:9`                 | `1:1` `16:9` `4:3` `3:2` `2:3` `3:4` `9:16` `21:9`                     |
| `--width <pixels>`           | no       |                        | `[512, 2048]`, multiple of 8 (requires `--height`)                      |
| `--height <pixels>`          | no       |                        | `[512, 2048]`, multiple of 8 (requires `--width`)                       |
| `-n, --number <count>`       | no       | `1`                    | Number of images to generate (1–9)                                      |
| `-f, --format <format>`      | no       | `webp`                 | `png` `jpg` `webp`                                                      |
| `--model <name>`             | no       | `imageModel` in config | Override the saved image model                                          |
| `--reference <urls>`         | no       |                        | Comma-separated http(s) URLs used as subject references                 |
| `--seed <integer>`           | no       |                        | Random seed for reproducible output                                     |
| `--prompt-optimizer`         | no       |                        | Enable server-side prompt auto-optimization                             |
| `--watermark`                | no       |                        | Enable the AIGC watermark on generated images                           |
| `--style-type <type>`        | no       |                        | `漫画` `元气` `中世纪` `水彩`; only applied when `--model=image-01-live` |
| `--style-weight <number>`    | no       | `0.8`                  | `(0, 1]`, only meaningful with `--style-type`                           |
| `--debug`                    | no       |                        | Print the HTTP request/response to stderr (token masked)                |

**Size rules**

- If neither `-r` nor `--width`/`--height` is given, the CLI sends `aspect_ratio: "16:9"`.
- `--width` and `--height` must be passed together. When both size groups are provided the server prefers `aspect_ratio`.

**Output path rules**

- If `--output` ends with `.png` / `.jpg` / `.jpeg` / `.webp`, that extension wins over `--format`.
- `n === 1` → writes `<base>.<format>`.
- `n > 1` → writes `<base>-1.<format>`, `<base>-2.<format>`, …
- Never overwrites. If any target file already exists, the command aborts before calling the API.

**Examples**

```bash
# Simple: defaults from config, 16:9, webp
minimax image "a cat on the moon" -o ./out/cat

# Extension decides format; batch of three numbered files
minimax image "venice beach, film grain" -o ./out/venice.png -n 3

# Explicit pixel size
minimax image "phone wallpaper, neon city" -o ./out/wall.png \
  --width 720 --height 1280

# Reproducible output with a fixed seed + prompt optimizer
minimax image "cinematic portrait, dramatic rim light" \
  -o ./out/portrait.png -r 3:4 \
  --seed 42 --prompt-optimizer

# image-01-live with a watercolour style
minimax image "a quiet river town at dusk" \
  -o ./out/river.png -r 16:9 \
  --model image-01-live --style-type 水彩 --style-weight 0.9

# Reference images for subject consistency
minimax image "the same character at sunset beach" \
  -o ./out/char.png -r 16:9 \
  --reference https://example.com/char-1.png,https://example.com/char-2.png
```

### `audio`

Generate audio from text.

```bash
minimax audio <text> -o <output> [options]
```

**Arguments**

| Argument  | Required | Description                    |
| --------- | -------- | ------------------------------ |
| `<text>`  | yes      | Text to synthesize (max 10,000) |

**Options**

| Option                  | Required | Default                   | Description                                                             |
| ----------------------- | -------- | ------------------------- | ----------------------------------------------------------------------- |
| `-o, --output <path>`   | yes      |                           | Output file path; parent directory is created if missing                |
| `-f, --format <format>` | no       | `mp3`                     | One of `mp3` `wav` `pcm` `flac`                                         |
| `--model <name>`        | no       | `audioModel` in config    | Override the saved audio model                                          |
| `--voice <voice-id>`    | no       | `voiceId` in config       | Override the saved voice ID                                             |
| `--emotion <emotion>`   | no       |                           | `happy` `sad` `angry` `fearful` `disgusted` `surprised` `calm` `fluent` `whisper` |
| `--speed <number>`      | no       | `1.0`                     | `[0.5, 2]`                                                              |
| `--volume <number>`     | no       | `1.0`                     | `(0, 10]`                                                               |
| `--pitch <integer>`     | no       | `0`                       | `[-12, 12]`                                                             |
| `--sample-rate <hz>`    | no       | `32000`                   | `8000` `16000` `22050` `24000` `32000` `44100`                          |
| `--bitrate <bps>`       | no       | `128000`                  | `32000` `64000` `128000` `256000`                                       |
| `--channel <n>`         | no       | `1`                       | `1` or `2`                                                              |
| `--debug`               | no       |                           | Print the HTTP request/response to stderr (token masked)                |

Same output rules as `image`: extension in `--output` wins over `--format`, parent directory is created, never overwrites an existing file.

**Examples**

```bash
# Simple: format from extension, defaults from config
minimax audio "Hello, world." -o ./out/hello.mp3

# Override voice and tune delivery
minimax audio "Welcome back!" \
  -o ./out/welcome.mp3 \
  --voice female-shaonv --emotion happy --speed 1.1

# High-fidelity flac, override model
minimax audio "High-fidelity mix." \
  -o ./out/hifi.flac \
  --model speech-2.8-hd --sample-rate 44100 --channel 2
```

### `search`

Web search via the MiniMax coding-plan endpoint. Prints the raw JSON response.

```bash
minimax search <query> [--debug]
```

Queries with 3–5 keywords tend to work best. For time-sensitive topics, include a year.

**Example**

```bash
minimax search "latest typescript 5.6 features 2025"
```

Response shape:

```jsonc
{
  "organic":          [{ "title", "link", "snippet", "date" }],
  "related_searches": [{ "query" }],
  "base_resp":        { "status_code", "status_msg" }
}
```

### `ui`

Launch a local web UI to run any command through a form.

```bash
minimax ui [-p <port>] [--no-open]
```

- Binds to `127.0.0.1` only
- Auto-picks a free port when `-p` is omitted
- Opens your default browser automatically (disable with `--no-open`)

## Configuration file

Stored at `~/.minimax-cli/config.json`:

```jsonc
{
  "region": "china",        // or "global"
  "token": "<your token>",
  "imageModel": "image-01",
  "audioModel": "speech-2.8-hd",
  "voiceId": "male-qn-qingse"
}
```

| Region   | Base URL                   |
| -------- | -------------------------- |
| `china`  | `https://api.minimaxi.com` |
| `global` | `https://api.minimax.io`   |

## Requirements

- Node.js ≥ 18
- A MiniMax account and API token — [MiniMax console](https://platform.minimaxi.com/)

## License

MIT
