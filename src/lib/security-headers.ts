import { ALLOWED_BROWSER_ORIGINS, CONNECT_SRC_ORIGINS } from "./domain-config";

export { ALLOWED_BROWSER_ORIGINS };

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
  "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
  "img-src 'self' data: blob: https://media.base44.com https://files.manuscdn.com https://*.supabase.co",
  `connect-src 'self' ${CONNECT_SRC_ORIGINS.join(" ")}`,
  "media-src 'self' blob: https://*.vapi.ai",
  "form-action 'self' https://wa.me https://api.whatsapp.com",
  "frame-src 'self'",
  "frame-ancestors 'self'",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
};

export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_BROWSER_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
}

export function applySecurityHeaders(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  // Remove any permissive route-level value before applying the allowlist.
  headers.delete("Access-Control-Allow-Origin");
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  for (const [name, value] of Object.entries(getCorsHeaders(request))) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const corsMethods = "POST, OPTIONS";
export const corsHeaders = "content-type";
