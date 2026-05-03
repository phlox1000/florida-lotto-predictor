# OTA Mobile Update Runbook

## When to use

After any change to mobile code (anything under `mobile/`) lands on `main`, ship that change to installed APKs via Expo Updates. The server side is auto-deployed by Render (with manual click — see `render.yaml` `autoDeployTrigger: "off"`); the client side is OTA-only.

## Two ways to publish

### Option 1 — Automatic via GitHub Actions (preferred)

`.github/workflows/eas-update.yml` already runs on every push to `main` that touches `mobile/**`. It calls:

```bash
pnpm exec eas update --branch production --message "${{ github.event.head_commit.message }}" --non-interactive
```

For this to work the `EXPO_TOKEN` repo secret must be set:

1. Generate at https://expo.dev → Account Settings → Access Tokens.
2. GitHub → repo Settings → Secrets and variables → Actions → New repository secret.
3. Name: `EXPO_TOKEN`. Value: paste the token.

If the secret is set and the workflow ran on the merge of the relevant PR, the update is already published to the `production` channel and you can skip Option 2.

### Option 2 — Manual from a local machine

Use this when:

- The auto-publish workflow is broken or you need to publish to a channel other than `production`.
- The change was a hotfix that needs a more descriptive message than the merge commit.
- You're shipping to a non-default channel (`preview`, `development`).

#### Prerequisites (one-time per machine)

- Local machine with Node 20+ and pnpm.
- `eas-cli` installed: `pnpm add -g eas-cli` (or `npm i -g eas-cli`).
- EAS auth: `eas login` once per machine.

#### Standard manual update flow

```bash
cd mobile

# Confirm auth
eas whoami

# List the installed APK's channel
eas channel:list

# Push update to the channel that matches the installed APK
eas update --branch <channel> --message "<short description of the change>"
```

After publishing, the installed APK fetches the new bundle on next cold launch. The `UpdatePrompt` modal appears within ~5 seconds of launch. User taps "Update Now" → app reloads on the new bundle.

## Verifying the update reached the device

1. Open the installed APK.
2. Look at the build-identity strip at the top of the Analyze screen.
3. The `id` field should change from `embedded` (or a previous update ID) to the new update ID published by `eas update`.
4. The `sha` field should match the first 8 chars of the commit SHA that was on `main` when `eas update` ran.

## If the user has no channel on their installed APK

Older builds were created before EAS Update channels were configured. Those installed APKs cannot receive OTA updates. The user must rebuild and reinstall once:

```bash
cd mobile
eas build --platform android --profile preview
```

After installing the new APK once, all future updates ship OTA.

## Troubleshooting

### "No update available" but you just published

- Confirm `--branch <channel>` matched the installed APK's channel exactly (case-sensitive). The auto-workflow always publishes to `production`; if the installed APK is on a different channel it won't pick that update up.
- Confirm `runtimeVersion` policy in `mobile/app.json` (`{ "policy": "appVersion" }`) — if the installed APK is on a different `version` than what was published, it won't be eligible.

### Update prompt never appears

- Confirm the device is online at app launch.
- Check the build-identity strip — if `id` is `embedded`, the device isn't reaching EAS Update at all.
- Confirm `mobile/App.tsx` still calls `fetchPendingUpdate()` on mount.
- Confirm `Updates.isEnabled` is `true` in production builds.

### App crashes on update

The `applyPendingUpdate` and `fetchPendingUpdate` helpers in `mobile/src/lib/updates.ts` swallow all errors silently. If the app is somehow crashing on update, the bug is elsewhere — check the platform's native crash logs.

### EAS Update workflow shows red on GitHub Actions

Check the workflow logs for `EXPO_TOKEN` errors. If the token is missing or expired, the workflow fails fast with an auth error — rotate the token via https://expo.dev → Access Tokens and update the GitHub secret.
