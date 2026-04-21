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
minimax image <prompt> -o <output> -r <aspect-ratio> [options]
```

**Arguments**

| Argument   | Required | Description                      |
| ---------- | -------- | -------------------------------- |
| `<prompt>` | yes      | Text description of the image    |

**Options**

| Option                       | Required | Default | Description                                                             |
| ---------------------------- | -------- | ------- | ----------------------------------------------------------------------- |
| `-o, --output <path>`        | yes      |         | Output file path; parent directory is created if missing                |
| `-r, --aspect-ratio <ratio>` | yes      |         | One of `1:1` `16:9` `4:3` `3:2` `2:3` `3:4` `9:16` `21:9`               |
| `-n, --number <count>`       | no       | `1`     | Number of images to generate (1–9)                                      |
| `-f, --format <format>`      | no       | `webp`  | One of `png` `jpg` `webp`                                               |
| `--reference <urls>`         | no       |         | Comma-separated http(s) URLs used as subject references                 |
| `--debug`                    | no       |         | Print the HTTP request/response to stderr (token masked)                |

**Output path rules**

- If `--output` ends with `.png` / `.jpg` / `.jpeg` / `.webp`, that extension wins over `--format`.
- `n === 1` → writes `<base>.<format>`.
- `n > 1` → writes `<base>-1.<format>`, `<base>-2.<format>`, …
- Never overwrites. If any target file already exists, the command aborts before calling the API.

**Examples**

```bash
# Single image; extension picks the format
minimax image "a cat on the moon" -o ./out/cat.png -r 1:1

# Batch of three — files become venice-1.png, venice-2.png, venice-3.png
minimax image "venice beach, film grain" -o ./out/venice.png -r 16:9 -n 3

# No extension + default format (webp)
minimax image "phone wallpaper, neon city" -o ./out/wall -r 9:16

# Reference images for subject consistency
minimax image "the same character at sunset beach" \
  -o ./out/char.png -r 16:9 \
  --reference https://example.com/char-1.png,https://example.com/char-2.png
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
  "imageModel": "image-01"
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
