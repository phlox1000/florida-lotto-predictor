/**
 * Resolve the original client IP for a request.
 *
 * Production topology (discovered the hard way during PR #34's verification):
 *
 *   client → Cloudflare edge → Render LB → Express app
 *
 * That's TWO proxy hops, not one. Render proxies all *.onrender.com traffic
 * through Cloudflare for DDoS protection by default. With `app.set("trust
 * proxy", 1)` Express only trusts the last X-Forwarded-For entry, which in
 * this topology resolves to a Cloudflare edge POP IP — and Cloudflare load-
 * balances across many POPs, so a burst of 11 requests from the same client
 * arrives keyed under 11 different "client IPs", and per-IP rate limits
 * never accumulate.
 *
 * Cloudflare always sets the `CF-Connecting-IP` header to the original
 * client IP regardless of how many proxies sit in front, and strips any
 * inbound CF-Connecting-IP from the client before forwarding (so a client
 * cannot spoof it). Reading this header is the most robust way to identify
 * the actual client behind a Render+Cloudflare stack.
 *
 * Resolution order:
 *   1. CF-Connecting-IP — preferred. Always set when the request came
 *      through Cloudflare; immune to XFF games.
 *   2. req.ip — Express's computed IP, governed by `trust proxy`. Used
 *      in local dev (no Cloudflare in front) and as a defensive fallback
 *      in case Cloudflare ever stops sending the header.
 *   3. "unknown" — single shared bucket. Degraded but safe (no one
 *      bypasses the limit); preferable to letting attackers get unlimited
 *      fresh buckets by sending malformed requests.
 *
 * Why not switch to `trust proxy: true`?
 *   `true` would also trust an XFF set by a directly-connected attacker if
 *   the app were ever reachable without going through Cloudflare. The
 *   current Render setup makes that impossible, but coupling our identity
 *   logic to that assumption is brittle. CF-Connecting-IP is set ONLY by
 *   Cloudflare, never by the client, so it's safe under any topology.
 */
export function getClientIp(req: {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}): string {
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp.length > 0) {
    return cfIp;
  }
  // Cloudflare doesn't send arrays for CF-Connecting-IP, but Node's
  // http.IncomingHttpHeaders type allows string[] for any header, so a
  // defensive narrow keeps the type checker happy without changing behavior.
  if (Array.isArray(cfIp) && cfIp.length > 0 && typeof cfIp[0] === "string" && cfIp[0].length > 0) {
    return cfIp[0];
  }
  return req.ip ?? "unknown";
}
