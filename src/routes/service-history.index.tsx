import { createFileRoute } from "@tanstack/react-router";
import { FleetShell } from "@/routes/index";

export const Route = createFileRoute("/service-history/")({
  head: () => ({
    meta: [
      { title: "Service History — Virtual Car Hire Fleet Tracker" },
      { name: "description", content: "Every logged service, garage, cost and mileage across the VCH fleet." },
      { property: "og:title", content: "Service History — Virtual Car Hire" },
      { property: "og:description", content: "Every logged service, garage, cost and mileage across the VCH fleet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <FleetShell view="services" />,
});
