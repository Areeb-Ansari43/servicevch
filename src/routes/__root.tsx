import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { NotFoundPanel } from "@/components/not-found-panel";

function NotFoundComponent() {
  return (
    <div
      className="relative flex min-h-screen items-center justify-center px-4"
      style={{ background: "linear-gradient(160deg,#0b0d12,#11141b 55%,#0b0d12)" }}
    >
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(60rem 40rem at 12% -10%, rgba(255,106,0,0.16), transparent 60%), radial-gradient(50rem 36rem at 95% 0%, rgba(56,189,248,0.14), transparent 60%)",
        }}
        aria-hidden
      />
      <div className="relative w-full max-w-lg">
        <NotFoundPanel
          title="We couldn't find that page"
          subtitle="The link may be out of date, or the page has moved."
          showVehiclesLink
        />
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

const themeInitScript = `(function(){
  try {
    var path = window.location.pathname;
    if (path.indexOf('/login') === 0) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      return;
    }
    var mode = localStorage.getItem('vch_theme_mode') || 'dark';
    var preset = localStorage.getItem('vch_theme_preset') || 'midnight';
    var accent = localStorage.getItem('vch_theme_accent') || 'orange';

    var effectiveMode = mode;
    if (preset === 'light' && mode !== 'dark') effectiveMode = 'light';
    else if (mode === 'system') {
      effectiveMode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    }

    var presets = {
      midnight: {
        dark: { bg: 'linear-gradient(160deg, #05070c 0%, #0a0e18 45%, #080b13 100%)', surface: 'rgba(255, 255, 255, 0.055)', surface2: 'rgba(255, 255, 255, 0.10)', surfaceSolid: '#0e131d', border: 'rgba(255, 255, 255, 0.12)', borderSoft: 'rgba(255, 255, 255, 0.07)', text: '#eef2f8', textMuted: '#9aa5b8', sidebarBg: '#0c101b' },
        light: { bg: 'linear-gradient(160deg, #f1f5f9 0%, #e2e8f0 100%)', surface: '#ffffff', surface2: '#f1f5f9', surfaceSolid: '#ffffff', border: '#cbd5e1', borderSoft: '#e2e8f0', text: '#0f172a', textMuted: '#475569', sidebarBg: '#f8fafc' }
      },
      graphite: {
        dark: { bg: 'linear-gradient(160deg, #121316 0%, #181a20 45%, #13151a 100%)', surface: 'rgba(255, 255, 255, 0.065)', surface2: 'rgba(255, 255, 255, 0.12)', surfaceSolid: '#1c1e24', border: 'rgba(255, 255, 255, 0.14)', borderSoft: 'rgba(255, 255, 255, 0.08)', text: '#f3f4f6', textMuted: '#9ca3af', sidebarBg: '#16181d' },
        light: { bg: 'linear-gradient(160deg, #f3f4f6 0%, #e5e7eb 100%)', surface: '#ffffff', surface2: '#f3f4f6', surfaceSolid: '#ffffff', border: '#d1d5db', borderSoft: '#e5e7eb', text: '#111827', textMuted: '#374151', sidebarBg: '#ffffff' }
      },
      light: {
        dark: { bg: 'linear-gradient(160deg, #1e293b 0%, #0f172a 100%)', surface: 'rgba(255, 255, 255, 0.08)', surface2: 'rgba(255, 255, 255, 0.14)', surfaceSolid: '#1e293b', border: 'rgba(255, 255, 255, 0.16)', borderSoft: 'rgba(255, 255, 255, 0.10)', text: '#f8fafc', textMuted: '#94a3b8', sidebarBg: '#0f172a' },
        light: { bg: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', surface: '#ffffff', surface2: '#f1f5f9', surfaceSolid: '#ffffff', border: '#cbd5e1', borderSoft: '#e2e8f0', text: '#0f172a', textMuted: '#334155', sidebarBg: '#ffffff' }
      },
      ocean: {
        dark: { bg: 'linear-gradient(160deg, #031326 0%, #071d36 45%, #04162c 100%)', surface: 'rgba(224, 242, 254, 0.07)', surface2: 'rgba(224, 242, 254, 0.12)', surfaceSolid: '#0b2447', border: 'rgba(224, 242, 254, 0.15)', borderSoft: 'rgba(224, 242, 254, 0.08)', text: '#e0f2fe', textMuted: '#7dd3fc', sidebarBg: '#06182e' },
        light: { bg: 'linear-gradient(160deg, #f0f9ff 0%, #e0f2fe 100%)', surface: '#ffffff', surface2: '#e0f2fe', surfaceSolid: '#ffffff', border: '#93c5fd', borderSoft: '#bae6fd', text: '#0c4a6e', textMuted: '#0369a1', sidebarBg: '#f0f9ff' }
      }
    };

    var accents = {
      orange: { hex: '#ff6a00', hover: '#e05d00', textDark: '#ff8a3d', textLight: '#c2410c' },
      blue: { hex: '#2563eb', hover: '#1d4ed8', textDark: '#60a5fa', textLight: '#1d4ed8' },
      emerald: { hex: '#059669', hover: '#047857', textDark: '#34d399', textLight: '#047857' },
      violet: { hex: '#7c3aed', hover: '#6d28d9', textDark: '#a78bfa', textLight: '#6d28d9' },
      rose: { hex: '#e11d48', hover: '#be123c', textDark: '#fb7185', textLight: '#be123c' },
      gold: { hex: '#d97706', hover: '#b45309', textDark: '#fbbf24', textLight: '#b45309' }
    };

    var p = presets[preset] || presets.midnight;
    var c = effectiveMode === 'light' ? p.light : p.dark;
    var a = accents[accent] || accents.orange;

    var r = document.documentElement;
    r.setAttribute('data-mode', mode);
    r.setAttribute('data-effective-mode', effectiveMode);
    r.setAttribute('data-theme-preset', preset);
    r.setAttribute('data-accent-color', accent);

    if (effectiveMode === 'dark') {
      r.classList.add('dark');
      r.classList.remove('light');
    } else {
      r.classList.add('light');
      r.classList.remove('dark');
    }

    r.style.setProperty('--vch-bg', c.bg);
    r.style.setProperty('--vch-surface', c.surface);
    r.style.setProperty('--vch-surface-2', c.surface2);
    r.style.setProperty('--vch-surface-solid', c.surfaceSolid);
    r.style.setProperty('--vch-border', c.border);
    r.style.setProperty('--vch-border-soft', c.borderSoft);
    r.style.setProperty('--vch-text', c.text);
    r.style.setProperty('--vch-text-muted', c.textMuted);
    r.style.setProperty('--vch-sidebar-bg', c.sidebarBg);

    r.style.setProperty('--vch-accent', a.hex);
    r.style.setProperty('--vch-accent-hover', a.hover);
    r.style.setProperty('--vch-accent-soft', a.hex === '#ff6a00' ? 'rgba(255, 106, 0, 0.15)' : a.hex + '26');
    r.style.setProperty('--vch-accent-text', effectiveMode === 'light' ? a.textLight : a.textDark);
    r.style.setProperty('--vch-ring', a.hex);

    if (effectiveMode === 'light') {
      r.style.setProperty('--vch-success-bg', '#dcfce7');
      r.style.setProperty('--vch-success-text', '#15803d');
      r.style.setProperty('--vch-success-border', '#86efac');
      r.style.setProperty('--vch-danger-bg', '#fee2e2');
      r.style.setProperty('--vch-danger-text', '#b91c1c');
      r.style.setProperty('--vch-danger-border', '#fca5a5');
      r.style.setProperty('--vch-warning-bg', '#fef3c7');
      r.style.setProperty('--vch-warning-text', '#b45309');
      r.style.setProperty('--vch-warning-border', '#fde68a');
      r.style.setProperty('--vch-info-bg', '#e0f2fe');
      r.style.setProperty('--vch-info-text', '#0369a1');
      r.style.setProperty('--vch-info-border', '#bae6fd');
    } else {
      r.style.setProperty('--vch-success-bg', 'rgba(34, 197, 94, 0.15)');
      r.style.setProperty('--vch-success-text', '#86efac');
      r.style.setProperty('--vch-success-border', 'rgba(34, 197, 94, 0.35)');
      r.style.setProperty('--vch-danger-bg', 'rgba(239, 68, 68, 0.15)');
      r.style.setProperty('--vch-danger-text', '#fca5a5');
      r.style.setProperty('--vch-danger-border', 'rgba(239, 68, 68, 0.35)');
      r.style.setProperty('--vch-warning-bg', 'rgba(245, 158, 11, 0.15)');
      r.style.setProperty('--vch-warning-text', '#fde68a');
      r.style.setProperty('--vch-warning-border', 'rgba(245, 158, 11, 0.35)');
      r.style.setProperty('--vch-info-bg', 'rgba(56, 189, 248, 0.15)');
      r.style.setProperty('--vch-info-text', '#7dd3fc');
      r.style.setProperty('--vch-info-border', 'rgba(56, 189, 248, 0.35)');
    }
  } catch(e) {}
})();`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      { name: "theme-color", content: "#05070c" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Virtual Car Hire" },
      { title: "Virtual Car Hire Fleet Manager" },
      {
        name: "description",
        content:
          "VCH Fleet Manager is a web application for managing a vehicle fleet, tracking mileage, and logging services.",
      },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Service VCH" },
      {
        property: "og:description",
        content:
          "VCH Fleet Manager is a web application for managing a vehicle fleet, tracking mileage, and logging services.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Service VCH" },
      {
        name: "twitter:description",
        content:
          "VCH Fleet Manager is a web application for managing a vehicle fleet, tracking mileage, and logging services.",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/6o9fnvMqPjRQxcQx2YTW2nNrZpu1/social-images/social-1782752720678-Screenshot_2026-06-26_165610.webp",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/6o9fnvMqPjRQxcQx2YTW2nNrZpu1/social-images/social-1782752720678-Screenshot_2026-06-26_165610.webp",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "manifest",
        href: "/manifest.json",
      },
      {
        rel: "icon",
        type: "image/x-icon",
        href: "/favicon.ico?v=20260901",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32.png?v=20260901",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png?v=20260901",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch((err) => {
          console.error("ServiceWorker registration failed:", err);
        });
      });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
