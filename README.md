# Calagopus Chat

A native Calagopus Panel extension that adds an always-available, theme-aware chat widget. It supports direct messages, group conversations, unread counts, and private AI conversations backed by an administrator-configured OpenAI-compatible chat-completions API.

## Features

- A compact bottom-right chat bar when minimized and a small conversation window when expanded.
- Direct messages and named group chats between active panel users.
- Conversation history and unread message counts persisted in PostgreSQL.
- AI chats using an OpenAI-compatible `/chat/completions` endpoint.
- An extension configuration page under **Admin → Extensions → Calagopus Chat** for the AI URL, model, API key, system prompt, and enable switch.
- API keys are stored through Calagopus's encrypted extension-settings API; chat content and API keys are not written to activity-log payloads.
- Mantine components and theme CSS variables keep the widget aligned with the active light/dark theme and custom panel palettes.

## Extension layout

The extension source lives in `backend-extensions/com_calagopus_chat/`, using the canonical directory structure from the [official extension file-structure guide](https://calagopus.com/docs/panel/extensions/file-structure). Its dotted package name is `com.calagopus.chat`.

This repository is the extension source, not a full Panel checkout. The Rust manifest intentionally uses Calagopus workspace dependencies. To develop it locally, copy `backend-extensions/com_calagopus_chat/` into a matching Calagopus Panel checkout under `backend-extensions/`, then follow the official [development environment](https://calagopus.com/docs/panel/extensions/dev-environment) and [installation](https://calagopus.com/docs/panel/extensions/installing-extensions) guides. Extensions require the Heavy image or a full development environment.

For source development in the Panel checkout:

```bash
cd frontend
pnpm install
pnpm build:fast
cd ..
cargo build --profile heavy-release
```

The extension targets Calagopus Panel `>=1.2.5`. Its frontend uses the official global page slot, frontend API helpers, and extension configuration page; the backend uses Rust routes, extension settings, permissions, and SQL migrations.

## Configure AI

1. Install and enable **Calagopus Chat** in the Panel.
2. Open **Admin → Extensions → Calagopus Chat → Configure**.
3. Enter an OpenAI-compatible base URL (for example, `https://api.openai.com/v1`), model name, and API key.
4. Adjust the system prompt and enable AI chat.

The extension appends `/chat/completions` to the configured base URL. The API key is never returned by the admin settings endpoint; leave its field blank to preserve the saved key or select **Remove the stored API key** to clear it.

## Official documentation

- [Extensions overview](https://calagopus.com/docs/panel/extensions/)
- [Extension file structure](https://calagopus.com/docs/panel/extensions/file-structure)
- [Mounting UI](https://calagopus.com/docs/panel/extensions/concepts/mounting-ui)
- [Settings](https://calagopus.com/docs/panel/extensions/concepts/settings)
- [Routing](https://calagopus.com/docs/panel/extensions/concepts/routing)
- [Permissions](https://calagopus.com/docs/panel/extensions/concepts/permissions)
- [Theming](https://calagopus.com/docs/panel/extensions/concepts/theming)
