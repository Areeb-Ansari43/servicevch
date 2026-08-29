import { createFileRoute } from "@tanstack/react-router";
import { FleetShell } from "@/routes/index";

export const Route = createFileRoute("/accident-cases")({
  head: () => ({
    meta: [
      { title: "Accident Cases — Virtual Car Hire Fleet Tracker" },
      {
        name: "description",
        content: "AI-triaged accident reports with severity, vehicle and driver details.",
      },
      { property: "og:title", content: "Accident Cases — Virtual Car Hire" },
      {
        property: "og:description",
        content: "AI-triaged accident reports with severity, vehicle and driver details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <FleetShell view="accidents" />,
});
