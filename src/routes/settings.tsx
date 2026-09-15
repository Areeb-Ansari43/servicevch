import { createFileRoute } from "@tanstack/react-router";
import { FleetShell } from "@/routes/index";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "User Settings — Virtual Car Hire Fleet Tracker" },
      {
        name: "description",
        content: "Manage your account settings, password, and preferences for Virtual Car Hire CRM.",
      },
      { property: "og:title", content: "User Settings — Virtual Car Hire" },
      {
        property: "og:description",
        content: "Manage your account settings, password, and preferences for Virtual Car Hire CRM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <FleetShell view="settings" />,
});
