# FPL侍 データサイト

FPL（Fantasy Premier League）公式APIのデータを日本語で表示する**静的サイト**。
GitHub Pages で公開（https://fplsamurai.github.io/fpl-samurai/）。動画素材・X投稿素材としての利用が主目的。

## アーキテクチャ / データフロー

```
FPL公式API ──(scripts/update.py)──▶ data/raw/（生データ・gitignore）
                                  ──▶ data/site/data.json ──コピー──▶ public/data.json
public/ ──(git push main)──▶ GitHub Actions（.github/workflows/deploy.yml）──▶ GitHub Pages
                              ▲
                   1日3回のスケジュール実行でも update.py を回して自動コミット＋公開
```

- **public/ がサイト本体**（index.html / app.js / style.css / data.json / icons/）。ビルド工程なし。
- `public/data.json` は **update.py の生成物。手で編集しない**。
- ブラウザからFPL APIを直接呼べない（CORS）ため、マイチーム検索・ミニリーグ順位・
  ホームのYouTube最新動画は **自前の中継**（Cloudflare Worker）経由。
  - コードは `worker/fpl-proxy.js`、URLは `https://fpl-proxy.fpltaro39.workers.dev`。
    app.js 側の入口は `PROXY` と `proxyFetchText(query)` の2つだけ。
  - 受け口は `?path=<FPL APIのパス>` と `?yt=1`（YouTube RSS）の2種類のみ。
    **中継先とパスは Worker 側の allowlist で絞ってある**。素通しの公開プロキシにすると
    踏み台にされて無料枠（1日10万リクエスト）を食い潰されるため、ここは緩めない。
    呼び出し元も `ALLOWED_ORIGINS`（本番＋localhost）に限定。Origin無しは403。
  - 2026-08-28に無料の公開プロキシ（allorigins / corsproxy）から移行した。corsproxy は
    有料化で401、allorigins は520で落ち、**2本同時に死んでスカッドが表示できなくなった**。
    代替の公開プロキシも4本試して全滅。他人の無料サービスに依存する構成には戻さない。
  - 実測：`event/{gw}/live/`（436KB）が allorigins は19.7秒で522、自前Workerは0.37秒。
    エッジキャッシュありでMISS 0.34秒→HIT 0.19秒。`PROXY_TIMEOUT` は10秒。
  - Worker を直したときは **Cloudflareのダッシュボードに貼り直すのを忘れない**
    （`wrangler.jsonc` はGit連携に切り替える場合用。CLIはNode未導入のため使えない）。

## コマンド

| やること | コマンド |
|---|---|
| データ更新＋コミット＋プッシュ（自動更新を待たず今すぐ反映したいとき） | `./update.sh` |
| データ更新のみ | `python3 scripts/update.py` |
| ローカル確認 | `python3 scripts/serve.py` → http://localhost:8000 |

- update.py は選手ごとに element-summary を取得するため**数分かかる**（12時間キャッシュあり、再実行は速い）。
- Claude のプレビュー（launch.json の `fpl-site`）はサンドボックスの制約で `~/Downloads` を直接配信できない。
  **`cp -R public/. /tmp/fplpreview/` で同期してから** preview_start すること（編集のたびに再同期が必要）。

## 自動更新（deploy.yml のスケジュール実行）

- cron は `37 1,7,13 * * *`（＝10:37 / 16:37 / 22:37 JST 目安）。**1日3回**。
- **GitHubのスケジュール実行はベストエフォートで、指定時刻には走らない。**
  00分指定（`0 1 * * *`）だった頃の実績は最短でも +1.2時間、最長 +3.7時間の遅れ。
  2026-08-28 には**実行そのものが破棄された**。負荷が集中する毎時00分を避け、
  1枠落とされても次で拾えるよう3枠にしてある。それでも遅延・欠落する前提で考える。
- 2回目以降の実行は重い element-summary が12時間キャッシュに当たるので数十秒で終わる。
  ポイント・価格・保有率（bootstrap-static）はキャッシュ対象外なので毎回更新される。
- `meta.data_fresh` は**生成時点のAPI取得成否**でしかなく、更新が丸ごと飛んだ場合は
  前回の `true` が残る。「データが古い」判定は app.js 側で `meta.generated_at` と
  現在時刻を比べて別に行う（`dataAgeHours()` / `STALE_HOURS`）。
- **鮮度の警告を画面に出してはいけない。** このサイトは画面をそのまま動画・X投稿の素材に
  するため、帯やバッジが写り込むと使えなくなる。異常は `console.warn` に留め、
  訪問者向けの手がかりは既存の「最終更新」の行だけにする。
- **60日間 push が無いとスケジュールが自動停止する**（GitHubの仕様）。長期放置に注意。

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
  - **画像のローカル保存は禁止。** フッターに「選手写真・クラブエンブレムは当サイトで
    複製・保存しておらず」と明記しているため、リポジトリや data.json に画像を持たせると
    **この記述が虚偽になる**。「CDNが遅いから手元に置く」は選択肢に入れない。
    現状：保存しているのは自前の logo/favicon/icons/pitch のみ、data.json は画像IDの文字列だけ。
  - 権利者が配信を止めれば画像は自動的に消える（削除スイッチが相手側にある）。
    これは免責文より実質的な防御なので、この構造自体を維持することに価値がある。
- ランキングは `DISPLAY_LIMIT = 120` 件まで（update.py）
- 列設定は localStorage 保存。**標準の列構成を変えたら `CONFIG_KEY` のバージョンを上げる**（全ユーザーに新標準を適用するため）
