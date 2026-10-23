# Cloudflare Workers移行記録

作業日：2026年10月23日（日本時間）。`generate-dragon-service`の移行記録と実装を参照し、`generate-robot`をWorkersへ移行した。

## 実装

- `discord.js`の常駐Gateway接続を、`POST /interactions`のHTTP受信へ変更した。
- Ed25519署名とタイムスタンプを検証し、PINGにはPONGを返す。
- `/generate_robot content`の入力形式と、返信ファイル名`hapyou-robot.png`を維持した。
- 画像生成前に遅延応答を返し、`ctx.waitUntil()`で生成と元の応答の更新を行う。
- `canvas`を`opentype.js`と`@resvg/resvg-wasm`へ変更した。日本語をSVGのパスへ変換し、1802×836pxのPNGにする。
- 元の画像とフォントをStatic Assetsから読み込む。未使用の音声4ファイルは`.assetsignore`でアップロード対象から除外した。
- 長文は文字の輪郭を含めて吹き出し内へ縮小する。`\n`と実改行に対応し、入力は1000文字・40行以内とした。
- コマンド登録を`scripts/register-commands.ts`へ分離した。POSTによる追加・更新なので他のコマンドを一括削除しない。
- 旧Node.js起動コード、Docker関連ファイル、`env-read.sh`、`discord.js`、`canvas`、`ts-node`を削除した。
- WorkerにBotトークンは配置しない。ローカル`.env`に登録用トークンとApplication ID、本番Secretとローカル`.dev.vars`に公開署名鍵を配置した。

既存のローカル`package.json`とロックファイルには依存更新があったため、それを確認したうえでWorkers構成に必要な依存へ置き換えた。

## 検証

型チェック、Wranglerのデプロイ用ビルド、差分の空白チェックが成功した。実際のWorkerコードと素材をworkerdで動かす11件の統合テストがすべて成功した。

1. ヘルスチェック・ルート・素材の直接公開をしないこと
2. 署名付きPING、無署名・不正署名・期限切れ署名の拒否
3. JSON破損・リクエストサイズ超過の拒否
4. 日本語と複数行の描画
5. 文字列の`\n`と実改行の出力一致
6. 長文と特殊文字の描画
7. XML特殊文字の可視描画
8. 40行の描画と吹き出し外へのはみ出し防止
9. 同時リクエストの生成結果の分離
10. 空入力・入力上限超過・未知のコマンドへの即時エラー
11. Discordへの送信失敗・添付サイズ上限超過時の遅延応答更新

生成成功ケースはすべて1802×836pxのPNG。通常の日本語の生成画像と一覧画像を開いて見た目も確認した。検証画像・一覧・処理時間は`.wrangler/generation-validation/`へ保存している。再実行は`npm test`。

Discordへの送信はテスト内で差し替えている。本番Discordでのコマンド実行・画像投稿、本番画像生成のCPU時間とメモリ使用量は未確認。

## 本番への反映

| 項目 | 内容 |
| --- | --- |
| Worker | `generate-robot` |
| 本番URL | <https://generate-robot.chigansub.workers.dev> |
| Discord受信URL | <https://generate-robot.chigansub.workers.dev/interactions> |
| バージョン | `ca4c1862-37f3-454a-842a-bcf0581e5446` |
| Discordアプリ | 鬼畜bot（`1321830027851206678`） |
| コマンド | `/generate_robot`、必須引数`content` |
| Secret | `DISCORD_PUBLIC_KEY`（`secret_text`） |
| 素材 | PNG画像とTTFフォントの2ファイル、`ASSETS` binding |

保存済みWrangler認証と既存Botトークンで移行対象を照合した。検証済みコードを`npm run deploy -- --secrets-file .wrangler/deploy/secrets.json`でデプロイし、`npm run register-commands`でグローバル登録を更新した。

Discord公式APIでInteractions Endpoint URLをWorkerに更新し、Discord自身の署名付きPING検証と設定保存が成功した。更新後にアプリ情報とコマンドを再取得して受信URLと引数を確認した。本番ヘルスチェックは200、無署名のInteractionは401、素材への直接アクセスは404だった。

HTTP受信に変更したため、オンライン表示とアクティビティ設定は引き継がない。以前の常駐プロセスを運用している場合は別途停止する必要がある。今回、旧ホスト上のプロセス操作は行っていない。

本番デプロイは検証済みのローカル作業ツリーから行った。実値を含む`.env`・`.dev.vars`と`.wrangler/`内のデプロイ用ファイルはGit管理対象外とし、ソース・設定例・検証コード・本記録をバージョン管理する。
