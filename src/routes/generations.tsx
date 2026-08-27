import { createFileRoute } from "@tanstack/react-router";
import { FleetShell } from "@/routes/index";

export const Route = createFileRoute("/generations")({
  head: () => ({ meta: [{ title: "Generations — Virtual Car Hire" }, { name: "description", content: "Generate permission letters and contracts with Azure licence scanning." }] }),
  component: () => <FleetShell view="generations" />,
});
