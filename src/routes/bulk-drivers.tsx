import { createFileRoute } from "@tanstack/react-router";
import { FleetShell } from "@/routes/index";

export const Route = createFileRoute("/bulk-drivers")({
  head: () => ({
    meta: [
      { title: "Bulk Driver Recognition — Virtual Car Hire Fleet Tracker" },
      { name: "description", content: "Add many drivers at once by reading their driving licences." },
    ],
  }),
  component: () => <FleetShell view="bulk" />,
});
