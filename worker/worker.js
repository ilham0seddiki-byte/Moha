// Escucha Palabras — buscador en vivo (Cloudflare Worker)
//
// GET /?q=gracias  →  { q, clips: [{ id, title, channel, t, before, line, after }] }
//
// Busca vídeos en español en YouTube, descarga sus subtítulos con Firecrawl
// y devuelve los momentos exactos en los que se dice la palabra.
//
// Configuración (Cloudflare → Worker → Settings → Variables and Secrets):
//   FIRECRAWL_API_KEY  (Secret, obligatorio)  tu clave de firecrawl.dev
//   ALLOWED_ORIGIN     (Text, opcional)       p. ej. https://usuario.github.io
//                                             para que solo tu web pueda usarlo
//
// Coste por palabra nueva: 1 búsqueda + MAX_VIDEOS subtítulos (5 créditos cada uno).
// Las palabras ya buscadas salen de la caché durante 7 días (gratis).

const FIRECRAWL = 'https://api.firecrawl.dev/v2/scrape';
const MAX_VIDEOS = 6;
const MAX_CLIPS = 24;
const CACHE_SECONDS = 7 * 24 * 3600;

const normChar = c => { const b = c.normalize('NFD')[0].toLowerCase(); return /[a-z0-9]/.test(b) ? b : ' '; };
const norm = s => Array.from(s, normChar).join('');
const clean = s => s.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

async function firecrawl(env, call) {
  const res = await fetch(FIRECRAWL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ alexandria: [call] }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || `Firecrawl HTTP ${res.status}`);
  const item = json.data.alexandria[0];
  if (item.error) throw new Error(item.error.message || item.error.code || 'Firecrawl error');
  return item.data;
}

const searchVideos = (env, q) => firecrawl(env, {
  provider: 'youtube-com', capability: 'videos/search_videos',
  options: { query: q, hl: 'es', gl: 'ES' },
});

const transcript = (env, id) => firecrawl(env, {
  provider: 'youtube-com', capability: 'videos/video_transcript',
  options: { video_id: id, language: 'es' },
}).catch(() => null); // vídeo sin subtítulos en español: se ignora

function clipsFrom(video, tr, key) {
  if (!tr || !tr.has_transcript || !Array.isArray(tr.segments)) return [];
  const segs = tr.segments.map(s => ({ t: s.start_ms / 1000, text: clean(s.text || '') })).filter(s => s.text);
  const n = segs.map(s => norm(s.text));
  const re = new RegExp(`(^|\\s)${key.replace(/ /g, '\\s+')}(?=\\s|$)`);
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    const two = key.includes(' ') && i + 1 < segs.length && !re.test(n[i]) && !re.test(n[i + 1]) && re.test(n[i] + ' ' + n[i + 1]);
    if (!re.test(n[i]) && !two) continue;
    const span = two ? 2 : 1;
    out.push({
      id: video.video_id, title: video.title || tr.title || '', channel: video.channel_name || '',
      t: Math.round(segs[i].t * 10) / 10,
      before: segs[i - 1]?.text || '',
      line: two ? `${segs[i].text} ${segs[i + 1].text}` : segs[i].text,
      after: segs[i + span]?.text || '',
    });
    i += span - 1;
  }
  return out;
}

async function lookup(env, q) {
  const key = norm(q).trim().replace(/\s+/g, ' ');
  const found = await searchVideos(env, q);
  const videos = (found.videos || []).filter(v => v.video_id && !v.is_live).slice(0, MAX_VIDEOS);
  const trs = await Promise.all(videos.map(v => transcript(env, v.video_id)));
  const perVideo = videos.map((v, k) => clipsFrom(v, trs[k], key));
  // Alterna entre vídeos para oír voces distintas
  const clips = [];
  for (let r = 0; clips.length < MAX_CLIPS && perVideo.some(c => c.length > r); r++)
    perVideo.forEach(c => c[r] && clips.length < MAX_CLIPS && clips.push(c[r]));
  return { q, clips, videosChecked: videos.length };
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allow = env.ALLOWED_ORIGIN ? (origin === env.ALLOWED_ORIGIN ? origin : 'null') : '*';
    const cors = { 'Access-Control-Allow-Origin': allow, 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' };
    const reply = (body, status = 200, extra = {}) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra } });

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) return reply({ error: 'origin not allowed' }, 403);
    if (!env.FIRECRAWL_API_KEY) return reply({ error: 'Falta FIRECRAWL_API_KEY en el Worker' }, 500);

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim().slice(0, 60);
    if (!norm(q).trim()) return reply({ error: 'Escribe una palabra: ?q=gracias' }, 400);

    // Caché por palabra (sin acentos ni mayúsculas)
    const cacheKey = new Request(`${url.origin}/cache?q=${encodeURIComponent(norm(q).trim().replace(/\s+/g, ' '))}`);
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) {
      const r = new Response(hit.body, hit);
      Object.entries(cors).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }

    try {
      const data = await lookup(env, q);
      const res = reply(data, 200, { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });
      if (data.clips.length) ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    } catch (e) {
      return reply({ error: String(e.message || e) }, 502);
    }
  },
};
