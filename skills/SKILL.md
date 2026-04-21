---
name: minimax
version: 0.1.0
description: "MiniMax CLI: text-to-image generation and web search via the coding-plan endpoint. Use this skill when the user wants to generate images with MiniMax or search the web through MiniMax."
metadata:
  requires:
    bins: ["minimax"]
  cliHelp: "minimax --help"
---

# minimax

Command-line tool for MiniMax. Generate images and run web search from your terminal.

## Install

```bash
pnpm install -g @ikeq/minimax-cli
```

Or one-off via `pnpm dlx`:

```bash
pnpm dlx @ikeq/minimax-cli <command>
```

## Shared basics — read this first

### Config file

Stored at `~/.minimax-cli/config.json`:

```jsonc
{
  "region": "china",        // or "global"
  "token": "<your token>",
  "imageModel": "image-01"
}
```

| Field        | Used by             | Notes                                     |
| ------------ | ------------------- | ----------------------------------------- |
| `region`     | every subcommand    | Determines the base URL (see below)       |
| `token`      | every subcommand    | Bearer token; never printed in plaintext  |
| `imageModel` | `minimax image`     | Default image model (e.g. `image-01`)     |

| Region   | Base URL                   |
| -------- | -------------------------- |
| `china`  | `https://api.minimaxi.com` |
| `global` | `https://api.minimax.io`   |

### Prerequisite check

Before invoking any subcommand, confirm the config file exists and contains `region` and `token`. If it does not, tell the user to set it up themselves. **Never** edit the JSON manually and **never** invent flags like `--token` or `--region` — configuration is file-based only.

### Debug flag

Every command that calls the MiniMax API accepts `--debug`:

- Prints the outgoing request and response to **stderr**.
- The `Authorization` header is automatically masked to `Bearer first6...last6`.
- Large base64 payloads are truncated.

## Commands

Read the matching reference based on user intent:

| Command  | When to use                                             | Reference |
| -------- | ------------------------------------------------------- | --------- |
| `image`  | Text-to-image generation, reference images, batch output | [`references/image.md`](references/image.md) |
| `search` | Web search via the coding-plan endpoint                 | [`references/search.md`](references/search.md) |

## Agent rules

- **Always read the shared basics section above before running any subcommand.**
- Prefer command references over general shell knowledge; their workflows already cover edge cases (MD5 file naming, reference URL validation, etc.).
- **Do not** invent flags that are not listed in the command references.
- **Do not** read `~/.minimax-cli/config.json` into another command's argv; every subcommand loads it automatically.
