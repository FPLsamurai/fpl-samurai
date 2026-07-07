# FPL侍 データサイト

FPL（Fantasy Premier League）公式APIのデータを日本語で表示する**静的サイト**。
GitHub Pages で公開（https://fplsamurai.github.io/fpl-samurai/）。動画素材・X投稿素材としての利用が主目的。

## アーキテクチャ / データフロー

```
FPL公式API ──(scripts/update.py)──▶ data/raw/（生データ・gitignore）
                                  ──▶ data/site/data.json ──コピー──▶ public/data.json
public/ ──(git push main)──▶ GitHub Actions（.github/workflows/deploy.yml）──▶ GitHub Pages
```

- **public/ がサイト本体**（index.html / app.js / style.css / data.json / icons/）。ビルド工程なし。
- `public/data.json` は **update.py の生成物。手で編集しない**。
- ブラウザからFPL APIを直接呼べない（CORS）ため、マイチーム検索とYouTube RSSは
  **無料中継プロキシ**（app.js の `PROXIES`: allorigins → corsproxy の順）経由。遅い・たまに失敗する前提で書く。

## コマンド

| やること | コマンド |
|---|---|
| データ更新＋コミット＋プッシュ（週次運用） | `./update.sh` |
| データ更新のみ | `python3 scripts/update.py` |
| ローカル確認 | `python3 scripts/serve.py` → http://localhost:8000 |

- update.py は選手ごとに element-summary を取得するため**数分かかる**（12時間キャッシュあり、再実行は速い）。
- Claude のプレビュー（launch.json の `fpl-site`）はサンドボックスの制約で `~/Downloads` を直接配信できない。
  **`cp -R public/. /tmp/fplpreview/` で同期してから** preview_start すること（編集のたびに再同期が必要）。

## シーズン依存の定数（毎年7〜8月に更新が必要）

- `public/app.js` の `PHOTO_BASE`：`premierleague25` → 新シーズンは `premierleague26` に（25=25/26シーズンの意味）
- `scripts/update.py` の `TEAM_JA`：昇格・降格でチーム略称→日本語名の20件を差し替え
- `data/japanese_names.json`：新加入選手のカタカナを追記（`_`始まりのキーは説明用で無視される）
- FPL APIの新シーズン反映は例年**7月下旬〜8月頭**。それまで旧シーズンの最終状態が返る

## 規約・注意

- コメント・コミットメッセージは**日本語**。コミットは「何をどう変えたか」を1行に詰める既存スタイルに合わせる
- JSは**素のJavaScript**（ライブラリ不使用）、Pythonは**標準ライブラリのみ**。この方針を維持する
- CSSは**スマホ最優先**（縦画面での表の見やすさが最重要）
- git push は **SSH**（remote に HTTPS トークンを埋め込まない）
- 選手写真・エンブレムは公式CDNへのホットリンク（著作権・肖像権のグレーゾーンと認識済み。
  再アップロードは絶対にしない。`PHOTO_BASE` 1か所で止められる構造を維持する）
- ランキングは `DISPLAY_LIMIT = 120` 件まで（update.py）
- 列設定は localStorage 保存。**標準の列構成を変えたら `CONFIG_KEY` のバージョンを上げる**（全ユーザーに新標準を適用するため）
