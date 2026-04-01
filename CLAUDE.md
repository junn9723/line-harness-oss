# LINE Harness OSS - Project Guide

## Overview

LINE公式アカウント向けCRM。Cloudflare Workers (Hono) + Next.js 管理画面のモノレポ構成。
`claude/docker-single-vps-setup-Gg5tF` ブランチで Docker/VPS デプロイに対応。

## Architecture

```
apps/
  worker/    — API サーバー (Hono on Node.js / Cloudflare Workers)
  web/       — 管理画面 (Next.js, static export → /admin/ で配信)
packages/
  db/        — データベース層 (D1 / SQLite, d1-shim で互換)
  shared/    — 共有型・ユーティリティ
  line-sdk/  — LINE Messaging API クライアント
```

## Docker Deployment (Single VPS)

### Quick Start
```bash
cp .env.docker.example .env
# .env を編集 (LINE credentials, API_KEY, WORKER_URL)
docker compose up -d
```

### Key Points

- **ポート**: ホスト側 `${PORT}` (default 8080) → コンテナ内 8787
- **サーバーIP**: `162.43.5.74`
- **管理画面**: `http://162.43.5.74:8080/admin/`
- **API**: `http://162.43.5.74:8080/api/...` (要 `Authorization: Bearer <API_KEY>`)
- **ヘルスチェック**: `http://162.43.5.74:8080/health`
- **データ永続化**: Docker volume `harness-db` → `/app/data/` (SQLite + images)

### Environment Variables (.env)

必須:
- `LINE_CHANNEL_SECRET` — LINE Messaging API
- `LINE_CHANNEL_ACCESS_TOKEN` — LINE Messaging API
- `API_KEY` — 管理API認証用 Bearer トークン
- `WORKER_URL` — サーバーの公開URL (例: `http://162.43.5.74:8080`)
- `NEXT_PUBLIC_API_URL` — ブラウザからのAPI接続先 (**ビルド時に埋め込まれる**, 変更時は再ビルド必要)

## Local Changes (Uncommitted)

ブランチ元のコードに対して以下を修正済み（未コミット）:

| File | Change |
|---|---|
| `Dockerfile` | `tsconfig.base.json` を base ステージにコピー追加（ビルドエラー修正） |
| `apps/web/next.config.ts` | `basePath: '/admin'` 追加（静的アセットのパス修正） |
| `apps/worker/src/middleware/auth.ts` | `/admin` パスを認証スキップリストに追加 |
| `apps/worker/src/node-entry.ts` | `serveStatic` で `/admin/*` 静的ファイル配信 + `/` → `/admin/` リダイレクト |
| `apps/worker/tsup.node.ts` | `@hono/*` を `noExternal` に追加（バンドル対象化） |

## Auth

- Bearer トークン認証 (`Authorization: Bearer <token>`)
- `staff_members` テーブル → env `API_KEY` フォールバック
- 公開パス: `/webhook`, `/health`, `/docs`, `/images/*`, `/admin/*`, `/api/liff/*`, `/auth/*` 等
- ロール: `owner` > `admin` > `staff`

## Build

```bash
# Docker 再ビルド (NEXT_PUBLIC_API_URL 変更時は --no-cache 必要)
docker compose build --no-cache
docker compose up -d

# ログ確認
docker compose logs -f
```

## Tech Stack

- **Runtime**: Node.js 22 (Docker) / Cloudflare Workers (本番)
- **Framework**: Hono (API), Next.js 14+ (Admin UI)
- **DB**: SQLite via better-sqlite3 (Docker) / D1 (CF Workers)
- **Storage**: Local filesystem (Docker) / R2 (CF Workers)
- **Package Manager**: pnpm 9.15.4
- **Cron**: node-cron (Docker) / Workers Cron Triggers (CF)
