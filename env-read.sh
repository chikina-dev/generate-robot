#!/bin/bash
# .envファイルを読み込んで環境変数を設定してts-nodeを実行するスクリプト
# dotenvを使うなんてダサいから自前でやる

export NODE_ENV=development

# .envファイルが存在するか確認
if [ -f .env ]; then
  # .envファイルの各行を読み込んで環境変数としてエクスポート
  export $(grep -v '^#' .env | xargs)
fi

# ts-nodeを実行
ts-node ./main.ts
