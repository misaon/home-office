import { AgentsSettings } from "./settings-agents.tsx";
import { ProjectsSettings } from "./settings-projects.tsx";
import { TokenSettings } from "./settings-token.tsx";

export function SettingsPanel(): React.JSX.Element {
  return (
    <div className="space-y-8 overflow-y-auto p-4 text-xs">
      <TokenSettings />
      <ProjectsSettings />
      <AgentsSettings />
    </div>
  );
}
