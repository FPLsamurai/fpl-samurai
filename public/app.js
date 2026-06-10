/* ===========================================================
   FPL侍 データサイト 画面の動き（v2）
   data.json を読み込み、選手・チーム・次節の各表を描きます
   （素のJavaScriptだけ。ライブラリは使っていません）
   =========================================================== */

const DATA_URL = "data.json";
let DATA = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  setupParentTabs();
  setupSubtabs();
  setupMyTeam();
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
function setupParentTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("is-active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("is-active"));
      tab.classList.add("is-active");
      document.getElementById(tab.dataset.target).classList.add("is-active");
      window.scrollTo({ top: 0 });
    });
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
function renderPlayers(key) {
  if (key === "all") {
    renderPlayerRich();
  } else {
    renderPlayerSimple(key);
  }
}

/* ---- 直近・ホーム/アウェイ（シンプルな表） ---- */
function renderPlayerSimple(key) {
  const note = document.getElementById("players-note");
  const box = document.getElementById("players-content");
  const rows = (DATA.players && DATA.players[key]) || [];

  const labels = {
    last3: "直近3試合の合計（得点期待度=xGI順）",
    last5: "直近5試合の合計（得点期待度=xGI順）",
    last10: "直近10試合の合計（得点期待度=xGI順）",
    home: "ホーム試合のみの合計（得点期待度=xGI順）",
    away: "アウェイ試合のみの合計（得点期待度=xGI順）",
  };
  note.textContent = labels[key] || "";

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

/* ===========================================================
   全試合：高機能テーブル（並べ替え＋列ごとの数値フィルタ＋写真）
   =========================================================== */

// 各列の定義（label=見出し, type=種類, width=固定列の幅px）
const COL_META = {
  rank:        { label: "順位",      type: "rank",  frozen: true, width: 42, lock: true, noSort: true },
  photo:       { label: "写真",      type: "photo", frozen: true, width: 46, noSort: true },
  name:        { label: "選手",      type: "name",  frozen: true, width: 130, lock: true },
  position:    { label: "ポジション", type: "pos",   frozen: true, width: 72 },
  cost:        { label: "コスト",    type: "num",   frozen: true, width: 56 },
  points:      { label: "ポイント",  type: "num",   frozen: true, width: 62 },
  value:       { label: "コスパ",    type: "num" },
  ownership:   { label: "所持率",    type: "num" },
  goals:       { label: "ゴール",    type: "num" },
  assists:     { label: "アシスト",  type: "num" },
  clean_sheets:{ label: "無失点",    type: "num" },
  starts:      { label: "スタメン",  type: "num" },
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
};
const FROZEN_ORDER = ["rank", "photo", "name", "position", "cost", "points"];  // ポイントまで左に固定
const DATA_ORDER_DEFAULT = [
  "value", "ownership", "goals", "assists", "clean_sheets", "starts",
  "xg", "xg90", "g_minus_xg", "xa", "xa90", "defcon", "defcon90",
  "bonus", "ppg", "saves", "saves90", "pk_saved", "yellow", "red",
];
const POS_ORDER = { GK: 0, DF: 1, MF: 2, FW: 3 };
const PHOTO_BASE = "https://resources.premierleague.com/premierleague/photos/players/250x250/p";
// 設定の保存キー。標準設定を変えたらv3に更新（全員に新標準を適用するため）
const CONFIG_KEY = "fpl_player_cols_v3";

let playerSort = { key: "points", dir: "desc" };
let playerFilters = { name: "", pos: "", min: {}, max: {} };
let colState = loadColState();
let cmOpen = false;  // 列設定パネルが開いているか

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
function frozenCss(c) {
  return c.frozen
    ? `position:sticky;left:${c.left}px;min-width:${c.width}px;max-width:${c.width}px;`
    : "";
}

/* ---- 全試合テーブル：土台を作る ---- */
function renderPlayerRich() {
  document.getElementById("players-note").textContent =
    "見出しをタップで並べ替え（↑昇順/↓降順）。各列の枠で「以上／以下」絞り込み。⚙で列の表示・並び替え（動画用）。";
  const box = document.getElementById("players-content");
  const rows = (DATA.players && DATA.players.all) || [];
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
    // 1行目：見出し
    const sortable = !c.noSort;
    r1 += `<th class="${frz}${numc}${sortable ? "sortable" : ""}" ${sortable ? `data-sort="${c.key}"` : ""} style="${st}">${esc(c.label)}<span class="arr"></span></th>`;
    // 2行目：フィルタ
    let f = "";
    if (c.type === "name") {
      f = `<input type="text" id="f-name" placeholder="検索" value="${esc(playerFilters.name)}">`;
    } else if (c.type === "pos") {
      const opt = (v, t) => `<option value="${v}" ${playerFilters.pos === v ? "selected" : ""}>${t}</option>`;
      f = `<select id="f-pos">${opt("", "全部")}${opt("GK", "GK")}${opt("DF", "DF")}${opt("MF", "MF")}${opt("FW", "FW")}</select>`;
    } else if (c.type === "num") {
      const mn = playerFilters.min[c.key] ?? "";
      const mx = playerFilters.max[c.key] ?? "";
      f = `<input type="number" class="fnum" data-min="${c.key}" placeholder="≥" step="any" value="${mn}">
           <input type="number" class="fnum" data-max="${c.key}" placeholder="≤" step="any" value="${mx}">`;
    }
    r2 += `<td class="filter-cell ${frz}${numc}" style="${st}">${f}</td>`;
  });
  document.getElementById("player-head").innerHTML =
    `<tr>${r1}</tr><tr class="filter-row">${r2}</tr>`;
}

/* ---- 本体（中身）を絞り込み・並べ替えして描く ---- */
function refreshPlayerBody() {
  const rows = (DATA.players && DATA.players.all) || [];
  const { all, data, frozen } = getActiveColumns();
  const numKeys = all.filter((c) => c.type === "num").map((c) => c.key);
  const posVisible = frozen.some((c) => c.key === "position");

  let filtered = rows.filter((r) => {
    if (playerFilters.name && !r.name.toLowerCase().includes(playerFilters.name)) return false;
    if (posVisible && playerFilters.pos && r.position !== playerFilters.pos) return false;
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

  // 矢印
  document.querySelectorAll("#player-head th.sortable").forEach((th) => {
    th.querySelector(".arr").textContent =
      th.dataset.sort === key ? (dir === "asc" ? " ↑" : " ↓") : "";
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
        tds += `<td class="col-name ${frz}" style="${st}"><div class="name">${esc(r.name)}</div>${ja}<div class="sub">${esc(r.team)}</div></td>`;
      } else if (c.type === "pos") {
        tds += `<td class="${frz}" style="${st}">${esc(r.position)}</td>`;
      } else {
        const main = c.key === "value" ? "main-num" : "";
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
      <summary>⚙ 列の表示・並び替え（動画用）</summary>
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
    note.textContent = "シーズン合計。xG=攻撃の期待値、被xG=守備で許した期待値（少ないほど良い守備）。";
    drawTeamTotals(box, teams.totals || []);
  } else if (key === "by_gw") {
    note.textContent = "チームを選ぶと、節ごとのxG（攻撃）と被xG（守備）が見られます。";
    drawTeamByGw(box, teams.by_gw || []);
  } else if (key === "cleansheet") {
    note.textContent = "「無失点だった試合 ÷ 消化した試合」の割合。守備が安定しているチーム順。";
    drawCleanSheets(box, DATA.clean_sheets || []);
  } else if (key === "form") {
    note.textContent = "直近の調子。1試合あたりの平均xG（攻撃）と平均被xG（守備）。";
    drawTeamForm(box, teams.recent || []);
  }
}

function drawTeamTotals(box, rows) {
  if (!rows.length) return (box.innerHTML = emptyMessage("まだデータがありません。"));
  let html = `<table><thead><tr>
      <th class="rank">順位</th><th>チーム</th>
      <th class="num">xG合計</th><th class="num">被xG合計</th>
    </tr></thead><tbody>`;
  rows.forEach((r) => {
    html += `<tr>
      <td class="rank ${rankClass(r.rank)}">${r.rank}</td>
      <td class="name">${esc(r.team)}</td>
      <td class="num main-num">${r.xg_total}</td>
      <td class="num">${r.xgc_total}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  box.innerHTML = html;
}

function drawTeamByGw(box, byGw) {
  if (!byGw.length) return (box.innerHTML = emptyMessage("まだデータがありません。"));
  // チーム選択 → そのチームの節別表
  let options = byGw.map((t, i) => `<option value="${i}">${esc(t.team)}</option>`).join("");
  box.innerHTML = `
    <select id="team-picker" class="picker">${options}</select>
    <div id="team-gw-table"></div>`;

  const picker = document.getElementById("team-picker");
  const render = () => {
    const t = byGw[Number(picker.value)];
    let html = `<table><thead><tr>
        <th class="num">節</th><th class="num">xG（攻撃）</th><th class="num">被xG（守備）</th>
      </tr></thead><tbody>`;
    t.matches.forEach((m) => {
      html += `<tr>
        <td class="num">第${m.round}節</td>
        <td class="num main-num">${m.xg}</td>
        <td class="num">${m.xgc}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
    document.getElementById("team-gw-table").innerHTML = html;
  };
  picker.addEventListener("change", render);
  render();
}

function drawCleanSheets(box, rows) {
  if (!rows.length) return (box.innerHTML = emptyMessage("まだデータがありません。"));
  let html = `<table><thead><tr>
      <th class="rank">順位</th><th>チーム</th>
      <th class="num">無失点率</th><th class="num">無失点 / 試合</th>
    </tr></thead><tbody>`;
  rows.forEach((r) => {
    html += `<tr>
      <td class="rank ${rankClass(r.rank)}">${r.rank}</td>
      <td class="name">${esc(r.team)}</td>
      <td class="num main-num">${r.rate_pct}%</td>
      <td class="num">${r.clean_sheets} / ${r.played}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  box.innerHTML = html;
}

function drawTeamForm(box, rows) {
  if (!rows.length) return (box.innerHTML = emptyMessage("まだデータがありません。"));
  let html = `<table><thead><tr>
      <th class="rank">順位</th><th>チーム</th>
      <th class="num">直近5<br>xG</th><th class="num">直近5<br>被xG</th>
      <th class="num">直近10<br>xG</th><th class="num">直近10<br>被xG</th>
    </tr></thead><tbody>`;
  rows.forEach((r) => {
    html += `<tr>
      <td class="rank ${rankClass(r.rank)}">${r.rank}</td>
      <td class="name">${esc(r.team)}</td>
      <td class="num main-num">${r.r5_xg}</td>
      <td class="num">${r.r5_xgc}</td>
      <td class="num main-num">${r.r10_xg}</td>
      <td class="num">${r.r10_xgc}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  box.innerHTML = html;
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
  let html = `<p class="note" style="font-weight:600;color:#37003c;">${esc(pred.event_name || "次節")}</p>`;
  html += `<table><thead><tr>
      <th>チーム</th><th>対戦相手</th>
      <th class="num">無失点率</th><th class="num">ゴール期待値</th>
    </tr></thead><tbody>`;
  rows.forEach((r) => {
    html += `<tr>
      <td><div class="name">${esc(r.team)}</div><div class="sub">${esc(r.home_away)}</div></td>
      <td class="sub">${esc(r.opponent)}</td>
      <td class="num main-num">${r.clean_sheet_pct}%</td>
      <td class="num">${r.goal_expect}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
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
    if (gw) {
      try { picks = await fplFetch(`entry/${id}/event/${gw}/picks/`); } catch (e) { picks = null; }
    }
    renderMyTeam(entry, picks, gw);
  } catch (err) {
    box.innerHTML = emptyMessage("取得に失敗しました。<br>" + esc(err.message || err));
  }
}

function fmtRank(n) {
  return (n == null) ? "-" : Number(n).toLocaleString("ja-JP");
}

function renderMyTeam(entry, picksData, gw) {
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

  // --- スカッド ---
  if (picksData && picksData.picks && picksData.picks.length) {
    const eh = picksData.entry_history || {};
    const value = eh.value != null ? (eh.value / 10).toFixed(1) : "-";
    const bank = eh.bank != null ? (eh.bank / 10).toFixed(1) : "-";
    html += `<h3 class="mt-h3">スカッド（第${gw}節）</h3>
      <p class="note">チーム価値 £${value}m（うち銀行 £${bank}m）・この節の移籍 ${eh.event_transfers ?? 0}回${picksData.active_chip ? "・チップ使用: " + esc(picksData.active_chip) : ""}</p>`;

    const starters = picksData.picks.filter((p) => p.position <= 11);
    const bench = picksData.picks.filter((p) => p.position > 11);
    const order = { GK: 0, DF: 1, MF: 2, FW: 3 };
    const playerRow = (p) => {
      const el = elements[String(p.element)] || { n: "ID " + p.element, j: "", t: "?", p: "?", c: "" };
      const cap = p.is_captain ? `<span class="cap">C</span>` : (p.is_vice_captain ? `<span class="cap vice">V</span>` : "");
      return `<tr>
        <td>${esc(el.p)}</td>
        <td><div class="name">${esc(el.n)} ${cap}</div>${el.j ? `<div class="name-ja">${esc(el.j)}</div>` : ""}<div class="sub">${esc(el.t)}</div></td>
        <td class="num">£${el.c}m</td>
      </tr>`;
    };
    const sortByPos = (arr) => [...arr].sort((a, b) => {
      const ea = elements[String(a.element)] || {}, eb = elements[String(b.element)] || {};
      return (order[ea.p] ?? 9) - (order[eb.p] ?? 9) || a.position - b.position;
    });
    html += `<table class="squad"><thead><tr><th>位置</th><th>選手</th><th class="num">コスト</th></tr></thead><tbody>`;
    sortByPos(starters).forEach((p) => { html += playerRow(p); });
    html += `<tr><td colspan="3" class="bench-sep">ベンチ</td></tr>`;
    bench.forEach((p) => { html += playerRow(p); });
    html += `</tbody></table>`;
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

  // 順位表ボタン
  box.querySelectorAll(".lg-btn").forEach((b) => {
    b.addEventListener("click", () => loadLeagueStandings(b.dataset.league, b.dataset.name, entry.id));
  });
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
