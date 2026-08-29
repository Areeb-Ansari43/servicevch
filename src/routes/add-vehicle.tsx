import { createFileRoute } from "@tanstack/react-router";
import { FleetShell } from "@/routes/index";

export const Route = createFileRoute("/add-vehicle")({
  head: () => ({
    meta: [
      { title: "Add Vehicle — Virtual Car Hire Fleet Tracker" },
      {
        name: "description",
        content: "Add a vehicle to the VCH fleet with registration lookup auto-fill.",
      },
      { property: "og:title", content: "Add Vehicle — Virtual Car Hire" },
      {
        property: "og:description",
        content: "Add a vehicle to the VCH fleet with registration lookup auto-fill.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <FleetShell view="add" />,
});
