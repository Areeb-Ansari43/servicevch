import { createFileRoute } from "@tanstack/react-router";
import { FleetShell } from "@/routes/index";

export const Route = createFileRoute("/driver-mileage")({
  head: () => ({
    meta: [
      { title: "Driver Mileage — Virtual Car Hire Fleet Tracker" },
      {
        name: "description",
        content: "Track driver mileage allowances, excess miles and monthly charges.",
      },
      { property: "og:title", content: "Driver Mileage — Virtual Car Hire" },
      {
        property: "og:description",
        content: "Track driver mileage allowances, excess miles and monthly charges.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <FleetShell view="mileage" />,
});
