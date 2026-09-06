/**
 * Centralized Domain & Origin Configuration
 *
 * Use this file to manage all domains and allowed origins across the application.
 *
 * When transitioning to a new custom domain:
 * 1. Add your custom domain(s) to ALLOWED_BROWSER_ORIGINS and CONNECT_SRC_ORIGINS.
 * 2. Update CRM_BASE_URL / WEBSITE_BASE_URL if primary domains are changing.
 * 3. Update public/_headers (connect-src and CORS settings).
 * 4. Update Supabase Dashboard -> Authentication -> URL Configuration (Site URL & Redirect URLs).
 * 5. Update GitHub Actions workflows (.github/workflows/whatsapp-inactivity.yml) if endpoint domain changes.
 */

export const CRM_DOMAIN = "servicevch.pages.dev";
export const WEBSITE_DOMAIN = "virtualcarhire.pages.dev";

export const CRM_BASE_URL = `https://${CRM_DOMAIN}`;
export const WEBSITE_BASE_URL = `https://${WEBSITE_DOMAIN}`;

/** Allowed browser origins for CORS handling in API responses */
export const ALLOWED_BROWSER_ORIGINS = new Set([
  WEBSITE_BASE_URL,
  CRM_BASE_URL,
  // Add future custom domain origins here, e.g.:
  // "https://yourcustomdomain.com",
]);

/** Origins allowed in Content-Security-Policy connect-src directive */
export const CONNECT_SRC_ORIGINS = [
  CRM_BASE_URL,
  WEBSITE_BASE_URL,
  "https://*.supabase.co",
  "https://static.cloudflareinsights.com",
  "https://api.vapi.ai",
  "wss://*.vapi.ai",
];
