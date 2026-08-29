import { createFileRoute } from "@tanstack/react-router";
import { FleetShell } from "@/routes/index";

export const Route = createFileRoute("/drivers")({
  head: () => ({
    meta: [
      { title: "Drivers — Virtual Car Hire Fleet Tracker" },
      {
        name: "description",
        content: "Manage client drivers and link them to vehicles in the Virtual Car Hire fleet.",
      },
      { property: "og:title", content: "Drivers — Virtual Car Hire" },
      {
        property: "og:description",
        content: "Manage client drivers and link them to vehicles in the Virtual Car Hire fleet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <FleetShell view="drivers" />,
});
