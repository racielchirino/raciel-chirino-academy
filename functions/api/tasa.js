// Cloudflare Pages Function: /api/tasa
// Entrega la tasa oficial del BCV VIGENTE HOY (hora de Venezuela).
// - Consulta bcv.org.ve y guarda cada tasa por su "fecha valor" en Supabase (tabla tasas).
// - Responde con la última tasa cuya fecha valor sea hoy o anterior. Vence a las 11:59 p. m.
// - La tasa de mañana (que el BCV publica en la tarde) se guarda, pero no se usa hasta su día.
// Necesita la variable secreta SUPABASE_SECRET en Cloudflare Pages (Settings → Variables and Secrets).
const SB_URL = 'https://hpcjulqyqpgavofiqkzb.supabase.co';
const SB_PUBLIC = 'sb_publishable_i3i0pM7FTEW0kBovdtJHgw_FglMJiCZ';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const num = s => Number(String(s).trim().replace(/\./g, '').replace(',', '.'));

// Fecha y hora en Venezuela (UTC-4, sin horario de verano)
const VE_OFFSET = -4 * 3600 * 1000;
const hoyVE = () => new Date(Date.now() + VE_OFFSET).toISOString().slice(0, 10);
const segHastaMedianoche = () => { const ve = new Date(Date.now() + VE_OFFSET); const fin = Date.UTC(ve.getUTCFullYear(), ve.getUTCMonth(), ve.getUTCDate() + 1); return Math.max(1, Math.floor((fin - ve.getTime()) / 1000)); };

async function fromBCV() {
  const r = await fetch('https://www.bcv.org.ve/', { headers: { 'User-Agent': UA, 'Accept-Language': 'es' } });
  if (!r.ok) throw new Error('BCV ' + r.status);
  const html = await r.text();
  let m = html.match(/id="dolar"[\s\S]{0,1500}?<strong>\s*([\d.,]+)\s*<\/strong>/i);
  if (!m) m = html.match(/USD\s*<\/span>[\s\S]{0,400}?<strong>\s*([\d.,]+)\s*<\/strong>/i);
  if (!m) throw new Error('No se encontró la tasa');
  const f = html.match(/Fecha Valor[\s\S]{0,400}?content="(\d{4}-\d{2}-\d{2})/i);
  const usd = num(m[1]);
  if (!(usd > 0) || !f) throw new Error('Tasa o fecha inválida');
  return { usd, fecha: f[1], fuente: 'bcv.org.ve' };
}
async function fromRespaldo() {
  const r = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('Respaldo ' + r.status);
  const d = await r.json();
  const usd = Number(d.promedio ?? d.price), fecha = String(d.fechaActualizacion || '').slice(0, 10);
  if (!(usd > 0) || !fecha) throw new Error('Tasa inválida');
  return { usd, fecha, fuente: 'oficial BCV' };
}

async function guardar(env, t) {
  if (!env.SUPABASE_SECRET) return;
  await fetch(`${SB_URL}/rest/v1/tasas?on_conflict=fecha`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SECRET, Authorization: `Bearer ${env.SUPABASE_SECRET}`, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ fecha: t.fecha, usd: t.usd, fuente: t.fuente })
  });
}
async function vigente(hoy) {
  const r = await fetch(`${SB_URL}/rest/v1/tasas?select=fecha,usd,fuente&fecha=lte.${hoy}&order=fecha.desc&limit=1`, {
    headers: { apikey: SB_PUBLIC, Authorization: `Bearer ${SB_PUBLIC}` }
  });
  if (!r.ok) return null;
  const [row] = await r.json();
  return row ? { usd: Number(row.usd), fecha: row.fecha, fuente: row.fuente } : null;
}

const json = (data, status, maxAge) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${maxAge}` }
});

export async function onRequestGet({ request, env, waitUntil }) {
  const hoy = hoyVE();
  const cache = caches.default;
  const key = new Request(new URL(`/api/tasa?d=${hoy}`, request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  // 1) Lo que publica el BCV ahora (puede ser la de hoy o la de mañana) → se guarda
  let publicada = null;
  for (const src of [fromBCV, fromRespaldo]) { try { publicada = await src(); break; } catch (e) {} }
  if (publicada) { try { await guardar(env, publicada); } catch (e) {} }

  // 2) La vigente hoy: la última con fecha valor <= hoy
  let t = null;
  try { t = await vigente(hoy); } catch (e) {}
  if (!t && publicada && publicada.fecha <= hoy) t = publicada;
  if (!t) return json({ error: 'No se pudo obtener la tasa vigente de hoy.' }, 503, 60);

  const vence = `${hoy}T23:59:59-04:00`;
  const res = json({ ...t, vigente: hoy, vence, proxima: publicada && publicada.fecha > hoy ? { usd: publicada.usd, fecha: publicada.fecha } : null },
    200, Math.min(900, segHastaMedianoche()));
  waitUntil(cache.put(key, res.clone()));
  return res;
}
