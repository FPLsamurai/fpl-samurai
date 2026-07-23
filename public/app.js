/* ===========================================================
   FPL侍 データサイト 画面の動き（v2）
   data.json を読み込み、選手・チーム・次節の各表を描きます
   （素のJavaScriptだけ。ライブラリは使っていません）
   =========================================================== */

const DATA_URL = "data.json";
let DATA = null;

document.addEventListener("DOMContentLoaded", init);

// 見出し固定の基準となるトップバーの高さを実測してCSS変数に反映
function syncTopbarHeight() {
  const bar = document.querySelector(".topbar");
  if (!bar) return;
  document.documentElement.style.setProperty("--topbar-h", bar.offsetHeight + "px");
}
window.addEventListener("resize", syncTopbarHeight);

async function init() {
  syncTopbarHeight();
  setupParentTabs();
  setupSubtabs();
  setupMyTeam();
  loadYouTube();          // ホームのYouTube最新動画（取得失敗しても他は動く）
  try {
    const res = await fetch(DATA_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error("データファイルを読み込めませんでした");
    DATA = await res.json();
    renderHeader();
    // 各タブの初期表示
    renderPlayers("all");
    renderTeams("totals");
    renderNext("predict");
  } catch (err) {
    showLoadError(err);
  }
}

/* ---------- タブの仕組み ---------- */
// 指定タブへ切り替え（タブボタン・ロゴ・カードから共通で使う）
function activateTab(target) {
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("is-active", t.dataset.target === target));
  document.querySelectorAll(".panel").forEach((p) =>
    p.classList.toggle("is-active", p.id === target));
  window.scrollTo({ top: 0 });
}

function setupParentTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => activateTab(tab.dataset.target));
  });
  // ロゴ／タイトルのクリックでホームへ
  const brand = document.getElementById("brand-home");
  if (brand) brand.addEventListener("click", (e) => { e.preventDefault(); activateTab("home"); });
  // ホームのカードからデータ各ページへ
  document.querySelectorAll(".nav-card[data-go]").forEach((c) => {
    c.addEventListener("click", () => activateTab(c.dataset.go));
  });
}

function setupSubtabs() {
  document.querySelectorAll(".subtabs").forEach((group) => {
    const name = group.dataset.group;
    group.querySelectorAll(".subtab").forEach((st) => {
      st.addEventListener("click", () => {
        group.querySelectorAll(".subtab").forEach((s) => s.classList.remove("is-active"));
        st.classList.add("is-active");
        const key = st.dataset.key;
        if (name === "players") renderPlayers(key);
        if (name === "teams") renderTeams(key);
        if (name === "next") renderNext(key);
      });
    });
  });
}

/* ---------- ヘッダー ---------- */
function renderHeader() {
  const m = DATA.meta || {};
  document.getElementById("updated").textContent =
    `最終更新：${m.generated_at || "不明"}　（最新の節：${m.latest_gameweek || "不明"}）`;
  if (m.data_fresh === false) {
    const warn = document.createElement("div");
    warn.className = "stale-warning";
    warn.textContent = "⚠ 一部データの取得に失敗したため、前回の内容を表示しています";
    document.body.insertBefore(warn, document.querySelector(".tabs"));
  }
}

/* ===========================================================
   選手タブ
   =========================================================== */
const RICH_KEYS = ["all", "last1", "last3", "last5", "last10", "home", "away"];
function renderPlayers(key) {
  if (key === "recent") {
    renderPlayerRich(recentWindow);   // 「直近」タブ＝記憶している期間のリッチ表＋期間切替
  } else if (RICH_KEYS.includes(key)) {
    renderPlayerRich(key);
  } else if (key === "setpiece") {
    renderSetPieces();
  } else {
    renderPlayerSimple(key);
  }
}

/* ---- 直近・ホーム/アウェイ（シンプルな表） ---- */
function renderPlayerSimple(key) {
  const note = document.getElementById("players-note");
  const box = document.getElementById("players-content");
  const rows = (DATA.players && DATA.players[key]) || [];

  note.textContent = "";

  if (!rows.length) {
    box.innerHTML = emptyMessage("まだデータがありません。");
    return;
  }
  let html = `<table><thead><tr>
      <th class="rank">順位</th><th>選手</th>
      <th class="num">試合</th><th class="num">得点</th>
      <th class="num">アシスト</th><th class="num">得点期待度</th>
    </tr></thead><tbody>`;
  rows.forEach((r) => {
    html += `<tr>
      <td class="rank ${rankClass(r.rank)}">${r.rank}</td>
      <td><div class="name">${esc(r.name)}</div>${r.name_ja ? `<div class="name-ja">${esc(r.name_ja)}</div>` : ""}<div class="sub">${esc(r.team)}・${esc(r.position)}</div></td>
      <td class="num">${r.matches}</td>
      <td class="num">${r.goals}</td>
      <td class="num">${r.assists}</td>
      <td class="num main-num">${r.xgi}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  box.innerHTML = html;
}

/* ---- セットプレー担当者DB ---- */
function renderSetPieces() {
  const note = document.getElementById("players-note");
  const box = document.getElementById("players-content");
  note.textContent = "";
  const rows = DATA.set_pieces || [];
  if (!rows.length) {
    box.innerHTML = emptyMessage("まだデータがありません。");
    return;
  }
  let html = `<table class="squad setpiece"><thead><tr>
      <th>チーム</th><th>PK</th><th>直接FK</th><th>CK・間接FK</th>
    </tr></thead><tbody>`;
  rows.forEach((t) => {
    const fmt = (arr) => arr.length
      ? arr.map((n, i) => `<div class="sp-taker"><span class="sp-no">${i + 1}</span>${esc(n)}</div>`).join("")
      : `<span class="sub">—</span>`;
    html += `<tr>
      <td class="name">${esc(t.team)}</td>
      <td>${fmt(t.pens)}</td>
      <td>${fmt(t.fks)}</td>
      <td>${fmt(t.cks)}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  box.innerHTML = html;
}

/* ===========================================================
   全試合：高機能テーブル（並べ替え＋列ごとの数値フィルタ＋写真）
   =========================================================== */

// 各列の定義（label=見出し, type=種類, width=固定列の幅px）
const COL_META = {
  rank:        { label: "順位",      type: "rank",  frozen: true, width: 42, lock: true, noSort: true },
  photo:       { label: "写真",      type: "photo", frozen: true, width: 46, noSort: true },
  team:        { label: "チーム",    type: "team",  frozen: true, width: 46, noSort: true },
  name:        { label: "選手名",    type: "name",  frozen: true, width: 130, lock: true },
  position:    { label: "POS",      type: "pos",   frozen: true, width: 46 },
  cost:        { label: "コスト",    type: "num",   frozen: true, width: 56 },
  points:      { label: "ポイント",  type: "num",   frozen: true, width: 62 },
  value:       { label: "コスパ",    type: "num" },
  ownership:   { label: "所持率",    type: "num" },
  goals:       { label: "ゴール",    type: "num" },
  assists:     { label: "アシスト",  type: "num" },
  clean_sheets:{ label: "無失点",    type: "num" },
  starts:      { label: "スタメン",  type: "num" },
  minutes:     { label: "出場時間",  type: "num" },
  xg:          { label: "xG",        type: "num" },
  xg90:        { label: "xG/90",     type: "num" },
  g_minus_xg:  { label: "G-xG",      type: "num" },
  xa:          { label: "xA",        type: "num" },
  xa90:        { label: "xA/90",     type: "num" },
  defcon:      { label: "DEFCON",    type: "num" },
  defcon90:    { label: "DEFCON/90", type: "num" },
  bonus:       { label: "ボーナス",  type: "num" },
  ppg:         { label: "Pts/試合",  type: "num" },
  saves:       { label: "セーブ",    type: "num" },
  saves90:     { label: "セーブ/90", type: "num" },
  pk_saved:    { label: "PKストップ", type: "num" },
  yellow:      { label: "イエロー",  type: "num" },
  red:         { label: "レッド",    type: "num" },
  next3:       { label: "次の3試合", type: "next3", noSort: true },
};
const FROZEN_ORDER = ["rank", "photo", "name", "team", "position", "cost", "points"];  // ポイントまで左に固定
const DATA_ORDER_DEFAULT = [
  "value", "ownership", "goals", "assists", "clean_sheets", "starts", "minutes",
  "xg", "xg90", "g_minus_xg", "xa", "xa90", "defcon", "defcon90",
  "bonus", "ppg", "saves", "saves90", "pk_saved", "yellow", "red",
  "next3",
];
const POS_ORDER = { GK: 0, DF: 1, MF: 2, FW: 3 };
// 選手写真。公式は季節ごとに別パス（premierleague25=25/26）で最新版を配信。
// 旧パス（premierleague/.../250x250/p{code}）は24/25で更新停止しているため新パスを使用。
// ※新シーズンでは "premierleague25" → "premierleague26" に更新する（サイズは40x40/110x140/500x500のみ提供）
const PHOTO_BASE = "https://resources.premierleague.com/premierleague25/photos/players/110x140/";
const BADGE_BASE = "https://resources.premierleague.com/premierleague/badges/70/t";
// 設定の保存キー。標準の列構成を変えたら末尾のバージョンを上げる（全員に新標準を適用するため）
const CONFIG_KEY = "fpl_player_cols_v4";

let playerSort = { key: "points", dir: "desc" };
let playerFilters = { name: "", pos: "", team: "", min: {}, max: {} };
let colState = loadColState();
let cmOpen = false;  // 列設定パネルが開いているか
let currentRichKey = "all";  // 高機能テーブルがいま表示している期間
// 「直近」タブ内の期間切替（1/3/5/10試合）。選んだ期間はブラウザに記憶
const RECENT_WINDOWS = [["last1", "1試合"], ["last3", "3試合"], ["last5", "5試合"], ["last10", "10試合"]];
const RECENT_KEYS = RECENT_WINDOWS.map((w) => w[0]);
let recentWindow = (() => {
  try { const s = localStorage.getItem("fpl_recent_window"); if (RECENT_KEYS.includes(s)) return s; } catch (e) {}
  return "last5";
})();

/* ---- 列の表示設定の保存・読み込み（ブラウザに記憶） ---- */
function defaultColState() {
  return { dataOrder: [...DATA_ORDER_DEFAULT], hidden: {}, freezeUntil: "name" };
}
function loadColState() {
  try {
    const s = JSON.parse(localStorage.getItem(CONFIG_KEY));
    if (!s || !s.dataOrder) return defaultColState();
    const known = new Set(DATA_ORDER_DEFAULT);
    const order = s.dataOrder.filter((k) => known.has(k));
    DATA_ORDER_DEFAULT.forEach((k) => { if (!order.includes(k)) order.push(k); });
    // 固定範囲（無効な値なら標準=ポイントまで）
    const fu = (s.freezeUntil === "none" || FROZEN_ORDER.includes(s.freezeUntil))
      ? s.freezeUntil : "name";
    return { dataOrder: order, hidden: s.hidden || {}, freezeUntil: fu };
  } catch (e) {
    return defaultColState();
  }
}
function saveColState() {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(colState)); } catch (e) {}
}

/* ---- 今表示する列の一覧（固定列＋データ列） ---- */
function getActiveColumns() {
  // 「どこまで固定するか」（none=固定なし）
  const fu = colState.freezeUntil ?? "points";
  const cut = fu === "none" ? 0 : FROZEN_ORDER.indexOf(fu) + 1;

  // 左側の基本列のうち、固定する部分（sticky）
  const frozen = FROZEN_ORDER.slice(0, cut)
    .filter((k) => !colState.hidden[k])
    .map((k) => ({ key: k, ...COL_META[k], frozen: true }));
  let left = 0;
  frozen.forEach((c) => { c.left = left; left += c.width; });

  // 残りの基本列（固定しないが、位置は左側のまま）
  const unfrozenBase = FROZEN_ORDER.slice(cut)
    .filter((k) => !colState.hidden[k])
    .map((k) => ({ key: k, ...COL_META[k], frozen: false }));

  const data = colState.dataOrder
    .filter((k) => !colState.hidden[k])
    .map((k) => ({ key: k, ...COL_META[k], frozen: false }));
  return { frozen, data, all: [...frozen, ...unfrozenBase, ...data] };
}
// 全選手から重複なしのチーム名一覧（フィルタ用）
let _teamOptionsCache = null;
function teamOptions() {
  if (_teamOptionsCache) return _teamOptionsCache;
  const rows = (DATA.players && DATA.players.all) || [];
  _teamOptionsCache = [...new Set(rows.map((r) => r.team))].sort((a, b) => a.localeCompare(b, "ja"));
  return _teamOptionsCache;
}
function frozenCss(c) {
  return c.frozen
    ? `position:sticky;left:${c.left}px;min-width:${c.width}px;max-width:${c.width}px;`
    : "";
}

/* ---- 高機能テーブル：土台を作る（全試合・直近3/5/10共通） ---- */
function renderPlayerRich(key) {
  currentRichKey = key || "all";
  document.getElementById("players-note").textContent = "";
  const box = document.getElementById("players-content");
  const rows = (DATA.players && DATA.players[currentRichKey]) || [];
  if (!rows.length) { box.innerHTML = emptyMessage("まだデータがありません。"); return; }

  // 「直近」タブのとき、表の上に期間切替（1/3/5/10試合）を出す
  const isRecent = RECENT_KEYS.includes(currentRichKey);
  const segHtml = isRecent ? `
    <div class="recent-seg" id="recent-seg">
      <span class="recent-seg-l">直近</span>
      ${RECENT_WINDOWS.map(([k, lbl]) =>
        `<button type="button" data-win="${k}" class="${k === currentRichKey ? "is-on" : ""}">${lbl}</button>`).join("")}
    </div>` : "";

  box.innerHTML = `
    <div id="col-manager"></div>
    ${segHtml}
    <p class="note" style="margin:6px 0;">該当：<span id="player-count"></span>人</p>
    <div class="fullbleed">
      <div class="data-table-wrap">
        <table class="rich">
          <thead id="player-head"></thead>
          <tbody id="player-body"></tbody>
        </table>
      </div>
    </div>`;

  // 期間切替（1/3/5/10試合）。選んだ期間を記憶して再描画（並べ替え・絞り込み・列設定は保持）
  const seg = document.getElementById("recent-seg");
  if (seg) {
    seg.querySelectorAll("button[data-win]").forEach((b) => b.addEventListener("click", () => {
      recentWindow = b.dataset.win;
      try { localStorage.setItem("fpl_recent_window", recentWindow); } catch (e) {}
      renderPlayerRich(recentWindow);
    }));
  }

  // イベントは親に1回だけ付ける（中身を作り替えても効く）
  const head = document.getElementById("player-head");
  head.addEventListener("click", (e) => {
    const th = e.target.closest("th.sortable");
    if (!th) return;
    const key = th.dataset.sort;
    if (playerSort.key === key) {
      playerSort.dir = playerSort.dir === "desc" ? "asc" : "desc";
    } else {
      playerSort.key = key;
      playerSort.dir = (key === "name") ? "asc" : "desc";
    }
    refreshPlayerBody();
  });
  const onFilter = (e) => {
    const t = e.target;
    if (t.id === "f-name") playerFilters.name = t.value.trim().toLowerCase();
    else if (t.id === "f-pos") playerFilters.pos = t.value;
    else if (t.id === "f-team") playerFilters.team = t.value;
    else if (t.dataset.min !== undefined) setNumFilter("min", t.dataset.min, t.value);
    else if (t.dataset.max !== undefined) setNumFilter("max", t.dataset.max, t.value);
    else return;
    refreshPlayerBody();
  };
  head.addEventListener("input", onFilter);
  head.addEventListener("change", onFilter);

  setupColManagerEvents();
  renderColManager();
  buildPlayerHead();
  refreshPlayerBody();
}

function setNumFilter(kind, key, value) {
  if (value === "" || isNaN(parseFloat(value))) delete playerFilters[kind][key];
  else playerFilters[kind][key] = parseFloat(value);
}

/* ---- 見出し（並べ替え行＋フィルタ行）を作る ---- */
function buildPlayerHead() {
  const { all } = getActiveColumns();
  let r1 = "", r2 = "";
  all.forEach((c) => {
    const st = frozenCss(c);
    const frz = c.frozen ? "frz " : "";
    const numc = (c.type === "num") ? "num " : "";
    // 1行目：見出し（写真列だけ見出し文字を消す）
    const sortable = !c.noSort;
    const headText = (c.type === "photo") ? "" : esc(c.label);
    r1 += `<th class="col-${c.key} ${frz}${numc}${sortable ? "sortable" : ""}" ${sortable ? `data-sort="${c.key}"` : ""} style="${st}">${headText}${sortable ? '<span class="arr"></span>' : ""}</th>`;
    // 2行目：フィルタ
    let f = "";
    if (c.type === "name") {
      f = `<input type="text" id="f-name" placeholder="検索" value="${esc(playerFilters.name)}">`;
    } else if (c.type === "team") {
      const opts = ['<option value="">ー</option>'].concat(
        teamOptions().map((t) => `<option value="${esc(t)}" ${playerFilters.team === t ? "selected" : ""}>${esc(t)}</option>`)
      ).join("");
      f = `<select id="f-team" class="colsel" title="チームで絞り込み（ーで全部）">${opts}</select>`;
    } else if (c.type === "pos") {
      const opt = (v, lbl) => `<option value="${v}" ${playerFilters.pos === v ? "selected" : ""}>${lbl}</option>`;
      f = `<select id="f-pos" class="colsel" title="ポジションで絞り込み（ーで全部）">${opt("", "ー")}${opt("GK", "GK")}${opt("DF", "DF")}${opt("MF", "MF")}${opt("FW", "FW")}</select>`;
    } else if (c.type === "num") {
      const mn = playerFilters.min[c.key] ?? "";
      const mx = playerFilters.max[c.key] ?? "";
      f = `<input type="number" class="fnum" data-min="${c.key}" placeholder="≥" step="any" value="${mn}">
           <input type="number" class="fnum" data-max="${c.key}" placeholder="≤" step="any" value="${mx}">`;
    }
    r2 += `<td class="filter-cell col-${c.key} ${frz}${numc}" style="${st}">${f}</td>`;
  });
  document.getElementById("player-head").innerHTML =
    `<tr>${r1}</tr><tr class="filter-row">${r2}</tr>`;
}

/* ---- 本体（中身）を絞り込み・並べ替えして描く ---- */
function refreshPlayerBody() {
  const rows = (DATA.players && DATA.players[currentRichKey]) || [];
  const { all, data, frozen } = getActiveColumns();
  const numKeys = all.filter((c) => c.type === "num").map((c) => c.key);
  const posVisible = all.some((c) => c.key === "position");
  const teamVisible = all.some((c) => c.key === "team");

  let filtered = rows.filter((r) => {
    if (playerFilters.name) {
      const q = playerFilters.name;
      const hit = r.name.toLowerCase().includes(q) || (r.name_ja && r.name_ja.toLowerCase().includes(q));
      if (!hit) return false;
    }
    if (posVisible && playerFilters.pos && r.position !== playerFilters.pos) return false;
    if (teamVisible && playerFilters.team && r.team !== playerFilters.team) return false;
    for (const k of numKeys) {
      const mn = playerFilters.min[k]; if (mn != null && Number(r[k]) < mn) return false;
      const mx = playerFilters.max[k]; if (mx != null && Number(r[k]) > mx) return false;
    }
    return true;
  });

  const { key, dir } = playerSort;
  filtered.sort((a, b) => {
    if (key === "name") return dir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    let av, bv;
    if (key === "position") { av = POS_ORDER[a.position] ?? 9; bv = POS_ORDER[b.position] ?? 9; }
    else { av = Number(a[key]); bv = Number(b[key]); }
    return dir === "asc" ? av - bv : bv - av;
  });

  // 矢印（↑小さい順＝赤 / ↓大きい順＝緑）
  document.querySelectorAll("#player-head th.sortable").forEach((th) => {
    const arr = th.querySelector(".arr");
    if (th.dataset.sort === key) {
      arr.textContent = dir === "asc" ? "↑" : "↓";
      arr.className = "arr " + (dir === "asc" ? "arr-asc" : "arr-desc");
    } else {
      arr.textContent = "";
      arr.className = "arr";
    }
  });
  document.getElementById("player-count").textContent = filtered.length;

  let html = "";
  filtered.forEach((r, i) => {
    let tds = "";
    getActiveColumns().all.forEach((c) => {
      const st = frozenCss(c);
      const frz = c.frozen ? "frz " : "";
      if (c.type === "rank") {
        // 順位＝並び替えに追従（降順は1・2…、昇順は最大…と逆から数える）
        const rankNum = playerSort.dir === "asc" ? filtered.length - i : i + 1;
        tds += `<td class="rank ${frz}" style="${st}">${rankNum}</td>`;
      }
      else if (c.type === "photo") {
        const ph = r.photo ? `<img class="player-photo" loading="lazy" alt="" src="${PHOTO_BASE}${esc(r.photo)}.png" onerror="this.style.visibility='hidden'">` : "";
        tds += `<td class="col-photo ${frz}" style="${st}">${ph}</td>`;
      } else if (c.type === "name") {
        const ja = r.name_ja ? `<div class="name-ja">${esc(r.name_ja)}</div>` : "";
        tds += `<td class="col-name ${frz}" style="${st}"><div class="name">${esc(r.name)}</div>${ja}</td>`;
      } else if (c.type === "pos") {
        tds += `<td class="col-position ${frz}" style="${st}">${esc(r.position)}</td>`;
      } else if (c.type === "team") {
        const tm = (DATA.teams_meta && DATA.teams_meta[String(r.team_id)]) || null;
        const badge = (tm && tm.code)
          ? `<img class="team-badge" loading="lazy" alt="${esc(r.team)}" title="${esc(r.team)}" src="${BADGE_BASE}${tm.code}.png" onerror="this.replaceWith(document.createTextNode('${esc(r.team)}'))">`
          : esc(r.team);
        tds += `<td class="${frz}col-team" style="${st}">${badge}</td>`;
      } else if (c.type === "next3") {
        // 次の3試合：相手名＋その試合の得点期待値（選手のxG/90 × 相手の守備係数）
        const fx3 = (DATA.team_next3 && DATA.team_next3[String(r.team_id)]) || [];
        if (!fx3.length) {
          tds += `<td class="${frz}next3-cell"><span class="sub">—</span></td>`;
        } else {
          const lines = fx3.map((f) => {
            const expG = (Number(r.xg90) * f.f).toFixed(2);
            return `<div class="fx-line"><span class="fx-opp">${f.h ? "" : "@"}${esc(f.o)}</span><span class="fx-exp">${expG}</span></div>`;
          }).join("");
          tds += `<td class="${frz}next3-cell" style="${st}">${lines}</td>`;
        }
      } else {
        const main = c.key === "points" ? "main-num" : "";
        tds += `<td class="num ${frz}${main}" style="${st}">${esc(r[c.key])}</td>`;
      }
    });
    html += `<tr>${tds}</tr>`;
  });
  const colspan = getActiveColumns().all.length;
  document.getElementById("player-body").innerHTML =
    html || `<tr><td colspan="${colspan}" class="empty" style="box-shadow:none;">条件に合う選手がいません。</td></tr>`;
}

/* ---- 列の表示・並び替えパネル（動画用） ---- */
function renderColManager() {
  const frozenToggles = FROZEN_ORDER.map((k) => {
    const m = COL_META[k];
    const checked = !colState.hidden[k];
    return `<label class="coltoggle">
      <input type="checkbox" data-cm-show="${k}" ${checked ? "checked" : ""} ${m.lock ? "disabled" : ""}>
      ${m.label}${m.lock ? "（必須）" : ""}</label>`;
  }).join("");
  const dataItems = colState.dataOrder.map((k, i) => {
    const m = COL_META[k];
    const checked = !colState.hidden[k];
    return `<div class="colitem">
      <label class="coltoggle"><input type="checkbox" data-cm-show="${k}" ${checked ? "checked" : ""}> ${m.label}</label>
      <span class="colmove">
        <button type="button" data-cm-up="${k}" ${i === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-cm-down="${k}" ${i === colState.dataOrder.length - 1 ? "disabled" : ""}>↓</button>
      </span></div>`;
  }).join("");
  // データ列の「全て選択」チェック（全データ列が表示中なら on）
  const allDataShown = colState.dataOrder.every((k) => !colState.hidden[k]);
  // 「どこまで固定するか」の選択肢
  const fu = colState.freezeUntil ?? "points";
  const freezeOptions = [
    `<option value="none" ${fu === "none" ? "selected" : ""}>固定しない</option>`,
    ...FROZEN_ORDER.map((k) =>
      `<option value="${k}" ${fu === k ? "selected" : ""}>${COL_META[k].label}まで固定</option>`),
  ].join("");

  document.getElementById("col-manager").innerHTML = `
    <details class="col-manager" ${cmOpen ? "open" : ""}>
      <summary>⚙ 列の表示・並び替え</summary>
      <div class="cm-section">
        <div class="cm-title">左に固定する範囲（横スクロールしても残る列）</div>
        <select id="cm-freeze" class="cm-freeze">${freezeOptions}</select>
      </div>
      <div class="cm-section"><div class="cm-title">基本列の表示</div>${frozenToggles}</div>
      <div class="cm-section"><div class="cm-title">データ列（チェックで表示 ／ ↑↓で並び替え）</div>
        <label class="coltoggle cm-all"><input type="checkbox" id="cm-all" ${allDataShown ? "checked" : ""}> 全て選択</label>
        ${dataItems}
      </div>
      <div class="cm-actions">
        <button type="button" id="cm-reset" class="cm-reset">標準に戻す</button>
        <button type="button" id="cm-close" class="cm-reset">閉じる</button>
      </div>
    </details>`;
  const det = document.querySelector("#col-manager details");
  det.addEventListener("toggle", () => { cmOpen = det.open; });
}

function setupColManagerEvents() {
  const wrap = document.getElementById("col-manager");
  wrap.addEventListener("change", (e) => {
    // 固定範囲の変更
    if (e.target.id === "cm-freeze") {
      colState.freezeUntil = e.target.value;
      saveColState();
      buildPlayerHead();
      refreshPlayerBody();
      return;
    }
    // データ列を全て選択／全て解除（基本列には影響しない）
    if (e.target.id === "cm-all") {
      const show = e.target.checked;
      colState.dataOrder.forEach((k) => { colState.hidden[k] = !show; });
      afterColLayoutChange();
      return;
    }
    const cb = e.target.closest("[data-cm-show]");
    if (!cb) return;
    colState.hidden[cb.dataset.cmShow] = !cb.checked;
    saveColState();
    // データ列を個別に切り替えたら「全て選択」の状態も合わせる
    const all = document.getElementById("cm-all");
    if (all) all.checked = colState.dataOrder.every((k) => !colState.hidden[k]);
    buildPlayerHead();
    refreshPlayerBody();
  });
  wrap.addEventListener("click", (e) => {
    const up = e.target.closest("[data-cm-up]");
    const down = e.target.closest("[data-cm-down]");
    const reset = e.target.closest("#cm-reset");
    const close = e.target.closest("#cm-close");
    if (up) moveDataCol(up.dataset.cmUp, -1);
    else if (down) moveDataCol(down.dataset.cmDown, 1);
    else if (reset) { colState = defaultColState(); afterColLayoutChange(); }
    else if (close) {
      cmOpen = false;
      const det = document.querySelector("#col-manager details");
      if (det) det.open = false;
      // 閉じた後、⚙見出しが固定ヘッダー直下に来るようスクロールを戻す
      // （下部のボタンを押した位置のまま表の途中が表示されるのを防ぐ）
      const mgr = document.getElementById("col-manager");
      const bar = document.querySelector(".topbar");
      if (mgr) {
        const offset = bar ? bar.offsetHeight : 0;
        const y = window.scrollY + mgr.getBoundingClientRect().top - offset;
        window.scrollTo({ top: Math.max(0, y), behavior: "auto" });
      }
    }
  });
}
function moveDataCol(key, dir) {
  const arr = colState.dataOrder;
  const i = arr.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  afterColLayoutChange();
}
function afterColLayoutChange() {
  cmOpen = true;
  saveColState();
  renderColManager();
  buildPlayerHead();
  refreshPlayerBody();
}

/* ===========================================================
   チームタブ
   =========================================================== */
// チームランキング表の並び替え状態（選手タブと同じく見出しタップで昇順⇄降順）
let teamSort = { key: "points", dir: "desc" };
// 「直近」タブ内の期間切替（選手と共通の RECENT_WINDOWS を使用）。選んだ期間は記憶
let teamRecentWindow = (() => {
  try { const s = localStorage.getItem("fpl_team_recent_window"); if (RECENT_KEYS.includes(s)) return s; } catch (e) {}
  return "last5";
})();

function renderTeams(key) {
  const note = document.getElementById("teams-note");
  const box = document.getElementById("teams-content");
  const teams = DATA.teams || {};

  if (key === "totals") {
    note.textContent = "シーズン合計。失点＝実際に取られた得点、無失点率＝無失点で終えた割合。xG=攻撃の期待値、被xG=守備で許した期待値。見出しをタップで並べ替え。";
    drawTeamRankTable(box, teams.totals || []);
  } else if (key === "recent") {
    renderTeamRecent(box, note);
  } else if (key === "home") {
    note.textContent = "ホーム試合のみの合計。見出しをタップで並べ替え。";
    drawTeamRankTable(box, teams.home || []);
  } else if (key === "away") {
    note.textContent = "アウェイ試合のみの合計。見出しをタップで並べ替え。";
    drawTeamRankTable(box, teams.away || []);
  } else if (key === "by_gw") {
    note.textContent = "チームを選ぶと、節ごとの各データが見られます。";
    drawTeamByGw(box, teams.by_gw || []);
  }
}

// 「直近」タブ：期間セグメント（1/3/5/10試合）＋ランキング表
function renderTeamRecent(box, note) {
  note.textContent = "直近N試合の合計（期間は下のボタンで切替）。見出しをタップで並べ替え。";
  const win = teamRecentWindow;
  const rows = (DATA.teams && DATA.teams[win]) || [];
  const seg = `<div class="recent-seg" id="team-recent-seg">
      <span class="recent-seg-l">直近</span>
      ${RECENT_WINDOWS.map(([k, lbl]) =>
        `<button type="button" data-win="${k}" class="${k === win ? "is-on" : ""}">${lbl}</button>`).join("")}
    </div>`;
  box.innerHTML = seg + `<div id="team-recent-table"></div>`;
  drawTeamRankTable(document.getElementById("team-recent-table"), rows);
  box.querySelectorAll("#team-recent-seg button[data-win]").forEach((b) => b.addEventListener("click", () => {
    teamRecentWindow = b.dataset.win;
    try { localStorage.setItem("fpl_team_recent_window", teamRecentWindow); } catch (e) {}
    renderTeamRecent(box, note);
  }));
}

// 横長テーブルを全幅スクロールで囲む
function wideTable(inner) {
  return `<div class="fullbleed"><div class="data-table-wrap">${inner}</div></div>`;
}

// チーム名（文字列）からエンブレム画像HTMLを作る（見つからなければ文字のまま）
function teamBadgeByName(teamName) {
  const meta = DATA.teams_meta || {};
  const tm = Object.values(meta).find((m) => m.name === teamName);
  return (tm && tm.code)
    ? `<img class="team-badge" loading="lazy" alt="${esc(teamName)}" title="${esc(teamName)}" src="${BADGE_BASE}${tm.code}.png" onerror="this.replaceWith(document.createTextNode('${esc(teamName)}'))">`
    : esc(teamName);
}

// 合計・直近・ホーム・アウェイ 共通の項目（種類は従来の「合計」と同じ）
const TEAM_RANK_COLS = [
  { key: "rank",      label: "順位",        cls: "rank",     noSort: true },
  { key: "team",      label: "チーム",      cls: "col-name", kind: "team", noSort: true },
  { key: "points",    label: "ポイント",    kind: "main" },
  { key: "goals",     label: "ゴール" },
  { key: "assists",   label: "アシスト" },
  { key: "conceded",  label: "失点" },
  { key: "defcon",    label: "DEFCON" },
  { key: "yellow",    label: "イエロー" },
  { key: "red",       label: "レッド" },
  { key: "xg_total",  label: "xG" },
  { key: "xgc_total", label: "被xG" },
  { key: "cs_pct",    label: "無失点率",    kind: "pct" },
  { key: "cs_count",  label: "無失点/試合", kind: "csper" },
];

// チームのランキング表（見出しタップで昇順↑赤／降順↓緑に並べ替え。順位・チーム列は左に固定）
function drawTeamRankTable(box, rows) {
  if (!rows.length) return (box.innerHTML = emptyMessage("まだデータがありません。"));
  const { key, dir } = teamSort;
  const sorted = [...rows].sort((a, b) => {
    if (key === "team") return dir === "asc" ? a.team.localeCompare(b.team, "ja") : b.team.localeCompare(a.team, "ja");
    const av = Number(a[key]), bv = Number(b[key]);
    return dir === "asc" ? av - bv : bv - av;
  });

  const head = TEAM_RANK_COLS.map((c) => {
    const cls = [c.cls, c.noSort ? "" : "sortable"].filter(Boolean).join(" ");
    const on = key === c.key && !c.noSort;
    const arr = c.noSort ? ""
      : (on
        ? `<span class="arr ${dir === "asc" ? "arr-asc" : "arr-desc"}">${dir === "asc" ? "↑" : "↓"}</span>`
        : `<span class="arr"></span>`);
    return `<th class="${cls}"${c.noSort ? "" : ` data-sort="${c.key}"`}>${esc(c.label)}${arr}</th>`;
  }).join("");

  const cell = (r, c, rankNum) => {
    if (c.kind === "team") return `<td class="col-name"><div class="name">${teamBadgeByName(r.team)}</div></td>`;
    if (c.cls === "rank") return `<td class="rank">${rankNum}</td>`;
    if (c.kind === "main") return `<td class="main-num">${r[c.key]}</td>`;
    if (c.kind === "pct") return `<td>${r.cs_pct}%</td>`;
    if (c.kind === "csper") return `<td>${r.cs_count} / ${r.matches}</td>`;
    return `<td>${r[c.key]}</td>`;
  };
  // 順位＝並び替えに追従（降順は1・2…、昇順は最大…と逆から数える）
  const body = sorted.map((r, i) => {
    const rankNum = dir === "asc" ? sorted.length - i : i + 1;
    return `<tr>${TEAM_RANK_COLS.map((c) => cell(r, c, rankNum)).join("")}</tr>`;
  }).join("");

  box.innerHTML = wideTable(`<table class="rich teamtbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
  box.querySelector("thead").addEventListener("click", (e) => {
    const th = e.target.closest("th.sortable");
    if (!th) return;
    const k = th.dataset.sort;
    if (teamSort.key === k) teamSort.dir = teamSort.dir === "desc" ? "asc" : "desc";
    else { teamSort.key = k; teamSort.dir = (k === "team") ? "asc" : "desc"; }
    // 表を作り直すと横スクロール位置が失われるので、並び替え前の位置を保持して復元する
    const oldWrap = box.querySelector(".data-table-wrap");
    const sl = oldWrap ? oldWrap.scrollLeft : 0;
    const stp = oldWrap ? oldWrap.scrollTop : 0;
    drawTeamRankTable(box, rows);
    const newWrap = box.querySelector(".data-table-wrap");
    if (newWrap) { newWrap.scrollLeft = sl; newWrap.scrollTop = stp; }
  });
}

function drawTeamByGw(box, byGw) {
  if (!byGw.length) return (box.innerHTML = emptyMessage("まだデータがありません。"));
  let options = byGw.map((t, i) => `<option value="${i}">${esc(t.team)}</option>`).join("");
  box.innerHTML = `
    <select id="team-picker" class="picker">${options}</select>
    <div id="team-gw-table"></div>`;

  const picker = document.getElementById("team-picker");
  const render = () => {
    const t = byGw[Number(picker.value)];
    let html = `<table class="rich teamtbl tbl-gw"><thead><tr>
        <th class="col-name">節</th><th>ポイント</th><th>ゴール</th><th>アシスト</th><th>失点</th>
        <th>DEFCON</th><th>イエロー</th><th>レッド</th><th>xG</th><th>被xG</th>
      </tr></thead><tbody>`;
    t.matches.forEach((m) => {
      html += `<tr>
        <td class="col-name"><div class="name">第${m.round}節</div></td>
        <td class="main-num">${m.points}</td>
        <td>${m.goals}</td><td>${m.assists}</td><td>${m.conceded}</td>
        <td>${m.defcon}</td><td>${m.yellow}</td><td>${m.red}</td>
        <td>${m.xg}</td><td>${m.xgc}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
    document.getElementById("team-gw-table").innerHTML = wideTable(html);
  };
  picker.addEventListener("change", render);
  render();
}

/* ===========================================================
   次節タブ
   =========================================================== */
function renderNext(key) {
  const note = document.getElementById("next-note");
  const box = document.getElementById("next-content");

  if (key === "predict") {
    const pred = DATA.predictions || {};
    note.textContent =
      `予測の前提：リーグ平均xG（μ）＝${pred.league_avg_xg}。クリーンシート率＝相手が無失点に抑えられる確率。ゴール期待値＝そのチームが決めそうな得点数。`;
    drawPredictions(box, pred);
  } else if (key === "schedule") {
    note.textContent = "次節の試合と「相手の強さ」（弱い／普通／強い）。";
    drawSchedule(box, DATA.next_fixtures || {});
  }
}

function drawPredictions(box, pred) {
  const rows = pred.rows || [];
  if (!rows.length) {
    box.innerHTML = emptyMessage(
      "いまは次の試合の予定がありません（オフシーズンの可能性があります）。<br>" +
      "新シーズンが始まると、ここに各チームの「クリーンシート率」と「ゴール期待値」が表示されます。<br>" +
      "それまでは「チーム」タブの「直近フォーム」で各チームの調子を確認できます。"
    );
    return;
  }
  // 対戦ごとにまとめる（ホームを上に）。各試合はh/aの2行で来る
  const map = {};
  rows.forEach((r) => {
    const key = [r.team, r.opponent].slice().sort().join("");
    (map[key] = map[key] || []).push(r);
  });
  const matches = Object.values(map).map((pair) => {
    if (pair.length === 2) return pair[0].home_away === "ホーム" ? pair : [pair[1], pair[0]];
    return pair;
  });

  const teamRow = (r) => {
    const gHi = Number(r.goal_expect) >= 1.1 ? " hi-goal" : "";
    const csHi = Number(r.clean_sheet_pct) >= 44 ? " hi-cs" : "";
    return `<div class="pred-row">
      <span class="pred-team">${teamBadgeByName(r.team)}<span class="pred-tname">${esc(r.team)}</span></span>
      <span class="pred-cell${gHi}">${r.goal_expect}</span>
      <span class="pred-cell${csHi}">${Math.round(r.clean_sheet_pct)}%</span>
    </div>`;
  };
  const head = `<div class="pred-head"><span></span><span>ゴール期待値</span><span>クリーンシート％</span></div>`;
  const cards = matches.map((m) => `<div class="pred-match">${m.map(teamRow).join("")}</div>`);
  const mid = Math.ceil(cards.length / 2);
  const col1 = head + cards.slice(0, mid).join("");
  const col2 = cards.length > mid ? head + cards.slice(mid).join("") : "";

  let html = `<p class="note" style="font-weight:600;color:#37003c;">${esc(pred.event_name || "次節")}</p>`;
  html += `<div class="pred-cols"><div class="pred-col">${col1}</div><div class="pred-col">${col2}</div></div>`;
  box.innerHTML = html;
}

function drawSchedule(box, fx) {
  const matches = fx.matches || [];
  if (!matches.length) {
    box.innerHTML = emptyMessage(
      "いまは試合の予定がありません（オフシーズンの可能性があります）。<br>新シーズンが始まると、ここに次節の日程が表示されます。"
    );
    return;
  }
  let html = `<p class="note" style="font-weight:600;color:#37003c;">${esc(fx.event_name || "次節")}</p>`;
  matches.forEach((m) => {
    html += `<div class="match-card">
      <div class="match-time">${esc(m.kickoff)}</div>
      <div class="match-teams">
        <div class="match-team home">
          <div class="tname">${esc(m.home)}</div>
          <span class="strength ${m.home_opponent_strength_class}">相手：${esc(m.home_opponent_strength)}</span>
        </div>
        <div class="match-vs">vs</div>
        <div class="match-team away">
          <div class="tname">${esc(m.away)}</div>
          <span class="strength ${m.away_opponent_strength_class}">相手：${esc(m.away_opponent_strength)}</span>
        </div>
      </div>
    </div>`;
  });
  box.innerHTML = html;
}

/* ---------- 補助 ---------- */
function rankClass(rank) {
  if (rank === 1) return "rank-1";
  if (rank === 2) return "rank-2";
  if (rank === 3) return "rank-3";
  return "";
}
function emptyMessage(text) {
  return `<div class="empty">${text}</div>`;
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/* ===========================================================
   マイチーム検索（FPL ID → スカッド＆ミニリーグ）
   FPL公式APIはブラウザから直接呼べない（CORS制限）ため、
   無料の中継サービス(allorigins)経由で取得します。
   =========================================================== */

const FPL_API = "https://fantasy.premierleague.com/api/";
// 中継サービス（全部に同時に投げて、最初に成功した応答を採用する）
const PROXIES = [
  (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
];

// プロキシ2本を同時に競争させてテキストを取得（遅い方・失敗した方を待たない）
async function proxyFetchText(url) {
  const attempts = PROXIES.map((wrap) => (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);  // ハングした中継を待ち続けない
    try {
      const res = await fetch(wrap(url), { cache: "no-store", signal: ctrl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  })());
  return Promise.any(attempts);  // 最初に成功した方を返す（全滅なら reject）
}

async function fplFetch(path) {
  try {
    return JSON.parse(await proxyFetchText(FPL_API + path));
  } catch (e) {
    throw new Error("FPLサーバーに接続できませんでした。IDが正しいか、少し時間をおいて再度お試しください。");
  }
}

function setupMyTeam() {
  const input = document.getElementById("fpl-id");
  const btn = document.getElementById("id-go");
  if (!input || !btn) return;
  // 前回入力したIDを覚えておく
  try {
    const saved = localStorage.getItem("fpl_my_id");
    if (saved) input.value = saved;
  } catch (e) {}
  const go = () => {
    const id = parseInt(input.value, 10);
    if (!id || id <= 0) {
      document.getElementById("myteam-result").innerHTML = emptyMessage("FPL ID（数字）を入力してください。");
      return;
    }
    try { localStorage.setItem("fpl_my_id", String(id)); } catch (e) {}
    loadMyTeam(id);
  };
  btn.addEventListener("click", go);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
}

// data.json が知っている「最新の節」の番号（例: "第38節" → 38）。取れなければ null
function metaGw() {
  const m = String((DATA && DATA.meta && DATA.meta.latest_gameweek) || "").match(/(\d+)/);
  return m ? +m[1] : null;
}

// その節の選手別ポイントをバックグラウンドで取得し、届いたら得点と内訳を差し込む
function startLivePoints(gw, picks) {
  if (!gw || !picks) return;
  fplFetch(`event/${gw}/live/`).then((live) => {
    const lp = {};    // {element_id: その節の合計ポイント}
    const ex = {};    // {element_id: [{identifier, points, value}, ...]} 得点内訳
    (live.elements || []).forEach((e) => {
      lp[e.id] = (e.stats && e.stats.total_points) || 0;
      // 得点内訳。ダブルGW（1週2試合）は全試合分をまとめて1リストにする
      const lines = [];
      (e.explain || []).forEach((fx) => { (fx.stats || []).forEach((s) => lines.push(s)); });
      ex[e.id] = lines;
    });
    if (MT) { MT.livePoints = lp; MT.liveExplain = ex; if (MT.mode === "recent") renderSquadPitch(); }
  }).catch(() => { /* 得点が取れなくてもスカッドは表示済み */ });
}

const SQUAD_CACHE_PREFIX = "fpl_squad_cache_v1_";  // 前回取得したチーム情報（再訪時に即表示）

async function loadMyTeam(id) {
  const box = document.getElementById("myteam-result");

  // 前回のデータがあれば即表示（裏で最新を取得して、変わっていたら差し替え）
  const cacheKey = SQUAD_CACHE_PREFIX + id;
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(cacheKey)); } catch (e) {}
  if (cached && cached.entry) {
    renderMyTeam(cached.entry, cached.picks, cached.gw, null);
    startLivePoints(cached.gw, cached.picks);
  } else {
    box.innerHTML = `<div class="empty">読み込み中…（10秒ほどかかることがあります）</div>`;
  }

  try {
    // entry と picks を並列で取得（picksのGWは data.json の最新節で先読みし、外れたら取り直す）
    const guessGw = metaGw();
    const entryPromise = fplFetch(`entry/${id}/`);
    const guessPicksPromise = guessGw
      ? fplFetch(`entry/${id}/event/${guessGw}/picks/`).catch(() => null)
      : null;
    const entry = await entryPromise;
    const gw = entry.current_event;
    let picks = null;
    if (gw) {
      if (guessPicksPromise && guessGw === gw) picks = await guessPicksPromise;
      if (!picks) {
        try { picks = await fplFetch(`entry/${id}/event/${gw}/picks/`); } catch (e) { picks = null; }
      }
    }

    // 取得結果を保存。キャッシュ表示と同一内容なら再描画しない（ちらつき防止）
    const freshStr = JSON.stringify({ entry, picks, gw });
    try { localStorage.setItem(cacheKey, freshStr); } catch (e) {}
    const cachedStr = cached ? JSON.stringify({ entry: cached.entry, picks: cached.picks, gw: cached.gw }) : null;
    if (freshStr !== cachedStr) {
      renderMyTeam(entry, picks, gw, null);
      startLivePoints(gw, picks);
    }
  } catch (err) {
    // キャッシュを表示済みなら、裏の更新失敗は黙って無視（表示はそのまま使える）
    if (!cached) box.innerHTML = emptyMessage("取得に失敗しました。<br>" + esc(err.message || err));
  }
}

function fmtRank(n) {
  return (n == null) ? "-" : Number(n).toLocaleString("ja-JP");
}

function renderMyTeam(entry, picksData, gw, livePoints) {
  const box = document.getElementById("myteam-result");
  const elements = DATA.elements || {};

  // --- サマリー ---
  let html = `<div class="team-summary">
    <div class="team-title">${esc(entry.name || "(チーム名なし)")}</div>
    <div class="sub">${esc(entry.player_first_name || "")} ${esc(entry.player_last_name || "")}（${esc(entry.player_region_name || "")}）</div>
    <div class="team-stats">
      <div class="stat"><div class="stat-label">総合ポイント</div><div class="stat-value">${fmtRank(entry.summary_overall_points)}</div></div>
      <div class="stat"><div class="stat-label">総合順位</div><div class="stat-value">${fmtRank(entry.summary_overall_rank)}</div></div>
      <div class="stat"><div class="stat-label">直近節</div><div class="stat-value">${fmtRank(entry.summary_event_points)}pt</div></div>
    </div>
  </div>`;

  // --- スカッド（直近節＝結果表示 ／ 計画＝編集） ---
  const hasPicks = picksData && picksData.picks && picksData.picks.length;
  if (hasPicks) {
    html += `<div class="mt-subtabs">
      <button type="button" class="mt-subtab is-active" data-mode="recent">直近節</button>
      <button type="button" class="mt-subtab" data-mode="plan">計画</button>
    </div>
    <div id="mt-squad"></div>`;
  } else {
    html += `<h3 class="mt-h3">スカッド</h3>` + emptyMessage("スカッド情報を取得できませんでした（シーズン開始前の可能性があります）。");
  }

  // --- ミニリーグ ---
  const leagues = (entry.leagues && entry.leagues.classic) || [];
  const mini = leagues.filter((l) => l.league_type === "x");
  const official = leagues.filter((l) => l.league_type === "s");
  html += `<h3 class="mt-h3">ミニリーグ</h3>`;
  if (mini.length || official.length) {
    html += `<table class="squad"><thead><tr><th>リーグ名</th><th class="num">順位</th><th></th></tr></thead><tbody>`;
    [...mini, ...official].forEach((l) => {
      const tag = l.league_type === "x" ? "" : `<span class="sub">（公式）</span>`;
      html += `<tr>
        <td><div class="name">${esc(l.name)}</div>${tag}</td>
        <td class="num main-num">${fmtRank(l.entry_rank)}</td>
        <td class="num"><button type="button" class="lg-btn" data-league="${l.id}" data-name="${esc(l.name)}">順位表</button></td>
      </tr>`;
    });
    html += `</tbody></table><div id="league-standings"></div>`;
  } else {
    html += emptyMessage("参加中のリーグが見つかりませんでした。");
  }

  box.innerHTML = html;

  // スカッド（ピッチ）を初期化＋サブタブ切替
  if (hasPicks) {
    initSquadEditor(entry, picksData, gw, livePoints);
    box.querySelectorAll(".mt-subtab").forEach((b) => b.addEventListener("click", () => {
      if (!MT) return;
      MT.mode = b.dataset.mode; MT.sel = null; MT.swapFrom = null; MT.outs = []; MT.msg = null;
      box.querySelectorAll(".mt-subtab").forEach((x) => x.classList.toggle("is-active", x === b));
      renderSquadPitch();
    }));
  }

  // 順位表ボタン
  box.querySelectorAll(".lg-btn").forEach((b) => {
    b.addEventListener("click", () => loadLeagueStandings(b.dataset.league, b.dataset.name, entry.id));
  });
}

/* ===========================================================
   スカッド・ピッチ（編集可）
   - スタメン／ベンチの入れ替え（2人タップ）
   - 主将(C)・副主将(V)の変更
   - 移籍：所持していない選手を同ポジションから加える
   現状は現行GWのピックを土台に、次節以降のプランを編集できます。
   =========================================================== */
let MT = null;  // マイチーム編集状態

// チーム名 → エンブレムコード（キット画像用）
let _teamCodeByName = null;
function teamCodeByName(name) {
  if (!_teamCodeByName) {
    _teamCodeByName = {};
    Object.values(DATA.teams_meta || {}).forEach((t) => { _teamCodeByName[t.name] = t.code; });
  }
  return _teamCodeByName[name];
}
function kitUrl(el) {
  const code = teamCodeByName(el.t);
  if (!code) return null;
  const gk = el.p === "GK" ? "_1" : "";
  return `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${code}${gk}-66.png`;
}
function elOf(pick) {
  return DATA.elements[String(pick.element)] || { n: "ID " + pick.element, j: "", t: "", p: "?", c: 0 };
}

function initSquadEditor(entry, picksData, gw, livePoints) {
  const eh = picksData.entry_history || {};
  const baseSquad = picksData.picks.map((p) => ({
    element: p.element,
    position: p.position,
    is_captain: !!p.is_captain,
    is_vice_captain: !!p.is_vice_captain,
  }));
  const basePlanGw = Math.min((gw || 1) + 1, 38);  // プランを立てられる最初の節（次節）
  MT = {
    entry, gw,
    bank: eh.bank != null ? eh.bank / 10 : 0,
    teamValue: eh.value != null ? eh.value / 10 : 0,
    eventPoints: eh.points != null ? eh.points : (entry.summary_event_points != null ? entry.summary_event_points : null),
    eventTransfers: eh.event_transfers != null ? eh.event_transfers : 0,          // その節に使った移籍数
    eventTransfersCost: eh.event_transfers_cost != null ? eh.event_transfers_cost : 0,  // その節の移籍コスト(-4等)
    chip: picksData.active_chip || null,
    livePoints: livePoints || null,   // {element_id: その節のポイント}
    base: { squad: baseSquad, bank: eh.bank != null ? eh.bank / 10 : 0 },  // 現行GWの実スカッド（直近節タブ＆プランの起点）
    basePlanGw,
    planGw: basePlanGw,   // 計画タブで表示中のGW
    plans: {},            // {gw: {squad, bank, ft, inhElems}} 節ごとの独立プラン（前の節から引き継いで作る）
    sel: null,            // 詳細表示中の position(1-15)（カード本体タップ＝緑枠＋主将C等のバー）
    swapFrom: null,       // 入れ替え元の position（⇅タップ＝半透明。次にタップした選手と入れ替え）
    outs: [],             // 移籍OUT対象の position 一覧（✕タップ＝半透明。複数可・押した順）
    pickQ: "",            // 移籍候補の検索文字列（再描画時に保持）
    msg: null,
    msgToken: 0,          // ポップアップの世代番号（フェード中に次のメッセージへ差し替わっても誤って消さないため）
    mode: "recent",       // recent=直近節の結果表示 ／ plan=次節以降のプラン編集
    pickTeam: "",         // 移籍候補のチーム絞り込み（空文字＝すべて）
    pickMax: null,        // 移籍候補のコスト絞り込み（£m以下）
    pickStat: "cost",     // 移籍候補のスタッツ絞り込みの初期値＝コスト（コスト降順＋£表示。「なし」も選べる）
    pickOpen: null,       // 詳細を開いている候補の element_id（プルダウン展開）
  };
  restorePlans();
  bindMtOutsideClear();
  renderSquadPitch();
}

// スカッド外（カード・移籍候補・操作バー以外）をタップしたら、
// 選択（黄色枠）・入れ替え（⇅）・移籍OUT（✕）の状態をすべて解除する
let _mtOutsideBound = false;
function bindMtOutsideClear() {
  if (_mtOutsideBound) return;
  _mtOutsideBound = true;
  // キャプチャフェーズで判定する：候補リストやカード内のボタン（並び替え・フィルタ等）は
  // クリック時に自分自身でDOMを再構築するため、バブリングフェーズで見ると要素が既に
  // 差し替わっていて祖先判定(closest)に失敗し、誤って「外側タップ」扱いになってしまう。
  // キャプチャフェーズなら、そのボタン自身のクリック処理が動く前に判定できるため安全。
  document.addEventListener("click", (e) => {
    if (!MT || MT.mode !== "plan") return;
    if (MT.sel == null && MT.swapFrom == null && !MT.outs.length) return;
    const t = e.target;
    // カード（⇅✕含む）・候補リスト・操作バー・詳細ポップアップの中は、それぞれの処理に任せる
    if (t.closest && (t.closest(".mt-card") || t.closest(".mt-picker") || t.closest(".mt-info-slot") || t.closest(".mt-bd-overlay"))) return;
    MT.sel = null;
    MT.swapFrom = null;
    MT.outs = [];
    MT.pickQ = "";
    renderSquadPitch();
  }, true);
}

/* ---- 節ごとのプラン管理 ---- */
const PLAN_STORE_PREFIX = "fpl_plan_v1_";  // localStorageキー（FPL IDごと）

// 指定節より前で一番近いプランを探す（無ければ null＝実スカッドが起点）
function planSrc(gw) {
  for (let g = gw - 1; g >= MT.basePlanGw; g--) {
    if (MT.plans[g]) return { plan: MT.plans[g], gw: g };
  }
  return null;
}

// その節のプランでの移籍数（引き継いだスカッドとの差分）
function planMade(P) {
  const cur = new Set(P.squad.map((p) => p.element));
  return P.inhElems.filter((id) => !cur.has(id)).length;
}

// 表示する節のプランを用意（無ければ直前のプラン／実スカッドを引き継いで作成）
function ensurePlan(gw) {
  if (MT.plans[gw]) return MT.plans[gw];
  const src = planSrc(gw);
  let squad, bank, ft;
  if (src) {
    squad = src.plan.squad.map((p) => ({ ...p }));
    bank = src.plan.bank;
    // FTは「前節のFT − 使った数 ＋ 経過節数」を1〜5に丸める（FPLの繰り越しルール）
    ft = Math.min(5, Math.max(1, src.plan.ft - planMade(src.plan) + (gw - src.gw)));
  } else {
    squad = MT.base.squad.map((p) => ({ ...p }));
    bank = MT.base.bank;
    ft = 1;  // 公開APIでは実FT数が取れないため既定1（ステータスのタップで変更可）
  }
  MT.plans[gw] = { squad, bank, ft, inhElems: squad.map((p) => p.element) };
  return MT.plans[gw];
}

// この節を変更したら、これより後の節のプランは前提が崩れるので破棄
function invalidateAfter(gw) {
  let removed = false;
  Object.keys(MT.plans).forEach((g) => {
    if (+g > gw) { delete MT.plans[g]; removed = true; }
  });
  if (removed) MT.msg = "変更に合わせて、後の節のプランをリセットしました";
}

function savePlans() {
  try {
    localStorage.setItem(PLAN_STORE_PREFIX + MT.entry.id, JSON.stringify({
      baseGw: MT.gw, planGw: MT.planGw, plans: MT.plans,
    }));
  } catch (e) {}
}

// 保存済みプランの復元。節が進んで実スカッドが変わっていたら破棄
function restorePlans() {
  try {
    const s = JSON.parse(localStorage.getItem(PLAN_STORE_PREFIX + MT.entry.id));
    if (s && s.baseGw === MT.gw && s.plans) {
      MT.plans = s.plans;
      if (s.planGw >= MT.basePlanGw && s.planGw <= 38) MT.planGw = s.planGw;
    }
  } catch (e) {}
}

// この節の移籍一覧（OUT→IN）。同ポジション同士で対応付ける
function planDiffPairs(P) {
  const inh = new Set(P.inhElems);
  const curIds = P.squad.map((p) => p.element);
  const curSet = new Set(curIds);
  const outs = P.inhElems.filter((id) => !curSet.has(id));
  const ins = curIds.filter((id) => !inh.has(id));
  const posOf = (id) => (DATA.elements[String(id)] || {}).p || "?";
  const pairs = [];
  ["GK", "DF", "MF", "FW"].forEach((pos) => {
    const o = outs.filter((id) => posOf(id) === pos);
    const i = ins.filter((id) => posOf(id) === pos);
    for (let k = 0; k < Math.max(o.length, i.length); k++) pairs.push({ out: o[k], in: i[k] });
  });
  return pairs;
}


// 選手の表示ポイント（主将は倍率を反映）。live未取得なら null
function mtPoints(p) {
  if (!MT.livePoints) return null;
  const base = MT.livePoints[p.element] || 0;
  const mult = p.is_captain ? (MT.chip === "3xc" ? 3 : 2) : 1;
  return base * mult;
}

function mtCard(p) {
  const el = elOf(p);
  const kit = kitUrl(el);
  let img;
  if (el.ph) {
    const fb = kit ? `this.onerror=null;this.src='${kit}';this.classList.add('is-kit')` : `this.style.visibility='hidden'`;
    img = `<img class="mt-photo" src="${PHOTO_BASE}${esc(el.ph)}.png" alt="" loading="lazy" onerror="${fb}">`;
  } else {
    img = kit ? `<img class="mt-photo is-kit" src="${kit}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : "";
  }
  const cv = p.is_captain ? `<span class="mt-cv c">C</span>`
    : (p.is_vice_captain ? `<span class="mt-cv v">V</span>` : "");
  const sel = MT.sel === p.position ? " is-sel" : "";
  // 移籍OUT対象（✕・複数可）は半透明で示す
  const outSel = MT.outs.includes(p.position) ? " is-out" : "";
  const plan = MT.mode === "plan";
  // ⇅の入れ替え中：元の選手は赤枠、入れ替えできる相手は緑枠でガイド
  const swapSrc = MT.swapFrom === p.position ? " is-swapsrc" : "";
  const swapOk = (plan && MT.swapFrom != null && MT.swapFrom !== p.position && mtSwapTargetOk(MT.swapFrom, p.position))
    ? " is-swapok" : "";
  // 計画タブ：左上=スタメン⇄ベンチ入れ替え、右上=移籍（LiveFPL風）。C/Vは⇅の下に表示（CSS側で位置指定）
  const ctrls = plan
    ? `<span class="mt-ctrl mt-ctrl-swap" data-pos="${p.position}" role="button" title="スタメン⇄ベンチ入れ替え">⇅</span>
       <span class="mt-ctrl mt-ctrl-x" data-pos="${p.position}" role="button" title="移籍候補を見る">✕</span>`
    : "";
  let foot;
  if (MT.mode === "plan") {
    // 計画タブ：移籍・予算検討のためコストを表示
    foot = `<span class="mt-pts mt-cost">£${el.c}m</span>`;
  } else {
    // 直近節タブ：その節のポイント結果（色分け）
    const pts = mtPoints(p);
    if (pts == null) {
      foot = `<span class="mt-pts">-</span>`;
    } else {
      let cls;
      if (pts <= 1) cls = " p01";        // 0〜1pt
      else if (pts <= 3) cls = " p23";   // 2,3pt
      else if (pts <= 9) cls = " p49";   // 4〜9pt
      else cls = " p10";                 // 10pt〜
      foot = `<span class="mt-pts${cls}">${pts}pt</span>`;
    }
  }
  const nm = el.j || el.n;
  return `<button type="button" class="mt-card${plan ? " is-plan" : ""}${sel}${outSel}${swapSrc}${swapOk}" data-pos="${p.position}">
    <span class="mt-photo-wrap">${img}${ctrls}${cv}</span>
    <span class="mt-name">${esc(nm)}</span>
    ${foot}
  </button>`;
}

function validFormation(squad) {
  const c = { GK: 0, DF: 0, MF: 0, FW: 0 };
  squad.filter((p) => p.position <= 11).forEach((p) => { const e = elOf(p); c[e.p] = (c[e.p] || 0) + 1; });
  return c.GK === 1 && c.DF >= 3 && c.MF >= 2 && c.FW >= 1 && (c.DF + c.MF + c.FW === 10);
}

// a の選手の入れ替え先として b が有効か（実際には入れ替えず判定だけ）。
// スタメン同士は並び順が変わるだけなので対象外。GK制限とフォーメーション制限を確認
function mtSwapTargetOk(a, b) {
  if (a <= 11 && b <= 11) return false;
  const P = MT.plans[MT.planGw];
  const A = P.squad.find((p) => p.position === a);
  const B = P.squad.find((p) => p.position === b);
  if (!A || !B) return false;
  const roleChange = (a <= 11) !== (b <= 11);
  if (roleChange && (elOf(A).p === "GK") !== (elOf(B).p === "GK")) return false;
  [A.position, B.position] = [B.position, A.position];
  const ok = validFormation(P.squad);
  [A.position, B.position] = [B.position, A.position];
  return ok;
}

function renderSquadPitch() {
  const wrap = document.getElementById("mt-squad");
  if (!wrap || !MT) return;
  // 計画タブは「表示中の節のプラン」、直近節タブは実スカッドを描く
  const squadSrc = MT.mode === "plan" ? ensurePlan(MT.planGw).squad : MT.base.squad;
  const starters = squadSrc.filter((p) => p.position <= 11);
  const bench = squadSrc.filter((p) => p.position > 11).sort((a, b) => a.position - b.position);
  const byPos = (pos) => starters.filter((p) => elOf(p).p === pos).sort((a, b) => a.position - b.position);
  const rows = ["GK", "DF", "MF", "FW"]
    .map((pos) => `<div class="mt-row">${byPos(pos).map(mtCard).join("")}</div>`).join("");

  if (MT.mode === "plan") {
    // ===== 計画タブ：GWナビ＋ステータス＋編集＋移籍サマリー =====
    const P = MT.plans[MT.planGw];
    // 操作説明は固定表示。選手の詳細・C/V選択・移籍はカードのタップ／✕から行う
    let bar = "";
    if (MT.msg) {
      bar = `<div class="mt-msg">${esc(MT.msg)}</div>`;
      // 3秒後にうっすらフェードして消え、通常の説明文に戻る（同じ世代のメッセージが表示中の時だけ）
      const token = ++MT.msgToken;
      setTimeout(() => {
        if (MT.msgToken !== token) return;
        const el = document.querySelector("#mt-squad .mt-msg");
        if (el) el.classList.add("is-fading");
        setTimeout(() => {
          if (MT.msgToken === token) { MT.msg = null; renderSquadPitch(); }
        }, 400);
      }, 2600);
    } else {
      // 何も選択していないときは操作の説明を常時表示（⇅✕はスカッドのアイコンと同じ見た目）
      bar = `<div class="mt-hint"><span class="mt-hint-ic ic-swap">⇅</span>でスタメンとベンチを入れ替え<span class="mt-hint-ic ic-x">✕</span>で移籍</div>`;
    }

    const made = planMade(P);
    const free = P.ft;
    const cost = Math.max(0, made - free) * 4;

    // この節の移籍プラン（OUT→IN の一覧）
    const pairs = planDiffPairs(P);
    const trRows = pairs.map((t) => {
      const o = t.out ? DATA.elements[String(t.out)] : null;
      const i = t.in ? DATA.elements[String(t.in)] : null;
      return `<div class="mt-tr-row">
        <span class="mt-tr-side out"><span class="mt-tr-tag">OUT</span>${o ? esc(o.j || o.n) : "-"}<span class="sub">£${o ? o.c : "-"}m</span></span>
        <span class="mt-tr-arrow">→</span>
        <span class="mt-tr-side in"><span class="mt-tr-tag">IN</span>${i ? esc(i.j || i.n) : "-"}<span class="sub">£${i ? i.c : "-"}m</span></span>
      </div>`;
    }).join("") || `<div class="mt-tr-none">この節の移籍はまだありません（カード右上の✕から候補を選べます）</div>`;

    wrap.innerHTML = `
      <div class="mt-head">
        <div class="mt-gwnav">
          <button type="button" class="mt-gw-btn" data-gw="prev" ${MT.planGw <= MT.basePlanGw ? "disabled" : ""}>‹ 前</button>
          <span class="mt-gw-cur">第${MT.planGw}節</span>
          <button type="button" class="mt-gw-btn" data-gw="next" ${MT.planGw >= 38 ? "disabled" : ""}>次 ›</button>
        </div>
        <div class="mt-stats">
          <div class="mt-stat"><span class="mt-stat-l">チップ</span><span class="mt-stat-v">${MT.chip ? esc(MT.chip) : "なし"}</span></div>
          <button type="button" class="mt-stat mt-stat-btn" id="mt-ft-toggle" title="タップで無料移籍数を変更（1〜5）">
            <span class="mt-stat-l">移籍/FT ✎</span><span class="mt-stat-v">${made}/${free}</span>
          </button>
          <div class="mt-stat"><span class="mt-stat-l">資金</span><span class="mt-stat-v">£${P.bank.toFixed(1)}m</span></div>
          <div class="mt-stat"><span class="mt-stat-l">コスト</span><span class="mt-stat-v${cost > 0 ? " neg" : ""}">${cost > 0 ? "-" + cost : "0"}</span></div>
        </div>
      </div>
      <div class="mt-info-slot">${bar}</div>
      <div class="mt-pitch-outer">
        <div class="mt-pitch-wrap">
          <div class="mt-pitch">${rows}</div>
          <div class="mt-bench">${bench.map(mtCard).join("")}</div>
        </div>
      </div>
      <div id="mt-picker" class="mt-picker" hidden></div>
      <div class="mt-transfers">
        <div class="mt-tr-head">
          <span>第${MT.planGw}節の移籍プラン${made ? `（${made}件）` : ""}</span>
          <button type="button" id="mt-plan-reset" title="この節以降の変更をすべて取り消す">この節をリセット</button>
        </div>
        ${trRows}
      </div>`;

    wrap.querySelectorAll(".mt-card").forEach((c) => c.addEventListener("click", onMtCardClick));
    // 左上⇅＝入れ替えフロー（詳細バーは出さない）。半透明で入れ替え元を示し、次のタップで実行
    wrap.querySelectorAll(".mt-ctrl-swap").forEach((s) => s.addEventListener("click", (e) => {
      e.stopPropagation();
      const pos = +s.dataset.pos;
      if (MT.swapFrom === pos) { MT.swapFrom = null; renderSquadPitch(); return; }  // もう一度⇅で解除
      if (MT.swapFrom != null) {
        if (mtSwapTargetOk(MT.swapFrom, pos)) tryMtSwap(MT.swapFrom, pos);
        return;  // 緑枠以外は無視（入れ替えモード継続）
      }
      MT.swapFrom = pos;
      MT.sel = null;
      MT.outs = [];
      renderSquadPitch();
    }));
    // 右上✕＝移籍フロー（詳細バーは出さない）。複数選手を同時にOUT対象にできる（もう一度✕で解除）
    wrap.querySelectorAll(".mt-ctrl-x").forEach((s) => s.addEventListener("click", (e) => {
      e.stopPropagation();
      const pos = +s.dataset.pos;
      MT.sel = null;
      MT.swapFrom = null;
      if (MT.outs.includes(pos)) MT.outs = MT.outs.filter((x) => x !== pos);
      else MT.outs.push(pos);
      renderSquadPitch();  // OUT対象があれば候補リストも自動で開く
    }));
    wrap.querySelectorAll(".mt-gw-btn").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.gw === "prev" && MT.planGw > MT.basePlanGw) MT.planGw--;
      else if (b.dataset.gw === "next" && MT.planGw < 38) MT.planGw++;
      MT.sel = null; MT.swapFrom = null; MT.outs = [];
      savePlans();
      renderSquadPitch();
    }));
    // 移籍/FTステータスのタップで無料移籍数を1〜5で切り替え（公開APIから取れないため手動設定）
    wrap.querySelector("#mt-ft-toggle").addEventListener("click", () => {
      P.ft = (P.ft % 5) + 1;
      savePlans();
      renderSquadPitch();
    });
    // OUT対象が残っていれば候補リストを開いたままにする（検索文字列も保持）
    if (MT.outs.length) renderMtPicker(MT.pickQ || "");

    // この節以降のプランを破棄して引き継ぎ状態に戻す
    wrap.querySelector("#mt-plan-reset").addEventListener("click", () => {
      Object.keys(MT.plans).forEach((g) => { if (+g >= MT.planGw) delete MT.plans[g]; });
      MT.sel = null; MT.swapFrom = null; MT.outs = [];
      MT.msg = "この節以降のプランをリセットしました";
      savePlans();
      renderSquadPitch();
    });
  } else {
    // ===== 直近節タブ：結果（ポイント）の読み取り専用 =====
    // 上部は計画タブと同じ（前/次は無し）＝第N節＋ステータス（チップ/移籍/資金/コスト）
    let header;
    if (MT.livePoints) {
      const cost = MT.eventTransfersCost || 0;
      header = `<div class="mt-gwnav"><span class="mt-gw-cur">第${MT.gw}節</span></div>
        <div class="mt-stats">
          <div class="mt-stat"><span class="mt-stat-l">チップ</span><span class="mt-stat-v">${MT.chip ? esc(MT.chip) : "なし"}</span></div>
          <div class="mt-stat"><span class="mt-stat-l">移籍</span><span class="mt-stat-v">${MT.eventTransfers != null ? MT.eventTransfers : 0}</span></div>
          <div class="mt-stat"><span class="mt-stat-l">資金</span><span class="mt-stat-v">£${MT.bank.toFixed(1)}m</span></div>
          <div class="mt-stat"><span class="mt-stat-l">コスト</span><span class="mt-stat-v${cost > 0 ? " neg" : ""}">${cost > 0 ? "-" + cost : "0"}</span></div>
        </div>`;
    } else {
      header = `<div class="mt-loading-msg">ポイント反映まで時間がかかっています...</div>`;
    }
    // スカッド上の情報行：自分のスタメン合計と、FPLプレイヤー全体のその節の平均ポイント（公式のAverage）
    let total = "−";
    if (MT.livePoints) {
      const st = MT.base.squad.filter((p) => p.position <= 11);
      total = st.reduce((n, p) => n + (mtPoints(p) || 0), 0);
    }
    const avgMap = (DATA.meta && DATA.meta.event_averages) || {};
    const avg = avgMap[String(MT.gw)] != null ? avgMap[String(MT.gw)] : "−";
    wrap.innerHTML = `
      <div class="mt-head${MT.livePoints ? "" : " mt-head-center"}">${header}</div>
      <div class="mt-info-slot"><div class="mt-hint"><b>合計：</b>${total}ポイント　<b>プレイヤー平均：</b>${avg}ポイント</div></div>
      <div class="mt-pitch-outer">
        <div class="mt-pitch-wrap mt-readonly">
          <div class="mt-pitch">${rows}</div>
          <div class="mt-bench">${bench.map(mtCard).join("")}</div>
        </div>
      </div>`;
    // カードをタップ→黄色枠（計画タブと同じ）＋得点内訳ポップアップ（ポイント取得済みのときだけ）
    if (MT.livePoints) {
      wrap.querySelectorAll(".mt-card").forEach((c) =>
        c.addEventListener("click", () => {
          const pos = +c.dataset.pos;
          MT.sel = pos;
          wrap.querySelectorAll(".mt-card.is-sel").forEach((x) => x.classList.remove("is-sel"));
          c.classList.add("is-sel");
          openMtBreakdown(pos);
        }));
    }
  }
}

// ポイントバッジの色分け（0〜1=赤 / 2,3=灰 / 4〜9=薄緑 / 10〜=濃緑）
function ptsClass(pts) {
  if (pts <= 1) return "p01";
  if (pts <= 3) return "p23";
  if (pts <= 9) return "p49";
  return "p10";
}

// FPLの得点内訳の項目名（identifier）→日本語ラベル
const EXPLAIN_JA = {
  minutes: "出場",
  goals_scored: "ゴール",
  assists: "アシスト",
  clean_sheets: "無失点",
  goals_conceded: "失点",
  own_goals: "オウンゴール",
  penalties_saved: "PKセーブ",
  penalties_missed: "PK失敗",
  saves: "セーブ",
  yellow_cards: "イエロー",
  red_cards: "レッド",
  bonus: "ボーナス",
  defensive_contribution: "守備貢献",
};

// 選手写真のimg HTML（無ければユニフォーム、それも無ければ非表示）
function mtPhotoImg(el) {
  const kit = kitUrl(el);
  if (el.ph) {
    const fb = kit ? `this.onerror=null;this.src='${kit}'` : `this.style.visibility='hidden'`;
    return `<img src="${PHOTO_BASE}${esc(el.ph)}.png" alt="" onerror="${fb}">`;
  }
  if (kit) return `<img src="${kit}" alt="" onerror="this.style.visibility='hidden'">`;
  return "";
}

// ポップアップの外枠を作ってピッチ枠（フィールド）の中に挿入し、閉じる処理を配線する。
// 下端をフィールド下端に合わせる。headerRight＝名前の右のバッジ、onWire＝追加のイベント配線。
function openMtPopup({ el, cvTag, headerRight, body, ariaLabel, onWire }) {
  const img = mtPhotoImg(el);
  const host = document.querySelector("#mt-squad .mt-pitch-wrap") || document.body;
  const old = document.getElementById("mt-bd-overlay");
  if (old) old.remove();
  host.insertAdjacentHTML("beforeend", `
    <div class="mt-bd-overlay" id="mt-bd-overlay">
      <div class="mt-bd-sheet" role="dialog" aria-label="${ariaLabel}">
        <div class="mt-bd-head">
          <span class="mt-bd-photo">${img}</span>
          <span class="mt-bd-id">
            <span class="mt-bd-name">${esc(el.j || el.n)}${cvTag || ""}</span>
            <span class="mt-bd-meta">${esc(el.t)} ・ ${el.p}</span>
          </span>
          ${headerRight || ""}
          <button type="button" class="mt-bd-close" aria-label="閉じる">×</button>
        </div>
        <div class="mt-bd-body">${body}</div>
      </div>
    </div>`);
  const ov = document.getElementById("mt-bd-overlay");
  const closeBd = () => {
    ov.remove();
    // 閉じたら黄色枠（選択状態）も解除する
    MT.sel = null;
    document.querySelectorAll("#mt-squad .mt-card.is-sel").forEach((x) => x.classList.remove("is-sel"));
  };
  // ×ボタン、または暗幕（シートの外）をタップで閉じる。シート内のタップでは閉じない
  ov.addEventListener("click", (e) => {
    if (e.target === ov || e.target.closest(".mt-bd-close")) closeBd();
  });
  if (onWire) onWire(ov, closeBd);
  requestAnimationFrame(() => ov.classList.add("is-open"));
}

// 直近節タブ：カードをタップしたら、その選手の得点内訳をポップアップ表示
function openMtBreakdown(pos) {
  if (!MT || !MT.liveExplain) return;
  const pick = MT.base.squad.find((p) => p.position === pos);
  if (!pick) return;
  const el = elOf(pick);
  // 0ポイントの項目（例：イエロー0枚）は出さない
  const lines = (MT.liveExplain[pick.element] || []).filter((s) => s.points);
  const base = MT.livePoints ? (MT.livePoints[pick.element] || 0) : 0;
  const mult = pick.is_captain ? (MT.chip === "3xc" ? 3 : 2) : 1;
  const total = base * mult;

  // ボーナス・守備貢献は value が得点そのもの／達成度なので「×N」を付けない
  const noCount = { bonus: 1, defensive_contribution: 1 };
  const rowsHtml = lines.map((s) => {
    const ja = EXPLAIN_JA[s.identifier] || s.identifier;
    let label;
    if (s.identifier === "minutes") label = `出場（${s.value}分）`;
    else if (s.value > 1 && !noCount[s.identifier]) label = `${ja} ×${s.value}`;
    else label = ja;
    const pts = s.points > 0 ? `+${s.points}` : `${s.points}`;
    return `<div class="mt-bd-row"><span>${label}</span><span>${pts}</span></div>`;
  }).join("");
  // 各項目の下に合計行（主将は 小計→合計（C×N））
  const totalHtml = mult > 1
    ? `<div class="mt-bd-row mt-bd-sub"><span>小計</span><span>${base}</span></div>
       <div class="mt-bd-row mt-bd-total-row"><span>合計（C ×${mult}）</span><span>${total}</span></div>`
    : `<div class="mt-bd-row mt-bd-total-row"><span>合計</span><span>${total}</span></div>`;

  const cvTag = pick.is_captain ? ` <span class="mt-bd-c">(C)</span>`
    : (pick.is_vice_captain ? ` <span class="mt-bd-c">(V)</span>` : "");
  const body = lines.length
    ? rowsHtml + totalHtml
    : `<div class="mt-bd-none">この節は出場していません</div>`;

  openMtPopup({
    el, cvTag, ariaLabel: "得点内訳", body,
    headerRight: `<span class="mt-pts ${ptsClass(total)} mt-bd-total">${total}pt</span>`,
  });
}

// 計画タブ：ポジション別に表示するシーズンスタッツ
const SEASON_STAT_LABELS = {
  points: "ポイント", goals: "ゴール", assists: "アシスト", clean_sheets: "無失点",
  saves: "セーブ", pk_saved: "PKストップ", defcon90: "DEFCON/90",
  xg90: "xG/90", xa90: "xA/90", bonus: "ボーナス",
};
const POS_STATS = {
  GK: ["points", "assists", "clean_sheets", "saves", "pk_saved", "bonus"],
  DF: ["points", "goals", "assists", "clean_sheets", "defcon90", "bonus"],
  MF: ["points", "goals", "assists", "xg90", "defcon90", "bonus"],
  FW: ["points", "goals", "assists", "xg90", "xa90", "bonus"],
};
const SEASON_STAT_FLOAT = { defcon90: 1, xg90: 1, xa90: 1 };  // 小数2桁で表示する項目

// 写真コード → シーズンスタッツ（data.json の players.all）。初回だけ作る
let _seasonByPhoto = null;
function seasonStatsFor(el) {
  if (!_seasonByPhoto) {
    _seasonByPhoto = {};
    ((DATA.players && DATA.players.all) || []).forEach((r) => {
      if (r.photo) _seasonByPhoto[String(r.photo)] = r;
    });
  }
  return el.ph ? _seasonByPhoto[String(el.ph)] : null;
}

// 計画タブ：カードをタップしたら、ポジション別スタッツ＋C/V選択のポップアップを表示
function openMtPlanStats(pos) {
  const P = MT.plans[MT.planGw];
  const pick = P.squad.find((p) => p.position === pos);
  if (!pick) return;
  const el = elOf(pick);
  const stats = seasonStatsFor(el);
  const posKey = POS_STATS[el.p] ? el.p : "MF";
  const rowsHtml = POS_STATS[posKey].map((f) => {
    let v = stats ? stats[f] : null;
    if (v == null) v = "−";
    else if (SEASON_STAT_FLOAT[f]) v = Number(v).toFixed(2);
    return `<div class="mt-bd-row"><span>${SEASON_STAT_LABELS[f]}</span><span>${v}</span></div>`;
  }).join("");
  // 名前の右にC/V選択バッジ（現在の主将/副将をハイライト）
  const headerRight = `<span class="mt-bd-cv">
    <button type="button" class="mt-bd-cvbtn c${pick.is_captain ? " is-on" : ""}" data-cv="cap">C</button>
    <button type="button" class="mt-bd-cvbtn v${pick.is_vice_captain ? " is-on" : ""}" data-cv="vice">V</button>
  </span>`;
  openMtPopup({
    el, cvTag: "", ariaLabel: "選手スタッツ", body: rowsHtml, headerRight,
    onWire: (ov) => {
      ov.querySelectorAll("[data-cv]").forEach((b) => b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (b.dataset.cv === "cap") {
          P.squad.forEach((p) => { p.is_captain = false; });
          pick.is_captain = true; pick.is_vice_captain = false;
        } else {
          P.squad.forEach((p) => { p.is_vice_captain = false; });
          pick.is_vice_captain = true; pick.is_captain = false;
        }
        invalidateAfter(MT.planGw); savePlans();
        MT.sel = null;
        renderSquadPitch();  // カードのC/Vバッジに反映（ポップアップは閉じる）
      }));
    },
  });
}

// カード本体タップ：入れ替え待ちなら緑枠の相手のみ実行、そうでなければ
// 黄色枠＋シーズンスタッツ＋C/V選択のポップアップを開く
function onMtCardClick(e) {
  const pos = +e.currentTarget.dataset.pos;
  if (MT.swapFrom != null) {
    if (MT.swapFrom === pos) { MT.swapFrom = null; renderSquadPitch(); return; }
    if (mtSwapTargetOk(MT.swapFrom, pos)) tryMtSwap(MT.swapFrom, pos);
    return;  // 緑枠以外は無視（入れ替えモード継続）
  }
  MT.sel = pos;
  const wrap = document.getElementById("mt-squad");
  wrap.querySelectorAll(".mt-card.is-sel").forEach((x) => x.classList.remove("is-sel"));
  e.currentTarget.classList.add("is-sel");
  openMtPlanStats(pos);
}

function tryMtSwap(a, b) {
  const P = MT.plans[MT.planGw];
  const A = P.squad.find((p) => p.position === a);
  const B = P.squad.find((p) => p.position === b);
  const ea = elOf(A), eb = elOf(B);
  const roleChange = (a <= 11) !== (b <= 11);
  if (roleChange && (ea.p === "GK") !== (eb.p === "GK")) {
    MT.msg = "GKはGK同士でのみ入れ替えできます"; MT.sel = null; MT.swapFrom = null; renderSquadPitch(); return;
  }
  [A.position, B.position] = [B.position, A.position];
  if (!validFormation(P.squad)) {
    [A.position, B.position] = [B.position, A.position];
    MT.msg = "そのフォーメーションは選べません（GK1・DF3+・MF2+・FW1+）";
    MT.sel = null; MT.swapFrom = null; renderSquadPitch(); return;
  }
  invalidateAfter(MT.planGw);
  savePlans();
  MT.sel = null; MT.swapFrom = null; renderSquadPitch();
}

// 移籍候補のチーム絞り込み用の一覧（チーム名の五十音順）。DATA読み込み後に1回だけ作る
let _teamFilterList = null;
function teamFilterList() {
  if (!_teamFilterList) {
    _teamFilterList = Object.values(DATA.teams_meta || {})
      .map((t) => t.name)
      .sort((a, b) => a.localeCompare(b, "ja"));
  }
  return _teamFilterList;
}

function renderMtPicker(query) {
  const box = document.getElementById("mt-picker");
  if (!box || !MT.outs.length) return;
  const P = MT.plans[MT.planGw];
  // OUT対象（✕を押した順）。候補と同じポジションの先頭が入れ替え相手になる
  const outPicks = MT.outs.map((pos) => P.squad.find((p) => p.position === pos)).filter(Boolean);
  const outEls = outPicks.map(elOf);
  const posTypes = [...new Set(outEls.map((e) => e.p))];
  const outFor = (cand) => outEls.find((e) => e.p === cand.p) || null;
  const ownedNow = new Set(P.squad.map((p) => p.element));
  const q = (query || "").trim();
  MT.pickQ = q;
  const ql = q.toLowerCase();
  const afterOf = (e) => { const o = outFor(e); return P.bank + (o ? o.c : 0) - e.c; };

  let list = Object.entries(DATA.elements)
    .map(([id, e]) => ({ id: +id, ...e }))
    .filter((e) => posTypes.includes(e.p) && !ownedNow.has(e.id))
    .filter((e) => !q || e.n.toLowerCase().includes(ql) || (e.j && e.j.includes(q)))
    .filter((e) => !MT.pickTeam || e.t === MT.pickTeam)
    .filter((e) => MT.pickMax == null || e.c <= MT.pickMax);

  // スタッツ絞り込みが選ばれていればそのスタッツ降順、なければポイント降順
  const sortKey = MT.pickStat || "points";
  const sortVal = (e) => { const v = pickStatValue(e, sortKey); return v == null ? -Infinity : v; };
  list.sort((a, b) => sortVal(b) - sortVal(a) || b.c - a.c);
  list = list.slice(0, 100);

  // 候補行：ユニフォーム＋英語名（＋スタッツ絞り込み時はその値）＋＋ボタン。タップで詳細プルダウン
  const rowHtml = list.map((e) => {
    const after = afterOf(e);
    const kit = kitUrl(e);
    const open = MT.pickOpen === e.id;
    const statCell = MT.pickStat ? `<span class="mt-pick-stat">${pickStatDisplay(e, MT.pickStat)}</span>` : "";
    return `<div class="mt-pick-item${open ? " is-open" : ""}">
      <div class="mt-pick-row${after < 0 ? " over" : ""}">
        <button type="button" class="mt-pick-main" data-open="${e.id}">
          <span class="mt-pick-kit">${kit ? `<img src="${kit}" loading="lazy" onerror="this.style.visibility='hidden'">` : ""}</span>
          <span class="mt-pick-name">${esc(e.n)}</span>
          ${statCell}
        </button>
        <button type="button" class="mt-pick-add" data-add="${e.id}" aria-label="この選手を入れる">＋</button>
      </div>
      ${open ? `<div class="mt-pick-detail">${pickDetailHtml(e)}</div>` : ""}
    </div>`;
  }).join("") || `<div class="empty" style="box-shadow:none;">候補が見つかりません</div>`;

  const teamOptHtml = teamFilterList().map((name) =>
    `<option value="${esc(name)}" ${MT.pickTeam === name ? "selected" : ""}>${esc(name)}</option>`).join("");
  const statOptHtml = STAT_FILTER_OPTS.map(([k, l]) =>
    `<option value="${k}" ${MT.pickStat === k ? "selected" : ""}>${l}</option>`).join("");

  box.hidden = false;
  const prevList = box.querySelector(".mt-picker-list");
  const savedScroll = prevList ? prevList.scrollTop : 0;
  box.innerHTML = `
    <div class="mt-picker-head">
      <strong>OUT: ${outEls.map((e) => esc(e.j || e.n)).join("・")} の候補</strong>
      <button type="button" id="mt-picker-close">✕</button>
    </div>
    <input type="search" id="mt-picker-q" placeholder="選手名で検索（英字／カタカナ）" value="${esc(q)}">
    <div class="mt-picker-tools">
      <label class="mt-fteam">チーム
        <select id="mt-picker-team"><option value="">すべて</option>${teamOptHtml}</select>
      </label>
      <label class="mt-fstat">スタッツ
        <select id="mt-picker-stat"><option value="">なし</option>${statOptHtml}</select>
      </label>
      <label class="mt-maxwrap">コスト£<input id="mt-picker-max" type="number" inputmode="decimal" step="0.5" min="3.5" max="15.5" value="${MT.pickMax != null ? MT.pickMax : ""}" placeholder="なし">m以下</label>
    </div>
    <div class="mt-picker-list">${rowHtml}</div>`;
  const newList = box.querySelector(".mt-picker-list");
  if (newList) newList.scrollTop = savedScroll;
  box.querySelector("#mt-picker-close").addEventListener("click", () => {
    box.hidden = true; MT.sel = null; MT.outs = []; MT.pickQ = ""; MT.pickOpen = null; renderSquadPitch();
  });
  const qi = box.querySelector("#mt-picker-q");
  qi.addEventListener("input", () => renderMtPicker(qi.value));
  box.querySelector("#mt-picker-team").addEventListener("change", (e) => {
    MT.pickTeam = e.target.value; renderMtPicker(qi.value);
  });
  box.querySelector("#mt-picker-stat").addEventListener("change", (e) => {
    MT.pickStat = e.target.value || null; renderMtPicker(qi.value);
  });
  // コスト上限は入力確定（フォーカスアウト／Enter）で反映
  const mx = box.querySelector("#mt-picker-max");
  mx.addEventListener("change", () => {
    const v = parseFloat(mx.value);
    MT.pickMax = isNaN(v) ? null : v;
    renderMtPicker(qi.value);
  });
  // 名前・写真タップで詳細プルダウンを開閉、＋／「入れる」で移籍実行
  box.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
    const id = +b.dataset.open;
    MT.pickOpen = MT.pickOpen === id ? null : id;
    renderMtPicker(qi.value);
  }));
  box.querySelectorAll("[data-add],[data-do]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    doMtTransfer(+(b.dataset.add || b.dataset.do));
  }));
}

// 移籍候補のスタッツ絞り込みの選択肢（cost は elements のコスト、他は players.all）
const STAT_FILTER_OPTS = [
  ["points", "ポイント"], ["cost", "コスト"], ["goals", "ゴール"], ["assists", "アシスト"],
  ["clean_sheets", "無失点"], ["defcon90", "DEFCON/90"], ["saves", "セーブ"],
  ["pk_saved", "PKストップ"], ["xg90", "xG/90"], ["xa90", "xA/90"], ["bonus", "ボーナス"],
];
function pickStatValue(e, key) {
  if (key === "cost") return e.c;
  const s = seasonStatsFor(e);
  return s ? s[key] : null;
}
function pickStatDisplay(e, key) {
  const v = pickStatValue(e, key);
  if (v == null) return "−";
  if (key === "cost") return `£${v}m`;
  if (SEASON_STAT_FLOAT[key]) return Number(v).toFixed(2);
  return v;
}

// 候補プルダウンの中身：OUTとの差額（±£・-4pt警告）＋ポジション別スタッツ＋「入れる」
function pickDetailHtml(e) {
  const P = MT.plans[MT.planGw];
  const outPos = MT.outs.find((qp) => {
    const pk = P.squad.find((p) => p.position === qp);
    return pk && elOf(pk).p === e.p;
  });
  const outPick = outPos != null ? P.squad.find((p) => p.position === outPos) : null;
  const outEl = outPick ? elOf(outPick) : null;
  let info = "";
  if (outEl) {
    const diff = e.c - outEl.c;
    const after = P.bank + outEl.c - e.c;
    const simSet = new Set(P.squad.map((p) => p.element));
    simSet.delete(outPick.element); simSet.add(e.id);
    const madeAfter = P.inhElems.filter((x) => !simSet.has(x)).length;
    const hitAfter = Math.max(0, madeAfter - P.ft) * 4;
    const diffStr = diff === 0 ? "同額" : `£${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)}m`;
    const warns = [];
    if (after < 0) warns.push(`<b class="bad">資金不足</b>`);
    if (hitAfter > 0) warns.push(`<b class="bad">-${hitAfter}pt</b>`);
    info = `<div class="mt-pick-tr"><span>${esc(outEl.j || outEl.n)}と交換</span><span>${diffStr}・残<b class="${after < 0 ? "bad" : ""}">£${after.toFixed(1)}m</b>${warns.length ? "　" + warns.join(" ") : ""}</span></div>`;
  }
  const posKey = POS_STATS[e.p] ? e.p : "MF";
  const stats = seasonStatsFor(e);
  const statRows = POS_STATS[posKey].map((f) => {
    let v = stats ? stats[f] : null;
    if (v == null) v = "−"; else if (SEASON_STAT_FLOAT[f]) v = Number(v).toFixed(2);
    return `<div class="mt-pick-drow"><span>${SEASON_STAT_LABELS[f]}</span><span>${v}</span></div>`;
  }).join("");
  return `${info}${statRows}<button type="button" class="mt-pick-do" data-do="${e.id}">この選手を入れる</button>`;
}

function doMtTransfer(inId) {
  const P = MT.plans[MT.planGw];
  const inc = DATA.elements[String(inId)];
  if (!inc) return;
  // 候補と同じポジションのOUT対象（先に✕を押した選手）と入れ替える
  const pos = MT.outs.find((q) => {
    const pk = P.squad.find((p) => p.position === q);
    return pk && elOf(pk).p === inc.p;
  });
  if (pos == null) return;
  const pick = P.squad.find((p) => p.position === pos);
  const out = elOf(pick);
  // 同一チーム3人まで
  const teamCount = {};
  P.squad.forEach((p) => { if (p.position === pos) return; const e = elOf(p); teamCount[e.t] = (teamCount[e.t] || 0) + 1; });
  if ((teamCount[inc.t] || 0) >= 3) { MT.msg = "同じチームから選べるのは3人までです"; renderSquadPitch(); return; }
  pick.element = inId;
  P.bank = P.bank + out.c - inc.c;
  MT.outs = MT.outs.filter((q) => q !== pos);
  MT.pickOpen = null;
  invalidateAfter(MT.planGw);
  savePlans();
  renderSquadPitch();  // OUT対象が残っていれば候補リストは開いたまま
}

async function loadLeagueStandings(leagueId, leagueName, myEntryId) {
  const slot = document.getElementById("league-standings");
  slot.innerHTML = `<div class="empty">順位表を読み込み中…</div>`;
  try {
    const d = await fplFetch(`leagues-classic/${leagueId}/standings/?page_standings=1`);
    const rows = (d.standings && d.standings.results) || [];
    let html = `<h3 class="mt-h3">${esc(leagueName)} 順位表（上位${Math.min(rows.length, 20)}）</h3>
      <table class="squad"><thead><tr><th class="num">順位</th><th>チーム / マネージャー</th><th class="num">節pt</th><th class="num">合計</th></tr></thead><tbody>`;
    rows.slice(0, 20).forEach((r) => {
      const me = (r.entry === myEntryId) ? " class=\"me-row\"" : "";
      html += `<tr${me}>
        <td class="num">${r.rank}</td>
        <td><div class="name">${esc(r.entry_name)}</div><div class="sub">${esc(r.player_name)}</div></td>
        <td class="num">${r.event_total}</td>
        <td class="num main-num">${fmtRank(r.total)}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
    slot.innerHTML = html;
    slot.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    slot.innerHTML = emptyMessage("順位表の取得に失敗しました。<br>" + esc(err.message || err));
  }
}

/* ===========================================================
   ホームのYouTube欄：チャンネルの最新動画2本を自動取得
   YouTubeのRSSフィードを、myteamと同じ中継サービス(PROXIES)経由で取得します。
   （APIキー不要。取得に失敗しても固定の「ルール解説」だけは表示されます）
   =========================================================== */
const YT_CHANNEL_ID = "UCyn1RapHcZDrtnXDKLF93SQ";  // FPL侍チャンネル
const YT_RULE_ID = "D8Grf9fL_Wc";                  // 固定表示しているルール解説（最新枠から除外）

async function loadYouTube() {
  const grid = document.getElementById("yt-grid");
  if (!grid) return;
  const feedUrl = "https://www.youtube.com/feeds/videos.xml?channel_id=" + YT_CHANNEL_ID;
  let xmlText = null;
  try {
    xmlText = await proxyFetchText(feedUrl);  // プロキシ2本を競争させて速い方を採用
  } catch (e) {
    return;  // 取得失敗：固定動画のみ表示
  }

  let entries;
  try {
    const doc = new DOMParser().parseFromString(xmlText, "text/xml");
    entries = Array.from(doc.getElementsByTagName("entry"));
  } catch (e) { return; }

  const html = [];
  for (const en of entries) {
    // <id>yt:video:VIDEOID</id> から動画IDを取り出す（名前空間に依存しない）
    const idText = (en.getElementsByTagName("id")[0] || {}).textContent || "";
    const vid = idText.split(":").pop();
    const title = ((en.getElementsByTagName("title")[0] || {}).textContent || "").trim();
    if (!vid || vid === YT_RULE_ID) continue;
    html.push(ytCardHTML(vid, title));
    if (html.length >= 2) break;
  }
  if (html.length) grid.insertAdjacentHTML("beforeend", html.join(""));
}

function ytCardHTML(vid, title) {
  return `<a class="yt-card-h" href="https://youtu.be/${esc(vid)}" target="_blank" rel="noopener">
    <span class="yt-thumb-h">
      <img src="https://i.ytimg.com/vi/${esc(vid)}/mqdefault.jpg" alt="" loading="lazy">
      <span class="yt-play"></span>
    </span>
    <span class="yt-title-h">${esc(title)}</span>
  </a>`;
}

function showLoadError(err) {
  document.querySelector("main").innerHTML = `<div class="empty">
    <p>データの読み込みに失敗しました。</p>
    <p class="sub">${esc(err.message || err)}</p>
    <p class="sub" style="margin-top:12px;">
      パソコンでファイルを直接開いた場合は表示できません。<br>
      README.md の「自分のPCでサイトを確認する」の手順で開いてください。
    </p>
  </div>`;
}
