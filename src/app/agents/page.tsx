import "./agent-request.css";
import { AppShell } from "@/components/app-shell";
import { AgentsWorkspace } from "@/components/agents-workspace";

export default function AgentsPage() {
  return <AppShell><main className="main-content atlas-agents-page" id="main-content">
    <AgentsWorkspace />
  </main></AppShell>;
}
