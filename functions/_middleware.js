// Cloudflare Pages: todas las direcciones alternas (www, .pages.dev, vistas previas)
// redirigen a la dirección oficial. Así el botón de Google siempre funciona.
const OFICIAL = 'racielchirinoacademy.com';
export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname !== OFICIAL && url.hostname !== 'localhost') {
    url.hostname = OFICIAL; url.protocol = 'https:'; url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
