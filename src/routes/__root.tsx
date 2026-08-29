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
        rel: "apple-touch-icon",
        href: "/whatsapp/virtual-car-hire-welcome.jpg",
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

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
