import { AgentsSettings } from "./settings-agents.tsx";
import { LanguageSettings } from "./settings-language.tsx";
import { ProjectsSettings } from "./settings-projects.tsx";
import { TokenSettings } from "./settings-token.tsx";

export function SettingsPanel(): React.JSX.Element {
  return (
    <div className="h-full space-y-8 overflow-y-auto p-4 text-xs">
      <LanguageSettings />
      <TokenSettings />
      <ProjectsSettings />
      <AgentsSettings />
    </div>
  );
}
