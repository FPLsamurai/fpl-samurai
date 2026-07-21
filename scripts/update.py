# -*- coding: utf-8 -*-
"""
FPL侍 データ更新スクリプト（v2）

やること:
  1. FPL公式APIからデータを取得
       - bootstrap-static（選手・チーム・節）
       - fixtures（全試合）
       - element-summary（選手ごとの試合別履歴）★v2で追加
  2. 生データを data/raw/ に保存（選手別は data/raw/players/）
  3. サイトで使う集計済みデータを data/site/data.json と public/data.json に保存

v2で追加した集計:
  - 選手の全試合合計 / 直近3・5・10試合合計 / ホーム・アウェイ別
  - チームの節別データ（xG=90分出場選手のxG合計、被xG=90分出場選手の被xGの平均）
  - チーム全体合計
  - 次節の対戦クリーンシート率＆ゴール期待値（ポアソン分布、μ=リーグ平均で割る式）

特徴:
  - 追加インストール不要（Python標準機能だけで動きます）
  - 選手別データは取得のたびに保存し、途中で失敗しても再開できます
  - APIにつながらないときは「前回保存したデータ」を使って止まらないようにします

実行方法:
  python3 scripts/update.py
"""

import json
import math
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

# ----------------------------------------------------------------------
# 基本設定
# ----------------------------------------------------------------------

API_BASE = "https://fantasy.premierleague.com/api/"
HEADERS = {"User-Agent": "FPL-Samurai-Site/1.0 (data update script)"}

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW_DIR = os.path.join(ROOT, "data", "raw")
PLAYERS_RAW_DIR = os.path.join(RAW_DIR, "players")  # 選手別の生データ置き場
SITE_DIR = os.path.join(ROOT, "data", "site")
PUBLIC_DIR = os.path.join(ROOT, "public")

# 表に出す人数の上限（重くなりすぎないように）
DISPLAY_LIMIT = 120

# 選手別データの取得間隔（秒）。礼儀正しくアクセスするための間隔
FETCH_INTERVAL = 0.25
# 同じ選手データを再取得しない時間（時間）。同日内の再実行を速くする
CACHE_HOURS = 12

# ----------------------------------------------------------------------
# 日本語への変換表
# ----------------------------------------------------------------------

TEAM_JA = {
    "ARS": "アーセナル", "AVL": "アストンヴィラ", "BHA": "ブライトン",
    "BOU": "ボーンマス", "BRE": "ブレントフォード", "BUR": "バーンリー",
    "CHE": "チェルシー", "CRY": "クリスタルパレス", "EVE": "エヴァートン",
    "FUL": "フラム", "LEE": "リーズ", "LIV": "リヴァプール",
    "MCI": "マンチェスターシティ", "MUN": "マンチェスターユナイテッド",
    "NEW": "ニューカッスル", "NFO": "フォレスト",
    "SUN": "サンダーランド", "TOT": "トッテナム", "WHU": "ウェストハム",
    "WOL": "ウルヴァーハンプトン",
}

POSITION_SHORT = {
    "Goalkeeper": "GK", "Defender": "DF", "Midfielder": "MF", "Forward": "FW",
}

WEEKDAY_JA = ["月", "火", "水", "木", "金", "土", "日"]


def difficulty_to_words(level):
    table = {
        1: ("とても弱い", "easy"), 2: ("弱い", "easy"), 3: ("普通", "normal"),
        4: ("強い", "hard"), 5: ("とても強い", "hard"),
    }
    return table.get(level, ("不明", "normal"))


# ----------------------------------------------------------------------
# 取得まわり
# ----------------------------------------------------------------------

def fetch_json(endpoint, retries=3, wait_seconds=3):
    url = API_BASE + endpoint
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.load(res)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            last_error = e
            if attempt < retries:
                time.sleep(wait_seconds)
    raise RuntimeError(f"APIから取得できませんでした: {url} ({last_error})")


def load_or_fetch(endpoint, raw_filename):
    """APIから取得。失敗時は前回の生データを使う。"""
    raw_path = os.path.join(RAW_DIR, raw_filename)
    try:
        print(f"・APIから取得中: {endpoint}")
        data = fetch_json(endpoint)
        with open(raw_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  → 取得＆保存OK: data/raw/{raw_filename}")
        time.sleep(1)
        return data, True
    except Exception as e:
        print(f"  ⚠ 取得に失敗しました: {e}")
        if os.path.exists(raw_path):
            print(f"  → 前回保存したデータを使います: data/raw/{raw_filename}")
            with open(raw_path, "r", encoding="utf-8") as f:
                return json.load(f), False
        print("  ✗ 前回データもありません。ここで中止します。")
        raise


def is_cache_fresh(path):
    """ファイルが最近(CACHE_HOURS以内)に保存されたものか"""
    if not os.path.exists(path):
        return False
    age_seconds = time.time() - os.path.getmtime(path)
    return age_seconds < CACHE_HOURS * 3600


def fetch_element_summary(player_id):
    """選手1人の試合別履歴を取得（キャッシュがあれば再利用）"""
    path = os.path.join(PLAYERS_RAW_DIR, f"{player_id}.json")
    if is_cache_fresh(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f), True  # キャッシュ利用
    data = fetch_json(f"element-summary/{player_id}/")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return data, False  # 新規取得


def fetch_all_summaries(player_ids):
    """
    出場した全選手の試合別履歴を取得。
    取得のたびに保存するので、途中で止まっても次回は続きから。
    返り値: {player_id: history(list)}
    """
    os.makedirs(PLAYERS_RAW_DIR, exist_ok=True)
    total = len(player_ids)
    print(f"\n・選手別の試合データを取得します（対象 {total}人）")
    print("  ※初回は数分かかります。同じ日に再実行すると速くなります。")

    histories = {}
    fetched_new = 0
    for i, pid in enumerate(player_ids, start=1):
        try:
            data, from_cache = fetch_element_summary(pid)
            histories[pid] = data.get("history", [])
            if not from_cache:
                fetched_new += 1
                time.sleep(FETCH_INTERVAL)  # 新規取得のときだけ間隔を空ける
        except Exception as e:
            # 1人失敗しても全体は止めない。古いキャッシュがあれば使う
            path = os.path.join(PLAYERS_RAW_DIR, f"{pid}.json")
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    histories[pid] = json.load(f).get("history", [])
            else:
                histories[pid] = []
            print(f"  ⚠ 選手ID {pid} の取得に失敗（スキップ）: {e}")

        if i % 50 == 0 or i == total:
            print(f"  …{i}/{total}人 完了（新規取得 {fetched_new}人）")

    print(f"  → 選手データ取得 完了（新規 {fetched_new}人 / キャッシュ {total - fetched_new}人）")
    return histories


# ----------------------------------------------------------------------
# 補助
# ----------------------------------------------------------------------

def to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def build_team_map(bootstrap):
    result = {}
    for t in bootstrap["teams"]:
        short = t["short_name"]
        result[t["id"]] = {"name_ja": TEAM_JA.get(short, t["name"]), "short": short, "code": t["code"]}
    return result


def build_position_map(bootstrap):
    return {p["id"]: POSITION_SHORT.get(p["singular_name"], p["singular_name"])
            for p in bootstrap["element_types"]}


def _ranked(rows):
    out = []
    for i, r in enumerate(rows, start=1):
        rr = dict(r)
        rr["rank"] = i
        out.append(rr)
    return out


def format_kickoff(iso_utc):
    if not iso_utc:
        return "日時未定"
    try:
        dt = datetime.fromisoformat(iso_utc.replace("Z", "+00:00"))
        jst = dt.astimezone(timezone(timedelta(hours=9)))
        return f"{jst.month}月{jst.day}日({WEEKDAY_JA[jst.weekday()]}) {jst.hour:02d}:{jst.minute:02d}"
    except Exception:
        return "日時未定"


def find_next_event(bootstrap):
    for ev in bootstrap["events"]:
        if ev.get("is_next"):
            return ev
    for ev in bootstrap["events"]:
        if not ev.get("finished"):
            return ev
    return None


def find_latest_finished_event(bootstrap):
    finished = [ev for ev in bootstrap["events"] if ev.get("finished")]
    return max(finished, key=lambda ev: ev["id"]) if finished else None


# ----------------------------------------------------------------------
# v1 集計（無失点率・次節日程・おすすめ）
# ----------------------------------------------------------------------

def compute_clean_sheet_ranking(fixtures, team_map):
    stats = {tid: {"played": 0, "clean": 0} for tid in team_map}
    for fx in fixtures:
        if not fx.get("finished"):
            continue
        h, a = fx.get("team_h"), fx.get("team_a")
        hs, as_ = fx.get("team_h_score"), fx.get("team_a_score")
        if None in (h, a, hs, as_):
            continue
        stats[h]["played"] += 1
        if as_ == 0:
            stats[h]["clean"] += 1
        stats[a]["played"] += 1
        if hs == 0:
            stats[a]["clean"] += 1
    rows = []
    for tid, s in stats.items():
        if s["played"] == 0:
            continue
        rate = s["clean"] / s["played"]
        rows.append({
            "team": team_map[tid]["name_ja"], "played": s["played"],
            "clean_sheets": s["clean"], "rate_pct": round(rate * 100, 1),
        })
    rows.sort(key=lambda r: (r["rate_pct"], r["clean_sheets"]), reverse=True)
    return _ranked(rows)


def compute_next_fixtures(bootstrap, fixtures, team_map):
    next_event = find_next_event(bootstrap)
    if next_event is None:
        return {"event_name": None, "matches": []}
    event_id = next_event["id"]
    matches = []
    for fx in fixtures:
        if fx.get("event") != event_id:
            continue
        h = team_map.get(fx["team_h"], {"name_ja": "?"})
        a = team_map.get(fx["team_a"], {"name_ja": "?"})
        h_word, h_cls = difficulty_to_words(fx.get("team_h_difficulty", 3))
        a_word, a_cls = difficulty_to_words(fx.get("team_a_difficulty", 3))
        matches.append({
            "kickoff": format_kickoff(fx.get("kickoff_time")),
            "kickoff_raw": fx.get("kickoff_time"),
            "home": h["name_ja"], "away": a["name_ja"],
            "home_opponent_strength": a_word, "home_opponent_strength_class": a_cls,
            "away_opponent_strength": h_word, "away_opponent_strength_class": h_cls,
        })
    matches.sort(key=lambda m: (m["kickoff_raw"] or "9999"))
    return {"event_name": f"第{event_id}節", "matches": matches}


# ----------------------------------------------------------------------
# v2 集計：選手データ（全試合・直近・ホームアウェイ）
# ----------------------------------------------------------------------

def build_element_map(bootstrap, team_map, pos_map, jp_names):
    """
    選手ID→名前などの変換表（マイチーム検索ページで使用）。
    picks APIは選手IDしか返さないため、全選手ぶん（出場0も含む）を入れる。
    キーを短くしてファイルサイズを抑える: n=名前, j=カタカナ, t=チーム, p=ポジション, c=コスト, ph=写真コード
    """
    out = {}
    for el in bootstrap["elements"]:
        out[str(el["id"])] = {
            "n": el["web_name"],
            "j": jp_names.get(el["web_name"], ""),
            "t": team_map.get(el["team"], {}).get("name_ja", "?"),
            "p": pos_map.get(el["element_type"], "?"),
            "c": round(el.get("now_cost", 0) / 10.0, 1),
            "ph": str(el.get("photo", "")).split(".")[0],
        }
    return out


def load_japanese_names():
    """選手名のカタカナ対応表を読み込む（無ければ空）"""
    path = os.path.join(ROOT, "data", "japanese_names.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        # "_" で始まる説明用キーは除く
        return {k: v for k, v in data.items() if not k.startswith("_")}
    except Exception:
        return {}


def player_base(el, team_map, pos_map, jp_names):
    return {
        "name": el["web_name"],
        "name_ja": jp_names.get(el["web_name"], ""),   # カタカナ（無ければ空）
        "team": team_map.get(el["team"], {}).get("name_ja", "?"),
        "team_code": team_map.get(el["team"], {}).get("code", 0),
        "position": pos_map.get(el["element_type"], "?"),
        "team_id": el["team"],
        "photo": str(el.get("photo", "")).split(".")[0],
    }


def window_row(base, el, rows):
    """
    直近N試合ぶんの履歴(rows)から、全試合タブと同じ項目を計算する。
    /90系はその期間の出場時間で計算。コスパはその期間のポイント÷現在コスト。
    """
    m = len(rows)
    minutes = sum(r.get("minutes", 0) for r in rows)
    s = lambda key: sum(r.get(key, 0) for r in rows)
    sf = lambda key: sum(to_float(r.get(key)) for r in rows)
    p90 = lambda v: round(v / minutes * 90, 2) if minutes > 0 else 0.0

    goals = s("goals_scored")
    points = s("total_points")
    xg = sf("expected_goals")
    xa = sf("expected_assists")
    defcon = s("defensive_contribution")
    saves = s("saves")
    cost = el.get("now_cost", 0) / 10.0

    return {**base, **{
        "matches": m,
        "cost": round(cost, 1),
        "value": round(points / cost, 2) if cost > 0 else 0,
        "points": points,
        "ownership": round(to_float(el.get("selected_by_percent")), 1),
        "goals": goals,
        "assists": s("assists"),
        "clean_sheets": s("clean_sheets"),
        "starts": s("starts"),
        "minutes": minutes,
        "xg": round(xg, 2),
        "xg90": p90(xg),
        "g_minus_xg": round(goals - xg, 2),
        "xa": round(xa, 2),
        "xa90": p90(xa),
        "defcon": defcon,
        "defcon90": p90(defcon),
        "bonus": s("bonus"),
        "ppg": round(points / m, 1) if m else 0,
        "saves": saves,
        "saves90": p90(saves),
        "pk_saved": s("penalties_saved"),
        "yellow": s("yellow_cards"),
        "red": s("red_cards"),
        "xgi": round(sf("expected_goal_involvements"), 2),
    }}


def sum_history(rows):
    """試合履歴の合計（得点・アシスト・xGなど）"""
    return {
        "matches": len(rows),
        "minutes": sum(r.get("minutes", 0) for r in rows),
        "goals": sum(r.get("goals_scored", 0) for r in rows),
        "assists": sum(r.get("assists", 0) for r in rows),
        "xg": round(sum(to_float(r.get("expected_goals")) for r in rows), 2),
        "xgi": round(sum(to_float(r.get("expected_goal_involvements")) for r in rows), 2),
        "points": sum(r.get("total_points", 0) for r in rows),
    }


def sorted_history(history):
    """試合履歴をキックオフ時刻の古い順に並べる"""
    return sorted(history, key=lambda r: (r.get("kickoff_time") or ""))


def compute_player_tables(bootstrap, histories, team_map, pos_map, jp_names):
    """全試合・直近1（直近節）/3/5/10・ホーム・アウェイの表を作る"""
    all_rows, last1, last3, last5, last10, home_rows, away_rows = [], [], [], [], [], [], []

    for el in bootstrap["elements"]:
        if el.get("minutes", 0) <= 0:
            continue
        base = player_base(el, team_map, pos_map, jp_names)
        hist = sorted_history(histories.get(el["id"], []))
        if not hist:
            continue

        # 全試合（シーズン合計はbootstrapの値が正確）
        # 高機能テーブル用にコスト・コスパ・各種per90なども入れる
        cost = el.get("now_cost", 0) / 10.0  # 例: 46 → 4.6（£m）
        points = el.get("total_points", 0)
        photo_code = str(el.get("photo", "")).split(".")[0]  # 例 "457569.jpg" → "457569"
        goals = el.get("goals_scored", 0)
        xg_total = to_float(el.get("expected_goals"))
        all_rows.append({**base, **{
            "photo": photo_code,
            "cost": round(cost, 1),
            "value": round(points / cost, 2) if cost > 0 else 0,   # コスパ＝ポイント÷コスト
            "points": points,
            "ownership": round(to_float(el.get("selected_by_percent")), 1),  # 所持率(%)
            "goals": goals,
            "assists": el.get("assists", 0),
            "clean_sheets": el.get("clean_sheets", 0),
            "starts": el.get("starts", 0),
            "minutes": el.get("minutes", 0),
            "xg": round(xg_total, 2),                       # xG合計
            "xg90": round(to_float(el.get("expected_goals_per_90")), 2),
            "g_minus_xg": round(goals - xg_total, 2),       # G-xG（上振れ/下振れ）
            "xa": round(to_float(el.get("expected_assists")), 2),          # xA合計
            "xa90": round(to_float(el.get("expected_assists_per_90")), 2),  # xA/90
            "defcon": el.get("defensive_contribution", 0), # DEFCON合計
            "defcon90": round(to_float(el.get("defensive_contribution_per_90")), 2),
            "bonus": el.get("bonus", 0),
            "ppg": round(to_float(el.get("points_per_game")), 1),
            "saves": el.get("saves", 0),                    # セーブ合計
            "saves90": round(to_float(el.get("saves_per_90")), 2),
            "pk_saved": el.get("penalties_saved", 0),       # PKストップ
            "yellow": el.get("yellow_cards", 0),
            "red": el.get("red_cards", 0),
        }})

        # 直近N試合 ＝ チームの直近N試合すべて（欠場・ベンチ=0分も1試合として数える）
        last1.append(window_row(base, el, hist[-1:]))   # 直近節（直近1試合分のみ）
        last3.append(window_row(base, el, hist[-3:]))
        last5.append(window_row(base, el, hist[-5:]))
        last10.append(window_row(base, el, hist[-10:]))

        # ホーム / アウェイ別
        home = [r for r in hist if r.get("was_home") and r.get("minutes", 0) > 0]
        away = [r for r in hist if (not r.get("was_home")) and r.get("minutes", 0) > 0]
        if home:
            home_rows.append(window_row(base, el, home))
        if away:
            away_rows.append(window_row(base, el, away))

    def top(rows, key="xgi"):
        return _ranked(sorted(rows, key=lambda r: r[key], reverse=True)[:DISPLAY_LIMIT])

    def full(rows):
        # 高機能テーブル用：全選手（フィルタで絞れるように上限なし）、ポイント順
        return _ranked(sorted(rows, key=lambda r: r["points"], reverse=True))

    return {
        "all": full(all_rows),
        "last1": full(last1),
        "last3": full(last3), "last5": full(last5), "last10": full(last10),
        "home": full(home_rows), "away": full(away_rows),
    }


# ----------------------------------------------------------------------
# v2 集計：チームデータ（節別・合計・直近フォーム）
# ----------------------------------------------------------------------

def compute_team_matches(bootstrap, fixtures, histories, team_map):
    """
    チームごとの「試合単位」のデータを作る。
      xG  = その試合で90分出場した選手のxG合計
      被xG = その試合で90分出場した選手の被xGの平均
    返り値: {team_id: [ {round, kickoff, xg, xgc, players} ... 古い順 ]}

    注意: 選手の「現在の所属」ではなく、「その試合で実際に出ていたチーム」に
    振り分ける（シーズン途中の移籍に対応するため）。
    試合(fixture)のホーム/アウェイと was_home から所属チームを判定する。
    """
    # fixture_id -> (home_team_id, away_team_id, home_score, away_score)
    finfo = {fx["id"]: (fx["team_h"], fx["team_a"],
                        fx.get("team_h_score"), fx.get("team_a_score")) for fx in fixtures}

    # team_id -> fixture_id -> 集計
    bucket = {}

    for pid, hist in histories.items():
        for r in hist:
            fid = r.get("fixture")
            info = finfo.get(fid)
            if not info:
                continue
            home = bool(r.get("was_home"))
            team_id = info[0] if home else info[1]   # その試合での所属チーム
            slot = bucket.setdefault(team_id, {}).setdefault(fid, {
                "round": r.get("round"), "kickoff": r.get("kickoff_time"),
                "xg_sum": 0.0, "xgc_list": [], "conceded": None,
                "points": 0, "goals": 0, "assists": 0,
                "defcon": 0, "yellow": 0, "red": 0,
            })
            # 数えもの系は全選手（途中出場も含む）
            slot["points"] += r.get("total_points", 0)
            slot["goals"] += r.get("goals_scored", 0)
            slot["assists"] += r.get("assists", 0)
            slot["defcon"] += r.get("defensive_contribution", 0)
            slot["yellow"] += r.get("yellow_cards", 0)
            slot["red"] += r.get("red_cards", 0)
            # 失点は試合のスコアから（1試合に1回だけ設定）
            if slot["conceded"] is None:
                hs, as_ = info[2], info[3]
                if hs is not None and as_ is not None:
                    slot["conceded"] = as_ if home else hs
            # xG・被xG はフル出場(90分)の選手だけ
            if r.get("minutes", 0) >= 90:
                slot["xg_sum"] += to_float(r.get("expected_goals"))
                slot["xgc_list"].append(to_float(r.get("expected_goals_conceded")))

    result = {}
    for team_id, fixtures_d in bucket.items():
        rows = []
        for fid, s in fixtures_d.items():
            xgc = sum(s["xgc_list"]) / len(s["xgc_list"]) if s["xgc_list"] else 0.0
            rows.append({
                "round": s["round"], "kickoff": s["kickoff"],
                "xg": round(s["xg_sum"], 2), "xgc": round(xgc, 2),
                "points": s["points"], "goals": s["goals"], "assists": s["assists"],
                "conceded": s["conceded"] or 0, "defcon": s["defcon"],
                "yellow": s["yellow"], "red": s["red"],
            })
        rows.sort(key=lambda x: (x["kickoff"] or ""))
        result[team_id] = rows
    return result


def compute_league_avg_xg(team_matches):
    """μ = リーグ全体の『1チーム・1試合あたり平均xG』"""
    values = [m["xg"] for rows in team_matches.values() for m in rows]
    return round(sum(values) / len(values), 3) if values else 1.0


def compute_team_section(team_matches, team_map, clean_sheets):
    """チームの節別・合計・直近フォームをまとめる"""
    cs_by_team = {c["team"]: c for c in clean_sheets}
    by_gw, totals, recent = [], [], []
    STAT_KEYS = ["points", "goals", "assists", "conceded", "defcon", "yellow", "red"]

    for team_id, rows in team_matches.items():
        name = team_map.get(team_id, {}).get("name_ja", "?")

        # 節別（各試合：xG/被xG＋7指標）
        by_gw.append({
            "team": name,
            "matches": [{"round": r["round"], "xg": r["xg"], "xgc": r["xgc"],
                         **{k: r[k] for k in STAT_KEYS}} for r in rows],
        })

        # 合計（GW別データの合計）＋無失点率
        cs = cs_by_team.get(name, {})
        totals.append({
            "team": name, "matches": len(rows),
            "points": sum(r["points"] for r in rows),
            "goals": sum(r["goals"] for r in rows),
            "assists": sum(r["assists"] for r in rows),
            "conceded": sum(r["conceded"] for r in rows),
            "defcon": sum(r["defcon"] for r in rows),
            "yellow": sum(r["yellow"] for r in rows),
            "red": sum(r["red"] for r in rows),
            "xg_total": round(sum(r["xg"] for r in rows), 2),
            "xgc_total": round(sum(r["xgc"] for r in rows), 2),
            "cs_pct": cs.get("rate_pct", 0),
            "cs_count": cs.get("clean_sheets", 0),
        })

        # 直近フォーム（直近5試合の平均。xGのみ直近10も）
        def avg(vals):
            return round(sum(vals) / len(vals), 2) if vals else 0.0
        last5 = rows[-5:]
        rec = {
            "team": name, "team_id": team_id,
            "r5_xg": avg([r["xg"] for r in last5]),
            "r5_xgc": avg([r["xgc"] for r in last5]),
            "r10_xg": avg([r["xg"] for r in rows[-10:]]),
            "r10_xgc": avg([r["xgc"] for r in rows[-10:]]),
        }
        for k in STAT_KEYS:
            rec["r5_" + k] = avg([r[k] for r in last5])
        recent.append(rec)

    totals.sort(key=lambda r: r["points"], reverse=True)
    by_gw.sort(key=lambda r: r["team"])
    recent.sort(key=lambda r: r["r5_points"], reverse=True)
    return {"by_gw": by_gw, "totals": _ranked(totals), "recent": _ranked(recent)}


# ----------------------------------------------------------------------
# v2 集計：次節予測（クリーンシート率・ゴール期待値）
# ----------------------------------------------------------------------

def compute_predictions(bootstrap, fixtures, team_matches, team_map, mu):
    """
    クリーンシート率: λ = 相手の直近10試合平均xG × 自チームの直近10試合平均被xG ÷ μ
                     → P(無失点) = e^(-λ) を%表示
    ゴール期待値    : λ攻 = 自チームの直近5試合平均xG × 相手の直近5試合平均被xG ÷ μ
    """
    def avg(rows, key, n):
        vals = [r[key] for r in rows[-n:]]
        return sum(vals) / len(vals) if vals else 0.0

    next_event = find_next_event(bootstrap)
    rows = []
    if next_event is not None and mu > 0:
        event_id = next_event["id"]
        for fx in fixtures:
            if fx.get("event") != event_id:
                continue
            for side in ("h", "a"):
                me = fx["team_h"] if side == "h" else fx["team_a"]
                opp = fx["team_a"] if side == "h" else fx["team_h"]
                my_rows = team_matches.get(me, [])
                opp_rows = team_matches.get(opp, [])

                lam_concede = avg(opp_rows, "xg", 10) * avg(my_rows, "xgc", 10) / mu
                cs_pct = round(math.exp(-lam_concede) * 100, 1)
                lam_attack = avg(my_rows, "xg", 5) * avg(opp_rows, "xgc", 5) / mu

                rows.append({
                    "team": team_map.get(me, {}).get("name_ja", "?"),
                    "opponent": team_map.get(opp, {}).get("name_ja", "?"),
                    "home_away": "ホーム" if side == "h" else "アウェイ",
                    "clean_sheet_pct": cs_pct,
                    "goal_expect": round(lam_attack, 2),
                    "kickoff": format_kickoff(fx.get("kickoff_time")),
                })
        rows.sort(key=lambda r: r["clean_sheet_pct"], reverse=True)

    return {
        "event_name": f"第{next_event['id']}節" if next_event else None,
        "league_avg_xg": mu,
        "rows": rows,
    }


def compute_team_next3(fixtures, team_map, team_matches, mu):
    """
    チームごとの「次の3試合」。
    f = 相手の直近10試合の平均被xG ÷ リーグ平均xG(μ)
    （選手の得点期待値 = 選手のxG/90 × f として画面側で計算する係数）
    オフシーズン（未消化試合なし）のときは空。
    """
    upcoming = [f for f in fixtures if not f.get("finished") and f.get("kickoff_time")]
    upcoming.sort(key=lambda f: f["kickoff_time"])

    def opp_factor(opp_id):
        rows = team_matches.get(opp_id, [])
        vals = [r["xgc"] for r in rows[-10:]]
        if not vals or mu <= 0:
            return 1.0  # データが無い相手は「平均的な相手」とみなす
        return round((sum(vals) / len(vals)) / mu, 3)

    out = {}
    for f in upcoming:
        for me, opp, home in ((f["team_h"], f["team_a"], True), (f["team_a"], f["team_h"], False)):
            lst = out.setdefault(str(me), [])
            if len(lst) < 3:
                lst.append({
                    "o": team_map.get(opp, {}).get("name_ja", "?"),
                    "h": home,
                    "f": opp_factor(opp),
                })
    return out


def compute_set_pieces(bootstrap, team_map, jp_names):
    """セットプレー担当者DB（公式データの担当順をチーム別に整理）"""
    teams = {}
    for el in bootstrap["elements"]:
        for key, field in (("pens", "penalties_order"),
                           ("fks", "direct_freekicks_order"),
                           ("cks", "corners_and_indirect_freekicks_order")):
            order = el.get(field)
            if order:
                slot = teams.setdefault(el["team"], {"pens": [], "fks": [], "cks": []})
                name = el["web_name"]
                ja = jp_names.get(name, "")
                slot[key].append((order, ja or name))

    out = []
    for tid in sorted(teams, key=lambda t: team_map.get(t, {}).get("name_ja", "")):
        e = teams[tid]
        fmt = lambda lst: [n for _, n in sorted(lst)]
        out.append({
            "team": team_map.get(tid, {}).get("name_ja", "?"),
            "pens": fmt(e["pens"]),
            "fks": fmt(e["fks"]),
            "cks": fmt(e["cks"]),
        })
    return out


# ----------------------------------------------------------------------
# メイン
# ----------------------------------------------------------------------

def main():
    print("=" * 50)
    print("FPL侍 データ更新を開始します（v2）")
    print("=" * 50)

    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(SITE_DIR, exist_ok=True)

    bootstrap, ok1 = load_or_fetch("bootstrap-static/", "bootstrap-static.json")
    fixtures, ok2 = load_or_fetch("fixtures/", "fixtures.json")

    team_map = build_team_map(bootstrap)
    pos_map = build_position_map(bootstrap)

    # 出場した選手だけ、試合別データを取得
    player_ids = [el["id"] for el in bootstrap["elements"] if el.get("minutes", 0) > 0]
    histories = fetch_all_summaries(player_ids)

    print("\nデータを集計しています…")

    # v1
    clean_sheets = compute_clean_sheet_ranking(fixtures, team_map)
    next_fixtures = compute_next_fixtures(bootstrap, fixtures, team_map)
    # v2
    jp_names = load_japanese_names()
    player_tables = compute_player_tables(bootstrap, histories, team_map, pos_map, jp_names)
    team_matches = compute_team_matches(bootstrap, fixtures, histories, team_map)
    mu = compute_league_avg_xg(team_matches)
    team_section = compute_team_section(team_matches, team_map, clean_sheets)
    predictions = compute_predictions(bootstrap, fixtures, team_matches, team_map, mu)

    latest = find_latest_finished_event(bootstrap)
    latest_gw_label = f"第{latest['id']}節" if latest else "未開幕"
    now_jst = datetime.now(timezone(timedelta(hours=9)))

    site_data = {
        "meta": {
            "generated_at": now_jst.strftime("%Y年%m月%d日 %H:%M"),
            "latest_gameweek": latest_gw_label,
            "league_avg_xg": mu,
            "source": "Fantasy Premier League 公式API",
            "data_fresh": ok1 and ok2,
            # 節ごとの「FPLプレイヤー全体の平均ポイント」（公式のAverage）。マイチームの直近節で表示
            "event_averages": {str(ev["id"]): ev["average_entry_score"]
                               for ev in bootstrap["events"]
                               if ev.get("average_entry_score") is not None},
        },
        "players": player_tables,
        "elements": build_element_map(bootstrap, team_map, pos_map, jp_names),
        "team_next3": compute_team_next3(fixtures, team_map, team_matches, mu),
        "teams_meta": {str(tid): {"name": m["name_ja"], "short": m["short"], "code": m["code"]}
                       for tid, m in team_map.items()},
        "set_pieces": compute_set_pieces(bootstrap, team_map, jp_names),
        "teams": team_section,
        "clean_sheets": clean_sheets,
        "next_fixtures": next_fixtures,
        "predictions": predictions,
    }

    # 配信用なので改行・空白なしのコンパクト形式（現在公開中のdata.jsonと同じ形式）
    for path in (os.path.join(SITE_DIR, "data.json"), os.path.join(PUBLIC_DIR, "data.json")):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(site_data, f, ensure_ascii=False, separators=(",", ":"))

    print("\n集計が完了しました！")
    print(f"  最終更新の節: {latest_gw_label}")
    print(f"  リーグ平均xG(μ): {mu}")
    print(f"  選手テーブル: 全試合{len(player_tables['all'])}人 / 直近10 {len(player_tables['last10'])}人")
    print(f"  チーム合計: {len(team_section['totals'])}チーム")
    print(f"  次節予測: {predictions['event_name'] or 'なし（オフシーズン）'}（{len(predictions['rows'])}行）")
    if not (ok1 and ok2):
        print("  ⚠ 一部APIに接続できず、前回データを使った箇所があります")
    print("\n公開するなら git でコミット＆プッシュしてください（README.md 参照）。")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n✗ エラーで止まりました: {e}", file=sys.stderr)
        sys.exit(1)
