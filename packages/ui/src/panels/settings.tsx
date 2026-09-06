import { AgentsSettings } from "./settings-agents.tsx";
import { ProjectsSettings } from "./settings-projects.tsx";
import { TokenSettings } from "./settings-token.tsx";

export function SettingsPanel(): React.JSX.Element {
  return (
    <div className="space-y-4 overflow-y-auto p-3 text-xs">
      <TokenSettings />
      <ProjectsSettings />
      <AgentsSettings />
    </div>
  );
}
