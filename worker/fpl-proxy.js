/* ===========================================================
   FPL侍 自前の中継（Cloudflare Worker）

   なぜ必要か：
     ブラウザから fantasy.premierleague.com を直接呼ぶと CORS で弾かれる。
     GitHub Pages は静的配信なのでサーバー側の処理を置けない。
     これまで無料の公開プロキシ（allorigins / corsproxy）に頼っていたが、
     corsproxy は有料化して 401、allorigins は 520 で落ち、スカッドが表示
     できなくなった。公開プロキシは他に4本試したが全滅（429・400・タイム
     アウト）。他人のサービスに依存する限り「いつでも表示できる」は作れない。

   FPL公式APIはUAなし・素のcurlでも200を返す公開APIなので、自前の中継を
   1枚挟むだけで解決する。Cloudflare Workers の無料枠は1日10万リクエスト。

   置くときの注意：
     ・誰でも使える素通しの中継にしない（踏み台にされて枠を食い潰される）。
       パスは FPL API だけ、呼び出し元は自分のサイトだけに絞ってある。
     ・レスポンスはエッジでキャッシュする。FPL側もCDN配信なので二重に効く。
   =========================================================== */

const FPL = "https://fantasy.premierleague.com/api/";

// 呼び出しを許可するサイト。ローカル確認用に localhost も入れてある
const ALLOWED_ORIGINS = [
  "https://fplsamurai.github.io",
  "http://localhost:8000",
  "http://localhost:8124",
];

// 中継してよいパスだけを列挙する（素通しの公開プロキシにしないため）
const ALLOWED_PATHS = [
  /^bootstrap-static\/$/,
  /^fixtures\/$/,
  /^entry\/\d+\/$/,
  /^entry\/\d+\/event\/\d+\/picks\/$/,
  /^entry\/\d+\/history\/$/,
  /^entry\/\d+\/transfers\/$/,
  /^event\/\d+\/live\/$/,
  /^leagues-classic\/\d+\/standings\/$/,
  /^element-summary\/\d+\/$/,
];

/* ホームの「最新動画」で使うYouTubeのRSS。チャンネルIDは固定で持つ
   （パラメータで受けると任意のフィードを中継できてしまうため）。 */
const YT_CHANNEL_ID = "UCyn1RapHcZDrtnXDKLF93SQ";
const YT_FEED = "https://www.youtube.com/feeds/videos.xml?channel_id=" + YT_CHANNEL_ID;

// 秒。試合中に古い値を出し続けないよう短め。FPL側の負荷も下げられる
const TTL = { "event/": 60, "entry/": 60, "leagues-classic/": 120, default: 300 };
const YT_TTL = 1800;   // 動画の更新は頻繁でないので長めでよい

function ttlFor(path) {
  for (const k of Object.keys(TTL)) if (k !== "default" && path.startsWith(k)) return TTL[k];
  return TTL.default;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin);

    // ブラウザの事前確認(preflight)
    if (request.method === "OPTIONS") {
      return new Response(null, { status: allowed ? 204 : 403, headers: allowed ? corsHeaders(origin) : {} });
    }
    if (request.method !== "GET") {
      return new Response("GET only", { status: 405 });
    }
    // Origin が無いのは curl 等からの直叩き。ブラウザ以外には返さない
    if (!allowed) {
      return new Response(JSON.stringify({ error: "origin not allowed" }), {
        status: 403, headers: { "Content-Type": "application/json" },
      });
    }

    /* 受け口は2つだけ。
         /?path=entry/1648860/  … FPL API
         /?yt=1                 … YouTubeのRSS（チャンネルは上で固定） */
    const q = new URL(request.url).searchParams;
    const isYt = q.get("yt") === "1";
    const path = isYt ? "yt" : (q.get("path") || "");
    if (!isYt && !ALLOWED_PATHS.some((re) => re.test(path))) {
      return new Response(JSON.stringify({ error: "path not allowed", path }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    /* エッジのキャッシュを先に見る。
       キャッシュに入れるのは CORS ヘッダを付けない素の応答にして、返す直前に
       呼び出し元の Origin を見て付け直す。CORSごと保存すると、先に来た人の
       Origin が焼き付いて別のサイトに誤った許可を返してしまうため。 */
    const cacheKey = new Request("https://fpl-proxy.internal/" + path, { method: "GET" });
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) {
      const r = new Response(hit.body, hit);
      Object.entries(corsHeaders(origin)).forEach(([k, v]) => r.headers.set(k, v));
      r.headers.set("X-Proxy-Cache", "HIT");
      return r;
    }

    // FPLへ取りに行く。FPL側が詰まっても中継が道連れにならないよう打ち切る
    let upstream;
    try {
      upstream = await fetch(isYt ? YT_FEED : FPL + path, {
        headers: {
          "Accept": isYt ? "application/atom+xml" : "application/json",
          "User-Agent": "fpl-samurai-proxy",
        },
        signal: AbortSignal.timeout(10000),
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "upstream unreachable" }), {
        status: 502, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: "upstream " + upstream.status }), {
        status: upstream.status, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    const body = await upstream.arrayBuffer();
    const ttl = isYt ? YT_TTL : ttlFor(path);
    // 保存用（CORSヘッダ無し）
    const forCache = new Response(body, {
      headers: {
        "Content-Type": isYt ? "application/xml; charset=utf-8" : "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${ttl}`,
      },
    });
    // 書き込みの完了は待たずに応答を返す
    ctx.waitUntil(cache.put(cacheKey, forCache.clone()));

    const res = new Response(body, forCache);
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.headers.set(k, v));
    res.headers.set("X-Proxy-Cache", "MISS");
    return res;
  },
};
