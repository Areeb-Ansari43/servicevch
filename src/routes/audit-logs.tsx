import { createFileRoute } from "@tanstack/react-router";
import { FleetShell } from "@/routes/index";

export const Route = createFileRoute("/audit-logs")({
  head: () => ({
    meta: [
      { title: "Audit Logs — Virtual Car Hire Fleet Tracker" },
      {
        name: "description",
        content: "View system audit logs of staff actions and mutations in Virtual Car Hire CRM.",
      },
      { property: "og:title", content: "Audit Logs — Virtual Car Hire" },
      {
        property: "og:description",
        content: "View system audit logs of staff actions and mutations in Virtual Car Hire CRM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <FleetShell view="audit-logs" />,
});
