import { createFileRoute } from "@tanstack/react-router";
import { FleetShell } from "@/routes/index";

export const Route = createFileRoute("/whatsapp-leads")({
  head: () => ({
    meta: [
      { title: "WhatsApp Leads — Virtual Car Hire Fleet Tracker" },
      {
        name: "description",
        content: "Inbound WhatsApp enquiries triaged by AI into actionable rental leads.",
      },
      { property: "og:title", content: "WhatsApp Leads — Virtual Car Hire" },
      {
        property: "og:description",
        content: "Inbound WhatsApp enquiries triaged by AI into actionable rental leads.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <FleetShell view="leads" />,
});
