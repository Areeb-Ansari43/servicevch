import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const commit =
          process.env.GIT_COMMIT ||
          process.env.CF_PAGES_COMMIT_SHA ||
          process.env.VERCEL_GIT_COMMIT_SHA ||
          "main";

        const buildTime =
          process.env.BUILD_TIME ||
          process.env.CF_PAGES_BUILD_TIME ||
          new Date().toISOString();

        return new Response(
          JSON.stringify({
            status: "ok",
            git_commit: commit,
            build_time: buildTime,
            env: process.env.NODE_ENV || "production",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store, no-cache, must-revalidate",
            },
          }
        );
      },
    },
  },
});
