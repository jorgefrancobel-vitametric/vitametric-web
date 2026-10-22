/**
 * Vitametric — Worker de redirección www → ápice (P2 del runbook de auditoría)
 *
 * Por qué existe: mientras `www.vitametric.com` tenga como objetivo de DNS el
 * origen de GitHub Pages, cada petición a www termina en los servidores de
 * GitHub (doble origen detectado por nuclei con cabeceras x-github-request-id y
 * Fastly). Este Worker se monta con la ruta de zona `www.vitametric.com/*` y
 * responde 308 en el BORDE de Cloudflare: la petición nunca llega al origen.
 *
 * - 308 (no 302/301) preserva método y cuerpo: un POST a /api/* en www
 *   re-POSTea al ápice sin perder payload (el worker de API del ápice aplica
 *   CORS y la cuota por IP igual que siempre).
 * - Reversible: `npx wrangler delete vitametric-www` o borrar la ruta de zona.
 * - Cuando el registro DNS de www se re-apunte (pendiente de dashboard),
 *   este Worker sigue siendo la redirección canónica al ápice.
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const destination = 'https://vitametric.com' + url.pathname + url.search;
    return Response.redirect(destination, 308);
  }
};
