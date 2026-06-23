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
    const res = await fetch(DATA_URL, { cache: "no-store" });
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
const RICH_KEYS = ["all", "last3", "last5", "last10", "home", "away"];
function renderPlayers(key) {
  if (RICH_KEYS.includes(key)) {
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
  team:        { label: "チーム",    type: "team",  frozen: true, width: 46 },
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
// 設定の保存キー。標準設定を変えたらv3に更新（全員に新標準を適用するため）
const CONFIG_KEY = "fpl_player_cols_v4";

let playerSort = { key: "points", dir: "desc" };
let playerFilters = { name: "", pos: "", team: "", min: {}, max: {} };
let colState = loadColState();
let cmOpen = false;  // 列設定パネルが開いているか
let currentRichKey = "all";  // 高機能テーブルがいま表示している期間

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

  box.innerHTML = `
    <div id="col-manager"></div>
    <p class="note" style="margin:6px 0;">該当：<span id="player-count"></span>人</p>
    <div class="fullbleed">
      <div class="data-table-wrap">
        <table class="rich">
          <thead id="player-head"></thead>
          <tbody id="player-body"></tbody>
        </table>
      </div>
    </div>`;

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
    r1 += `<th class="col-${c.key} ${frz}${numc}${sortable ? "sortable" : ""}" ${sortable ? `data-sort="${c.key}"` : ""} style="${st}">${headText}<span class="arr"></span></th>`;
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
      arr.textContent = dir === "asc" ? " ↑" : " ↓";
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
      if (c.type === "rank") tds += `<td class="rank ${frz}" style="${st}">${i + 1}</td>`;
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
      <div class="cm-section"><div class="cm-title">データ列（チェックで表示 ／ ↑↓で並び替え）</div>${dataItems}</div>
      <button type="button" id="cm-reset" class="cm-reset">標準に戻す</button>
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
    const cb = e.target.closest("[data-cm-show]");
    if (!cb) return;
    colState.hidden[cb.dataset.cmShow] = !cb.checked;
    saveColState();
    buildPlayerHead();
    refreshPlayerBody();
  });
  wrap.addEventListener("click", (e) => {
    const up = e.target.closest("[data-cm-up]");
    const down = e.target.closest("[data-cm-down]");
    const reset = e.target.closest("#cm-reset");
    if (up) moveDataCol(up.dataset.cmUp, -1);
    else if (down) moveDataCol(down.dataset.cmDown, 1);
    else if (reset) { colState = defaultColState(); afterColLayoutChange(); }
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
function renderTeams(key) {
  const note = document.getElementById("teams-note");
  const box = document.getElementById("teams-content");
  const teams = DATA.teams || {};

  if (key === "totals") {
    note.textContent = "シーズン合計。失点＝実際に取られた得点、無失点率＝無失点で終えた割合。xG=攻撃の期待値、被xG=守備で許した期待値。";
    drawTeamTotals(box, teams.totals || []);
  } else if (key === "by_gw") {
    note.textContent = "チームを選ぶと、節ごとの各データが見られます。";
    drawTeamByGw(box, teams.by_gw || []);
  } else if (key === "form") {
    note.textContent = "直近5試合の1試合あたり平均（xGのみ直近10も表示）。";
    drawTeamForm(box, teams.recent || []);
  }
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

function drawTeamTotals(box, rows) {
  if (!rows.length) return (box.innerHTML = emptyMessage("まだデータがありません。"));
  let html = `<table class="rich teamtbl"><thead><tr>
      <th class="rank">順位</th><th class="col-name">チーム</th>
      <th>ポイント</th><th>ゴール</th><th>アシスト</th><th>失点</th>
      <th>DEFCON</th><th>イエロー</th><th>レッド</th>
      <th>xG合計</th><th>被xG合計</th><th>無失点率</th><th>無失点/試合</th>
    </tr></thead><tbody>`;
  rows.forEach((r) => {
    html += `<tr>
      <td class="rank">${r.rank}</td>
      <td class="col-name"><div class="name">${teamBadgeByName(r.team)}</div></td>
      <td class="main-num">${r.points}</td>
      <td>${r.goals}</td><td>${r.assists}</td><td>${r.conceded}</td>
      <td>${r.defcon}</td><td>${r.yellow}</td><td>${r.red}</td>
      <td>${r.xg_total}</td><td>${r.xgc_total}</td>
      <td>${r.cs_pct}%</td><td>${r.cs_count} / ${r.matches}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  box.innerHTML = wideTable(html);
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

function drawTeamForm(box, rows) {
  if (!rows.length) return (box.innerHTML = emptyMessage("まだデータがありません。"));
  let html = `<table class="rich teamtbl"><thead><tr>
      <th class="rank">順位</th><th class="col-name">チーム</th>
      <th>ポイント</th><th>ゴール</th><th>アシスト</th><th>失点</th>
      <th>DEFCON</th><th>イエロー</th><th>レッド</th>
      <th>xG<br>(5)</th><th>被xG<br>(5)</th><th>xG<br>(10)</th><th>被xG<br>(10)</th>
    </tr></thead><tbody>`;
  rows.forEach((r) => {
    html += `<tr>
      <td class="rank">${r.rank}</td>
      <td class="col-name"><div class="name">${teamBadgeByName(r.team)}</div></td>
      <td class="main-num">${r.r5_points}</td>
      <td>${r.r5_goals}</td><td>${r.r5_assists}</td><td>${r.r5_conceded}</td>
      <td>${r.r5_defcon}</td><td>${r.r5_yellow}</td><td>${r.r5_red}</td>
      <td>${r.r5_xg}</td><td>${r.r5_xgc}</td><td>${r.r10_xg}</td><td>${r.r10_xgc}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  box.innerHTML = wideTable(html);
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
// 中継サービス（上から順に試す）
const PROXIES = [
  (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
];

async function fplFetch(path) {
  const url = FPL_API + path;
  let lastErr = null;
  for (const wrap of PROXIES) {
    try {
      const res = await fetch(wrap(url), { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("FPLサーバーに接続できませんでした。IDが正しいか、少し時間をおいて再度お試しください。");
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

async function loadMyTeam(id) {
  const box = document.getElementById("myteam-result");
  box.innerHTML = `<div class="empty">読み込み中…（10秒ほどかかることがあります）</div>`;
  try {
    const entry = await fplFetch(`entry/${id}/`);
    const gw = entry.current_event;
    let picks = null;
    let livePoints = null;
    if (gw) {
      try { picks = await fplFetch(`entry/${id}/event/${gw}/picks/`); } catch (e) { picks = null; }
      // その節の選手別ポイント（出場・得点などの結果）
      try {
        const live = await fplFetch(`event/${gw}/live/`);
        livePoints = {};
        (live.elements || []).forEach((e) => { livePoints[e.id] = (e.stats && e.stats.total_points) || 0; });
      } catch (e) { livePoints = null; }
    }
    renderMyTeam(entry, picks, gw, livePoints);
  } catch (err) {
    box.innerHTML = emptyMessage("取得に失敗しました。<br>" + esc(err.message || err));
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

  // --- スカッド（ピッチ表示・編集可） ---
  const hasPicks = picksData && picksData.picks && picksData.picks.length;
  html += `<h3 class="mt-h3">スカッド</h3>`;
  if (hasPicks) {
    html += `<div id="mt-squad"></div>`;
  } else {
    html += emptyMessage("スカッド情報を取得できませんでした（シーズン開始前の可能性があります）。");
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

  // スカッド（ピッチ）を初期化
  if (hasPicks) initSquadEditor(entry, picksData, gw, livePoints);

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
  MT = {
    entry, gw,
    bank: eh.bank != null ? eh.bank / 10 : 0,
    teamValue: eh.value != null ? eh.value / 10 : 0,
    eventPoints: eh.points != null ? eh.points : (entry.summary_event_points != null ? entry.summary_event_points : null),
    chip: picksData.active_chip || null,
    livePoints: livePoints || null,   // {element_id: その節のポイント}
    squad: picksData.picks.map((p) => ({
      element: p.element,
      position: p.position,
      is_captain: !!p.is_captain,
      is_vice_captain: !!p.is_vice_captain,
    })),
    owned: new Set(picksData.picks.map((p) => p.element)),
    sel: null,        // 選択中の position(1-15)
    pickerFor: null,  // 移籍ピッカー対象の position
    msg: null,
  };
  renderSquadPitch();
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
  const pts = mtPoints(p);
  let foot;
  if (pts == null) {
    foot = `<span class="mt-pts">£${el.c}m</span>`;
  } else {
    const cls = pts <= 0 ? " neg" : (pts >= 6 ? " pos" : "");
    foot = `<span class="mt-pts${cls}">${pts}pt</span>`;
  }
  const nm = el.j || el.n;
  return `<button type="button" class="mt-card${sel}" data-pos="${p.position}">
    <span class="mt-photo-wrap">${img}${cv}</span>
    <span class="mt-name">${esc(nm)}</span>
    ${foot}
  </button>`;
}

function validFormation() {
  const c = { GK: 0, DF: 0, MF: 0, FW: 0 };
  MT.squad.filter((p) => p.position <= 11).forEach((p) => { const e = elOf(p); c[e.p] = (c[e.p] || 0) + 1; });
  return c.GK === 1 && c.DF >= 3 && c.MF >= 2 && c.FW >= 1 && (c.DF + c.MF + c.FW === 10);
}

function renderSquadPitch() {
  const wrap = document.getElementById("mt-squad");
  if (!wrap || !MT) return;
  const starters = MT.squad.filter((p) => p.position <= 11);
  const bench = MT.squad.filter((p) => p.position > 11).sort((a, b) => a.position - b.position);
  const byPos = (pos) => starters.filter((p) => elOf(p).p === pos).sort((a, b) => a.position - b.position);
  const rows = ["GK", "DF", "MF", "FW"]
    .map((pos) => `<div class="mt-row">${byPos(pos).map(mtCard).join("")}</div>`).join("");

  const sel = MT.sel != null ? MT.squad.find((p) => p.position === MT.sel) : null;
  let bar;
  if (sel) {
    const el = elOf(sel);
    bar = `<div class="mt-actions">
      <span class="mt-sel-name">${esc(el.j || el.n)}</span>
      <button type="button" data-act="cap">主将C</button>
      <button type="button" data-act="vice">副V</button>
      <button type="button" data-act="transfer">移籍</button>
      <button type="button" data-act="clear">解除</button>
    </div>`;
  } else {
    bar = `<div class="mt-msg">${MT.msg ? esc(MT.msg) : "選手をタップ → もう一人タップで入れ替え／選択中に主将・移籍を変更"}</div>`;
  }
  if (MT.msg) { setTimeout(() => { MT.msg = null; }, 2600); }

  const ptsBadge = MT.eventPoints != null ? `<div class="mt-badge pts">${MT.eventPoints}pt</div>` : "";
  wrap.innerHTML = `
    <div class="mt-bar">第${MT.gw}節のスカッドを土台に次節プランを編集できます・残り資金 £${MT.bank.toFixed(1)}m・チーム £${MT.teamValue.toFixed(1)}m${MT.chip ? "・チップ: " + esc(MT.chip) : ""}</div>
    ${bar}
    <div class="mt-pitch-wrap">
      <div class="mt-badge gw">GW${MT.gw}</div>
      ${ptsBadge}
      <div class="mt-pitch">${rows}</div>
      <div class="mt-bench">${bench.map(mtCard).join("")}</div>
    </div>
    <div id="mt-picker" class="mt-picker" hidden></div>`;

  wrap.querySelectorAll(".mt-card").forEach((c) => c.addEventListener("click", onMtCardClick));
  wrap.querySelectorAll(".mt-actions button").forEach((b) => b.addEventListener("click", () => onMtAction(b.dataset.act)));
}

function onMtCardClick(e) {
  const pos = +e.currentTarget.dataset.pos;
  if (MT.sel == null) { MT.sel = pos; renderSquadPitch(); return; }
  if (MT.sel === pos) { MT.sel = null; renderSquadPitch(); return; }
  tryMtSwap(MT.sel, pos);
}

function tryMtSwap(a, b) {
  const A = MT.squad.find((p) => p.position === a);
  const B = MT.squad.find((p) => p.position === b);
  const ea = elOf(A), eb = elOf(B);
  const roleChange = (a <= 11) !== (b <= 11);
  if (roleChange && (ea.p === "GK") !== (eb.p === "GK")) {
    MT.msg = "GKはGK同士でのみ入れ替えできます"; MT.sel = null; renderSquadPitch(); return;
  }
  [A.position, B.position] = [B.position, A.position];
  if (!validFormation()) {
    [A.position, B.position] = [B.position, A.position];
    MT.msg = "そのフォーメーションは選べません（GK1・DF3+・MF2+・FW1+）";
    MT.sel = null; renderSquadPitch(); return;
  }
  MT.sel = null; renderSquadPitch();
}

function onMtAction(act) {
  if (act === "clear") { MT.sel = null; renderSquadPitch(); return; }
  if (MT.sel == null) return;
  const pick = MT.squad.find((p) => p.position === MT.sel);
  if (act === "cap") {
    MT.squad.forEach((p) => { p.is_captain = false; });
    pick.is_captain = true; pick.is_vice_captain = false;
    MT.sel = null; renderSquadPitch(); return;
  }
  if (act === "vice") {
    MT.squad.forEach((p) => { p.is_vice_captain = false; });
    pick.is_vice_captain = true; pick.is_captain = false;
    MT.sel = null; renderSquadPitch(); return;
  }
  if (act === "transfer") { MT.pickerFor = MT.sel; renderMtPicker(""); }
}

function renderMtPicker(query) {
  const box = document.getElementById("mt-picker");
  if (!box) return;
  const pick = MT.squad.find((p) => p.position === MT.pickerFor);
  const out = elOf(pick);
  const q = (query || "").trim();
  const ql = q.toLowerCase();
  const list = Object.entries(DATA.elements)
    .map(([id, e]) => ({ id: +id, ...e }))
    .filter((e) => e.p === out.p && !MT.owned.has(e.id))
    .filter((e) => !q || e.n.toLowerCase().includes(ql) || (e.j && e.j.includes(q)))
    .sort((a, b) => b.c - a.c)
    .slice(0, 100);
  const rowHtml = list.map((e) => {
    const after = MT.bank + out.c - e.c;
    const kit = kitUrl(e);
    return `<button type="button" class="mt-pick-row${after < 0 ? " over" : ""}" data-id="${e.id}">
      <span class="mt-pick-kit">${kit ? `<img src="${kit}" loading="lazy" onerror="this.style.visibility='hidden'">` : ""}</span>
      <span class="mt-pick-name">${esc(e.n)}<span class="sub">${esc(e.t)}</span></span>
      <span class="mt-pick-cost">£${e.c}m</span>
      <span class="mt-pick-after">残£${after.toFixed(1)}m</span>
    </button>`;
  }).join("") || `<div class="empty" style="box-shadow:none;">候補が見つかりません</div>`;

  box.hidden = false;
  box.innerHTML = `
    <div class="mt-picker-head">
      <strong>${esc(out.n)} を移籍 → ${esc(out.p)}の候補</strong>
      <button type="button" id="mt-picker-close">✕</button>
    </div>
    <input type="search" id="mt-picker-q" placeholder="選手名で検索（英字／カタカナ）" value="${esc(q)}">
    <div class="mt-picker-list">${rowHtml}</div>`;
  box.querySelector("#mt-picker-close").addEventListener("click", () => {
    box.hidden = true; MT.sel = null; MT.pickerFor = null; renderSquadPitch();
  });
  const qi = box.querySelector("#mt-picker-q");
  qi.addEventListener("input", () => renderMtPicker(qi.value));
  box.querySelectorAll(".mt-pick-row").forEach((r) => r.addEventListener("click", () => doMtTransfer(+r.dataset.id)));
  box.scrollIntoView({ behavior: "smooth", block: "center" });
}

function doMtTransfer(inId) {
  const pos = MT.pickerFor;
  const pick = MT.squad.find((p) => p.position === pos);
  const out = elOf(pick);
  const inc = DATA.elements[String(inId)];
  if (!inc) return;
  // 同一チーム3人まで
  const teamCount = {};
  MT.squad.forEach((p) => { if (p.position === pos) return; const e = elOf(p); teamCount[e.t] = (teamCount[e.t] || 0) + 1; });
  if ((teamCount[inc.t] || 0) >= 3) { MT.msg = "同じチームから選べるのは3人までです"; renderMtPicker(document.getElementById("mt-picker-q")?.value || ""); return; }
  MT.owned.delete(pick.element);
  pick.element = inId;
  MT.owned.add(inId);
  MT.bank = MT.bank + out.c - inc.c;
  MT.sel = null; MT.pickerFor = null;
  renderSquadPitch();
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
  for (const wrap of PROXIES) {
    try {
      const res = await fetch(wrap(feedUrl), { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      xmlText = await res.text();
      break;
    } catch (e) { /* 次のプロキシを試す */ }
  }
  if (!xmlText) return;  // 取得失敗：固定動画のみ表示

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
