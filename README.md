# NeuraChat

A simple Android SMS and calling app.

## Features

- **SMS** — send and receive text messages
- **Calls** — dial, receive, and view call logs
- **Contacts** — sync from device, add manually, favorites

## Tech Stack

- Next.js 15 (App Router, static export)
- React 19
- Capacitor 8 (Android)
- IndexedDB (local storage)
- Tailwind CSS 4

## Build

Android APK builds run on **GitHub Actions** (`.github/workflows/build.yml`).

Workflow:
1. Push to `main`
2. GitHub Actions builds Next.js static export
3. Capacitor wraps it into an Android project
4. Custom native Java files + AndroidManifest are injected
5. Gradle assembles a debug APK
6. APK is uploaded as a workflow artifact

Download the APK from the **Actions** tab → latest run → **Artifacts**.

## Package

`com.neurasamu.build.chat`
