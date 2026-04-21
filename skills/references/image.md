# image

Text-to-image generation. Generates images from a text prompt using the model set in `imageModel`.

**Prerequisites**: read the shared basics in [`../SKILL.md`](../SKILL.md) for config, region, token, and debug rules.

## Command

```bash
minimax image <prompt> -o <output> -r <aspect-ratio> [options]
```

## Arguments and options

| Flag                         | Required | Default | Description |
| ---------------------------- | -------- | ------- | ----------- |
| `<prompt>`                   | yes      |         | Text description of the image |
| `-o, --output <path>`        | yes      |         | Output file path; parent directory is created if missing |
| `-r, --aspect-ratio <ratio>` | yes      |         | One of `1:1` `16:9` `4:3` `3:2` `2:3` `3:4` `9:16` `21:9` |
| `-n, --number <count>`       | no       | `1`     | Number of images to generate (1–9) |
| `-f, --format <format>`      | no       | `webp`  | One of `png` `jpg` `webp` |
| `--reference <urls>`         | no       |         | Comma-separated http(s) URLs used as subject references |
| `--debug`                    | no       |         | Print the HTTP request/response to stderr (token masked) |

## Output path rules

`--output` is a **file path** (not a directory). Behaviour:

- **Extension in `--output` wins over `--format`.** If the path ends with `.png` / `.jpg` / `.jpeg` / `.webp`, that format is used and `-f` is ignored.
- Missing or unrecognised extension → `-f` decides (default `webp`).
- **`n === 1`** → writes `<base>.<format>` (where `<base>` is the path without its image extension).
- **`n > 1`** → writes `<base>-1.<format>`, `<base>-2.<format>`, … `<base>-n.<format>`.
- Parent directory is created if missing.
- **Never overwrites.** Before calling the API, the CLI checks every target path it will write. If any of them already exists, the command aborts **before** the API call so a mistake costs zero tokens.

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

1. Verify config (region, token, imageModel) per the shared basics. If missing, ask the user to set it up.
2. Pick a sensible aspect ratio. Default to `1:1` unless the user's intent implies another (e.g. "banner" → `16:9`, "phone wallpaper" → `9:16`, "portrait" → `3:4` or `2:3`).
3. Decide whether the user gave you a file path with or without an extension:
   - With extension → let it determine the format; omit `-f`.
   - Without extension → pass `-f` explicitly if they want a non-default format.
4. Only pass `--reference` when the user actually provided reference URLs — don't invent them.
5. Use `--debug` when a generation fails and the API message isn't self-explanatory.

## Examples

```bash
# Single image, explicit format via extension
minimax image "a cat on the moon" -o ./out/cat.png -r 1:1

# Batch of three, 16:9; extension decides format, files are -1/-2/-3
minimax image "venice beach, film grain, 90s documentary" \
  -o ./out/venice.png -r 16:9 -n 3

# No extension + -f webp (default)
minimax image "phone wallpaper, neon city" -o ./out/wall -r 9:16

# Character consistency with reference images
minimax image "the same character at sunset beach" \
  -o ./out/char.png -r 16:9 \
  --reference https://example.com/char-1.png,https://example.com/char-2.png
```

## Agent rules

- **Do not** set `-n` outside `1..9`; the CLI rejects it.
- If the user pastes multiple reference URLs with spaces, join them with commas before passing to `--reference`.
- If a user reports "target already exists", suggest they either delete the existing file, or change `--output` to a new path — do not propose passing a flag that forces overwrite (there isn't one).
