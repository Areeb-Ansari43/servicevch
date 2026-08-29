import { createFileRoute } from "@tanstack/react-router";
import { FleetShell } from "@/routes/index";

export const Route = createFileRoute("/vehicles/")({
  head: () => ({
    meta: [
      { title: "Vehicle Fleet — Virtual Car Hire Fleet Tracker" },
      {
        name: "description",
        content: "Browse every vehicle in the VCH fleet with MOT, PCO and service countdowns.",
      },
      { property: "og:title", content: "Vehicle Fleet — Virtual Car Hire" },
      {
        property: "og:description",
        content: "Browse every vehicle in the VCH fleet with MOT, PCO and service countdowns.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <FleetShell view="vehicles" />,
});
