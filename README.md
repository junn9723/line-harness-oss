# LINE Harness

LINE公式アカウントの完全オープンソース CRM。Docker 1コマンドで VPS にデプロイ。

---

## なぜ LINE Harness？

| | L社 | U社 | **LINE Harness** |
|---|---|---|---|
| 月額 | 2万円〜 | 1万円〜 | **VPS代のみ** |
| ステップ配信 | ✅ | ✅ | ✅ |
| セグメント配信 | ✅ | ✅ | ✅ |
| リッチメニュー切替 | ✅ | ✅ | ✅ |
| フォーム | ✅ | ✅ | ✅ |
| スコアリング | ✅ | ❌ | ✅ |
| IF-THEN 自動化 | 一部 | 一部 | ✅ |
| API 公開 | ❌ | ❌ | **全機能** |
| AI (Claude Code) 対応 | ❌ | ❌ | **✅** |
| BAN 検知 & 自動移行 | ❌ | ❌ | **✅** |
| マルチアカウント | 別契約 | 別契約 | **標準搭載** |
| ソースコード | 非公開 | 非公開 | **MIT** |

---

## クイックスタート

### 前提条件

- Docker / Docker Compose
- [LINE Developers アカウント](https://developers.line.biz/)（Messaging API チャネル）

### 1. セットアップ

```bash
git clone https://github.com/junn9723/line-harness-oss.git
cd line-harness-oss
cp .env.docker.example .env
```

### 2. 環境変数の設定

`.env` を編集:

```env
# --- 必須 ---
LINE_CHANNEL_SECRET=your-line-channel-secret
LINE_CHANNEL_ACCESS_TOKEN=your-line-channel-access-token
API_KEY=your-secure-api-key          # 管理画面ログイン用

# --- サーバー ---
WORKER_URL=http://your-server-ip:8787   # 公開URL（Webhook等で使用）
PORT=8787

# --- 管理画面 ---
NEXT_PUBLIC_API_URL=http://your-server-ip:8787  # ビルド時に埋め込み
```

> `NEXT_PUBLIC_API_URL` はビルド時に静的ファイルへ埋め込まれます。変更時は `docker compose build --no-cache` で再ビルドが必要です。

### 3. 起動

```bash
docker compose up -d
```

### 4. 動作確認

```bash
# ヘルスチェック
curl http://localhost:8787/health

# API 疎通
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:8787/api/friends/count
```

### 5. 管理画面にログイン

ブラウザで `http://your-server-ip:8787/admin/` にアクセスし、`.env` の `API_KEY` でログイン。

### 6. LINE Webhook 設定

[LINE Developers Console](https://developers.line.biz/console/) → Messaging API → Webhook URL:

```
http://your-server-ip:8787/webhook
```

---

## 技術スタック

```
LINE Platform ──→ Hono (Node.js) ──→ SQLite
                       ↑                 ↑
                 node-cron (5分毎)   42 テーブル
                       ↓
                LINE Messaging API

Next.js (管理画面) ──→ API ──→ SQLite
Claude Code ──→ API ──→ SQLite
```

| レイヤー | 技術 |
|---------|------|
| API / Webhook | Node.js + Hono |
| データベース | SQLite (better-sqlite3) — 42 テーブル |
| 管理画面 | Next.js 14 (App Router) + Tailwind CSS |
| ストレージ | ローカルファイルシステム |
| 定期実行 | node-cron (5分毎) |
| コンテナ | Docker (Node.js 22-slim) |

---

## プロジェクト構成

```
line-harness-oss/
├── apps/
│   ├── worker/           # API サーバー (Hono on Node.js)
│   └── web/              # Next.js 管理画面 (静的エクスポート)
├── packages/
│   ├── db/               # SQLite スキーマ + クエリ (42テーブル)
│   ├── line-sdk/         # LINE Messaging API ラッパー
│   └── shared/           # 共有型定義
├── Dockerfile            # マルチステージビルド
├── docker-compose.yml    # ワンコマンドデプロイ
└── .env.docker.example   # 環境変数テンプレート
```

---

## データ永続化

| データ | 保存先 | Docker Volume |
|--------|--------|---------------|
| SQLite DB | `/app/data/line-harness.db` | `harness-db` |
| アップロード画像 | `/app/data/images/` | `harness-db` |

```bash
# バックアップ
docker cp line-harness-worker:/app/data ./backup

# リストア
docker cp ./backup/. line-harness-worker:/app/data
```

---

## 運用コマンド

```bash
# 起動 / 停止
docker compose up -d
docker compose down

# ログ確認
docker compose logs -f

# 再ビルド（NEXT_PUBLIC_API_URL 変更時は --no-cache）
docker compose build --no-cache
docker compose up -d

# コンテナ状態
docker compose ps
```

---

## 認証

- **管理画面**: `.env` の `API_KEY` でログイン（Owner 権限）
- **API**: `Authorization: Bearer <API_KEY>` ヘッダー
- **スタッフ管理**: ログイン後、管理画面からスタッフ追加・API Key 発行可能
- **ロール**: `owner` > `admin` > `staff`

---

<details>
<summary><strong>全機能一覧（クリックで展開）</strong></summary>

### 配信
- **ステップ配信** — delay_minutes で分単位制御、条件分岐、ステルスモード
- **即時配信** — ブロードキャスト即時送信、個別メッセージ即時送信
- **ブロードキャスト** — 全員/タグ/セグメント配信、即時 or 予約配信、バッチ送信
- **リマインダー** — 指定日からのカウントダウン配信（セミナー3日前、1日前、当日）
- **テンプレート** — メッセージテンプレートの管理・再利用
- **テンプレート変数** — `{{name}}`, `{{uid}}` で友だちごとにパーソナライズ
- **配信時間帯制御** — 9:00-23:00 JST のみ配信

### CRM
- **友だち管理** — Webhook 自動登録、プロフィール取得、カスタムメタデータ
- **タグ** — セグメント分け、配信条件、シナリオトリガー
- **スコアリング** — 行動ベースのリードスコア自動計算
- **オペレーターチャット** — 管理画面から直接 LINE 返信

### マーケティング
- **リッチメニュー** — ユーザー別・タグ別のメニュー切替
- **トラッキングリンク** — クリック計測 + 自動タグ付け + シナリオ開始
- **フォーム (LIFF)** — LINE 内で完結するフォーム、回答→メタデータ自動保存

### 自動化
- **IF-THEN ルール** — 7種のトリガー × 6種のアクション
- **自動返信** — キーワードマッチ（完全一致/部分一致）
- **Webhook IN/OUT** — 外部サービス連携（Stripe, Slack 等）
- **通知ルール** — 条件付きアラート配信

### 安全性
- **BAN 検知** — アカウントヘルスの自動監視（normal/warning/danger）
- **アカウント移行** — BAN 時のワンクリック移行（友だち・タグ・シナリオ引き継ぎ）
- **ステルスモード** — 送信ジッター、バッチ間隔ランダム化
- **マルチアカウント** — 複数 LINE アカウントを 1 サーバーで管理

### 分析
- **CV 計測** — コンバージョンポイント定義 → イベント記録 → レポート
- **アフィリエイト** — コード発行、クリック追跡、報酬計算
- **流入元追跡** — 友だち追加経路を自動記録

</details>

---

## API エンドポイント（抜粋）

25 のルートファイル、100+ エンドポイント。

```bash
# 友だち一覧
GET  /api/friends?limit=20&offset=0&tagId=xxx

# シナリオ作成
POST /api/scenarios
{ "name": "ウェルカム", "triggerType": "friend_add" }

# ステップ追加
POST /api/scenarios/:id/steps
{ "stepOrder": 0, "delayMinutes": 0, "messageType": "text", "messageContent": "ようこそ！" }

# ブロードキャスト予約
POST /api/broadcasts
{ "title": "セール", "messageType": "text", "messageContent": "50% OFF!", "targetType": "all" }

# 自動化ルール作成
POST /api/automations
{ "name": "友だち追加→タグ", "eventType": "friend_add", "actions": [{"type": "add_tag", "params": {"tagId": "xxx"}}] }
```

---

## 環境変数一覧

| 変数 | 必須 | 説明 |
|------|------|------|
| `LINE_CHANNEL_SECRET` | Yes | LINE Messaging API のチャネルシークレット |
| `LINE_CHANNEL_ACCESS_TOKEN` | Yes | LINE Messaging API のアクセストークン |
| `API_KEY` | Yes | 管理API認証用 Bearer トークン |
| `WORKER_URL` | Yes | サーバーの公開URL |
| `NEXT_PUBLIC_API_URL` | Yes | ブラウザからの API 接続先（ビルド時埋め込み） |
| `PORT` | No | 公開ポート（デフォルト: 8787） |
| `CRON_SCHEDULE` | No | 定期実行間隔（デフォルト: `*/5 * * * *`） |
| `LINE_LOGIN_CHANNEL_ID` | No | LINE Login チャネルID（UUID取得用） |
| `LINE_LOGIN_CHANNEL_SECRET` | No | LINE Login チャネルシークレット |
| `LIFF_URL` | No | LIFF アプリURL |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe Webhook シークレット |

---

## ライセンス

MIT
