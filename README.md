# generate-robot

Cloudflare Workers上で動くDiscord Botです。`/generate_robot content:...`で、鬼畜ロボットの吹き出しにテキストを入れた1802×836pxのPNGを返します。`\n`と実改行に対応し、長文は吹き出し内に収まるように縮小します。入力は1000文字・40行以内です。

DiscordのHTTP Interactionsを受信し、Ed25519署名を検証して遅延応答を返します。`opentype.js`で日本語をSVGのパスにし、`@resvg/resvg-wasm`でPNGへ変換した後、元の応答を画像付きで更新します。

本番URL：<https://generate-robot.chigansub.workers.dev>。本番への反映内容と確認範囲は[移行記録](docs/cloudflare-workers-migration.md)にまとめています。

## 開発

Node.js 22.18.0以降を使用します。

```sh
npm ci
cp .dev.vars.example .dev.vars
cp .env.example .env
npm run typegen
npm run dev
```

`.dev.vars`の`DISCORD_PUBLIC_KEY`にDiscord Developer Portalの公開署名鍵を設定します。`.env`にはコマンド登録用の`DISCORD_APPLICATION_ID`と`DISCORD_BOT_TOKEN`を設定します。`DISCORD_GUILD_ID`を指定すると、その開発サーバー内だけに登録します。

| 設定 | 用途 |
| --- | --- |
| `DISCORD_PUBLIC_KEY` | Workerで受信リクエストの署名を検証。本番はWorkers Secret、ローカルは`.dev.vars` |
| `DISCORD_APPLICATION_ID` | コマンド登録するアプリのID。ローカルの`.env`のみ |
| `DISCORD_BOT_TOKEN` | コマンド登録用トークン。ローカルの`.env`のみ。Workerには不要 |
| `DISCORD_GUILD_ID` | 任意の開発サーバーID。省略するとグローバル登録 |
| `ASSETS` | 素材画像と日本語フォントのStatic Assets binding |

## 素材

次の2ファイルが必要です。画像はGit管理外なので、別のチェックアウトにも配置してください。

- `public/img/robot.png`（1802×836px）
- `public/font/GenJyuuGothic-Normal.ttf`

素材画像の引用元：[ニコニコモンズ nc355601](https://commons.nicovideo.jp/works/agreement/nc355601)。利用条件は引用元を確認してください。

Workerが素材を内部で読み込みます。`public/.assetsignore`で未使用の音声素材をデプロイ対象から除外しています。

## 検証

```sh
npm run check    # TypeScript型チェック
npm run compile  # 型チェックとデプロイ用ビルド（dry run）
npm test         # workerdで署名検証・画像生成・返信処理を検証
```

テストはDiscordへの送信だけを差し替えます。生成PNGと一覧画像、処理時間は`.wrangler/generation-validation/`へ保存します。

## デプロイ

```sh
npx wrangler login
npx wrangler secret put DISCORD_PUBLIC_KEY
npm run deploy
npm run register-commands
```

新しいWorkerでは、署名鍵のSecret登録時に初期Workerが作成される場合があります。初回にコードと鍵をまとめて反映する場合は、Git管理外のJSON（`{"DISCORD_PUBLIC_KEY":"公開署名鍵"}`）を用意し、`npm run deploy -- --secrets-file .wrangler/deploy/secrets.json`を使用できます。

Discord Developer PortalのInteractions Endpoint URLに、公開Workerの`https://<worker-host>/interactions`を設定します。Discordの署名付きPING検証が成功すると受信先が切り替わります。コマンド登録は`generate_robot`だけを追加・更新し、同じアプリの他のコマンドを保持します。

`GET /`がヘルスチェック、`POST /interactions`がDiscord受信口です。HTTP Interactionsへの移行により、Gateway接続によるオンライン表示とアクティビティ設定は使用しません。旧Node.jsプロセスを運用している場合は、切り替え後に停止してください。
