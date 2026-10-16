import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        return json(
          {
            status: "ok",
            git_commit: process.env.GIT_COMMIT || process.env.CF_PAGES_COMMIT_SHA || "c36616a5628dca371264ea95d004a5cbfa965fd4",
            build_time: new Date().toISOString(),
            env: process.env.NODE_ENV || "production",
          },
          200,
        );
      },
    },
  },
});
