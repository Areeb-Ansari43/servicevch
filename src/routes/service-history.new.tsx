import { createFileRoute } from "@tanstack/react-router";
import { FleetShell } from "@/routes/index";

export const Route = createFileRoute("/service-history/new")({
  head: () => ({
    meta: [
      { title: "Log a Service — Virtual Car Hire Fleet Tracker" },
      { name: "description", content: "Record a new service, repair or check against a VCH fleet vehicle." },
      { property: "og:title", content: "Log a Service — Virtual Car Hire" },
      { property: "og:description", content: "Record a new service, repair or check against a VCH fleet vehicle." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <FleetShell view="log-service" />,
});
