#!/bin/bash
# ============================================================
# FPL侍 週1回の更新コマンド（これ1つでOK）
#
# 使い方:
#   ./update.sh
#
# やること:
#   1. 最新データを取得して集計（scripts/update.py）
#   2. GitHubにつながっていれば、自動でコミット＆プッシュ（＝公開サイトに反映）
# ============================================================

# このスクリプトがある場所へ移動（どこから実行してもOKにする）
cd "$(dirname "$0")" || exit 1

echo "▼ ステップ1: 最新データを取得・集計します"
python3 scripts/update.py
if [ $? -ne 0 ]; then
  echo "✗ データ更新でエラーが出ました。上のメッセージを確認してください。"
  exit 1
fi

echo ""
echo "▼ ステップ2: GitHubへの反映"

# gitリポジトリかどうか
if [ ! -d ".git" ]; then
  echo "・まだGitHubの設定がされていません（gitリポジトリではありません）。"
  echo "  → 公開の準備は README.md の手順を見てください。"
  echo "  データの更新だけは完了しています。"
  exit 0
fi

# リモート（GitHub）が設定されているか
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "・GitHubの接続先（リモート）がまだ設定されていません。"
  echo "  → 初回の公開設定は README.md の手順を見てください。"
  echo "  データの更新だけは完了しています。"
  exit 0
fi

# 変更があるか確認
if git diff --quiet && git diff --cached --quiet; then
  echo "・データに変更はありませんでした（更新の必要なし）。"
  exit 0
fi

# 変更をコミットして公開
TODAY=$(date "+%Y-%m-%d")
git add data/site/data.json public/data.json 2>/dev/null
git commit -m "データ更新 ${TODAY}"
echo "・GitHubへアップロードします…"
git push
if [ $? -eq 0 ]; then
  echo ""
  echo "✅ 完了！数分後に公開サイトへ反映されます。"
else
  echo ""
  echo "⚠ アップロードに失敗しました。ネット接続やGitHubの設定を確認してください。"
  exit 1
fi
