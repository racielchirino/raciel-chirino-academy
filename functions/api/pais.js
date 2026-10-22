// Cloudflare Pages Function: /api/pais
// Devuelve el país desde donde se conecta el visitante (lo detecta Cloudflare por su conexión).
export function onRequestGet({ request }) {
  const country = (request.cf && request.cf.country) || request.headers.get('cf-ipcountry') || null;
  return new Response(JSON.stringify({ country }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' }
  });
}
