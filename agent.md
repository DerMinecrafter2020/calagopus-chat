# Agent instructions

## Extension identity and layout

- The Calagopus package name is `com.calagopus.chat`; its extension directory is `backend-extensions/com_calagopus_chat`.
- Keep the extension compatible with the official Calagopus extension layout and APIs. The minimum supported Panel version is set in `backend-extensions/com_calagopus_chat/Metadata.toml`.
- The Panel `panel_version` requirement describes Panel API compatibility. It is **not** the extension release version; change it only when the extension needs a newer Panel API.
- The Rust backend and extension settings live in `backend-extensions/com_calagopus_chat/src/`. The React frontend lives in `backend-extensions/com_calagopus_chat/frontend/`. Database migrations live in `backend-extensions/com_calagopus_chat/migrations/`.
- Keep the AI provider key in Calagopus encrypted extension settings. Never return it from an API endpoint, commit it, or include it in logs or release notes.

## Extension versioning

Use a three-part version in `MAJOR.MINOR.PATCH` order. Keep these values identical:

- `backend-extensions/com_calagopus_chat/Cargo.toml` → `[package].version`
- `backend-extensions/com_calagopus_chat/frontend/package.json` → `version`
- The Git tag, prefixed with `v` (for example, `v0.1.1`)

Start from the current version, `0.1.1`, and count from the rightmost component. Increment that component through `10`; when it reaches `10`, reset it to `0` and increment the component to its left. Apply the same rollover to the middle component. Examples:

```text
0.1.1 → 0.1.2 → … → 0.1.10 → 0.2.0
0.2.10 → 0.3.0
0.10.10 → 1.0.0
```

After `9.10.10`, the next version is `10.0.0`; the major component can continue above 10. Do not add leading zeroes. Before a release, update both package version fields, commit the change, and tag that commit with the matching `vMAJOR.MINOR.PATCH` value. Do not reuse or force-move a published release tag.

## GitHub release and `.c7s.zip`

The `.github/workflows/release.yml` workflow automatically checks pushes to `main` and `master`. When the Cargo and frontend versions match and the corresponding tag does not already exist, it builds against Panel releases 1.2.3 and 1.2.4 on isolated GitHub runners. Cargo and pnpm dependency caches speed up repeated builds. A failed preflight blocks packaging and publication. After both builds pass, it creates the version tag and a GitHub Release with `com_calagopus_chat.c7s.zip`. Pushes of `v*` tags and manual runs are also supported.

For an automatic release:

1. Run the official pre-export checks from a matching Calagopus Panel checkout (Rust formatting/linting and the frontend formatting/build checks).
2. Update both package version fields to the same unused version and commit the changes.
3. Push the commit to `main` or `master`. The workflow derives the `vMAJOR.MINOR.PATCH` tag and creates the GitHub Release after preflight succeeds. A regular code push without a version bump will not create a release.

4. Check the repository's **Actions** tab. When the workflow succeeds, download the `.c7s.zip` from the generated GitHub Release.

To start a release manually, use **Actions → Release Calagopus Chat → Run workflow**, select the branch containing the release files, and enter the version tag. For the current manifests, that tag is `v0.1.1`.

If an earlier failed run already left a tag pointing at a commit with the wrong package version, remove and recreate that tag only if no GitHub Release was published for it. Never move or reuse a tag for a published release; bump to the next version instead.

The archive layout must have `Metadata.toml` at its root, Rust sources and `Cargo.toml` under `backend/`, frontend sources and `package.json` under `frontend/`, and SQL migrations under `migrations/`. Do not include the Panel-generated `frontend/tsconfig.json`, `node_modules`, or an extra enclosing `com_calagopus_chat/` directory.

For manual export from the Panel repository, use the official command from the Panel root:

```bash
panel-rs extensions export com.calagopus.chat
```

It writes `exported-extensions/com_calagopus_chat.c7s.zip`. See the [official extension release guide](https://calagopus.com/docs/panel/extensions/getting-your-extension-ready) for pre-export checks and details.
