# image

Text-to-image generation via `POST /v1/image_generation`. Generates images from a text prompt.

**Prerequisites**: read the shared basics in [`../SKILL.md`](../SKILL.md) for config, region, token, and debug rules. The `init` command saves `imageModel`; it is used as the default and can be overridden per-call with `--model`.

## Command

```bash
minimax image <prompt> -o <output> [options]
```

## Arguments and options

| Flag                         | Required | Default                | Description |
| ---------------------------- | -------- | ---------------------- | ----------- |
| `<prompt>`                   | yes      |                        | Text description of the image (max 1500 characters) |
| `-o, --output <path>`        | yes      |                        | Output file path; parent directory is created if missing |
| `-r, --aspect-ratio <ratio>` | no       | `16:9`                 | One of `1:1` `16:9` `4:3` `3:2` `2:3` `3:4` `9:16` `21:9` (`21:9` is `image-01` only) |
| `--width <pixels>`           | no       |                        | Width in pixels, `[512, 2048]`, multiple of 8 (requires `--height`) |
| `--height <pixels>`          | no       |                        | Height in pixels, same constraints (requires `--width`) |
| `-n, --number <count>`       | no       | `1`                    | Number of images to generate (1–9) |
| `-f, --format <format>`      | no       | `webp`                 | One of `png` `jpg` `webp` |
| `--model <name>`             | no       | `imageModel` in config | Override the saved image model (e.g. `image-01`, `image-01-live`) |
| `--reference <urls>`         | no       |                        | Comma-separated http(s) URLs used as subject references |
| `--seed <integer>`           | no       |                        | Random seed for reproducible output |
| `--prompt-optimizer`         | no       |                        | Enable server-side prompt auto-optimization |
| `--watermark`                | no       |                        | Enable the AIGC watermark on generated images |
| `--style-type <type>`        | no       |                        | One of `漫画` `元气` `中世纪` `水彩`; only applied when `--model=image-01-live` |
| `--style-weight <number>`    | no       | `0.8`                  | Style weight in `(0, 1]`, only meaningful with `--style-type` |
| `--debug`                    | no       |                        | Print the HTTP request/response to stderr (token masked) |

### Size: `--aspect-ratio` vs `--width`/`--height`

- If neither is provided, the CLI sends `aspect_ratio: "16:9"` (its default).
- If only `--aspect-ratio` is given, it is sent.
- If only `--width` and `--height` are given, they are sent (both required together — passing one alone fails up front).
- If **both** are given, the server prefers `aspect_ratio`. The CLI does not forbid it; it just warns you in the "Generating …" line so you know which one will actually take effect.

## Output path rules

`--output` is a **file path** (not a directory). Behaviour:

- **Extension in `--output` wins over `--format`.** If the path ends with `.png` / `.jpg` / `.jpeg` / `.webp`, that format is used and `-f` is ignored.
- Missing or unrecognised extension → `-f` decides (default `webp`).
- **`n === 1`** → writes `<base>.<format>`.
- **`n > 1`** → writes `<base>-1.<format>`, `<base>-2.<format>`, … `<base>-n.<format>`.
- Parent directory is created if missing.
- **Never overwrites.** Before calling the API, the CLI checks every target path it will write. If any already exists, the command aborts **before** the API call so a mistake costs zero tokens.

### Examples of resolved targets

| `--output`                | `-f`   | `-n` | Writes to                                                      |
| ------------------------- | ------ | ---- | -------------------------------------------------------------- |
| `./out/cat.png`           | (any)  | `1`  | `./out/cat.png`                                                |
| `./out/cat.png`           | (any)  | `3`  | `./out/cat-1.png`, `./out/cat-2.png`, `./out/cat-3.png`        |
| `./out/cat.jpeg`          | (any)  | `1`  | `./out/cat.jpeg` (format is `jpg`)                             |
| `./out/cat`               | `webp` | `1`  | `./out/cat.webp`                                               |
| `./out/cat`               | `png`  | `2`  | `./out/cat-1.png`, `./out/cat-2.png`                           |

## Reference images

`--reference` accepts one or more http(s) URLs, comma-separated, no spaces:

```
--reference https://a.com/char-1.png,https://a.com/char-2.png
```

Each URL becomes an entry in the request body's `subject_reference` array with `type: "character"`. Useful for keeping the same character across scenes. URLs must start with `http://` or `https://` — the CLI rejects anything else up front.

## Agent workflow

1. Verify config (region, token) per the shared basics. Ensure either `imageModel` exists in config or the user supplies `--model`.
2. Pick a sensible aspect ratio. Default is already `16:9`; only override when the user implies another (e.g. "square" → `1:1`, "phone wallpaper" → `9:16`, "portrait" → `3:4` or `2:3`).
3. Decide whether the user gave you a file path with or without an extension:
   - With extension → let it determine the format; omit `-f`.
   - Without extension → pass `-f` explicitly if they want a non-default format.
4. Only pass `--reference` when the user actually provided reference URLs — don't invent them.
5. Pass `--seed` when the user asks to "reproduce" / "regenerate the same image".
6. Pass `--prompt-optimizer` when the user's prompt is short or ambiguous and they want the server to help.
7. Only set `--style-type` / `--style-weight` when the user explicitly picked a stylised look **and** the model is `image-01-live`; otherwise the server silently ignores style.
8. Use `--debug` when a generation fails and the API message isn't self-explanatory.

## Examples

```bash
# Simple: defaults from config, 16:9, webp
minimax image "a cat on the moon" -o ./out/cat

# Extension decides format; batch of three numbered files
minimax image "venice beach, film grain, 90s documentary" \
  -o ./out/venice.png -n 3

# Explicit pixel size (overrides the default aspect ratio)
minimax image "phone wallpaper, neon city" -o ./out/wall.png \
  --width 720 --height 1280

# Reproducible output with a fixed seed, optimized prompt
minimax image "cinematic portrait, dramatic rim light" \
  -o ./out/portrait.png -r 3:4 \
  --seed 42 --prompt-optimizer

# image-01-live with a watercolour style
minimax image "a quiet river town at dusk" \
  -o ./out/river.png -r 16:9 \
  --model image-01-live --style-type 水彩 --style-weight 0.9

# Character consistency with reference images
minimax image "the same character at sunset beach" \
  -o ./out/char.png -r 16:9 \
  --reference https://example.com/char-1.png,https://example.com/char-2.png
```

## Agent rules

- **Do not** set `-n` outside `1..9`; the CLI rejects it.
- **Do not** pass `--width` without `--height` or vice versa — the CLI rejects that combo up front.
- **Do not** pass `--style-weight` without `--style-type`; it has no effect and the CLI rejects it.
- If the user pastes multiple reference URLs with spaces, join them with commas before passing to `--reference`.
- If a user reports "target already exists", suggest they either delete the existing file, or change `--output` to a new path — do not propose passing a flag that forces overwrite (there isn't one).
