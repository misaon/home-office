import { ChevronsUpDown, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { sortedFloors, useUi } from "../store.ts";

/**
 * Which floor the office is showing. A row of tabs is fine for three projects and unusable for thirty,
 * so this is shadcn's combobox: one button, and a list that takes typing. The search reads the
 * repository as well as the name, so two floors called `api` are still told apart.
 */
export function FloorPicker(): React.JSX.Element {
  const { t } = useTranslation();
  const projects = useUi((s) => s.snapshot.projects);
  const floorId = useUi((s) => s.floorId);
  const selectFloor = useUi((s) => s.selectFloor);
  const setAddProjectOpen = useUi((s) => s.setAddProjectOpen);
  const [open, setOpen] = useState(false);

  const floors = sortedFloors(projects);
  const current = floors.findIndex((p) => p.id === floorId);
  const label = floors[current]?.name ?? t("project.floors");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-expanded={open}
          title={label}
          className="max-w-56 justify-between border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
        >
          <span className="font-mono text-2xs opacity-70">{String(current + 1)}</span>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          <ChevronsUpDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder={t("project.search")} />
          <CommandList>
            <CommandEmpty>{t("project.noMatch")}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={t("project.add")}
                className="text-primary"
                onSelect={() => {
                  setOpen(false);
                  setAddProjectOpen(true);
                }}
              >
                <Plus />
                {t("project.add")}
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              {floors.map((floor, index) => (
                <CommandItem
                  key={floor.id}
                  value={`${floor.name} ${floor.repo.kind === "local" ? floor.repo.path : floor.repo.url}`}
                  onSelect={() => {
                    selectFloor(floor.id);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{floor.name}</span>
                  <span className="font-mono text-2xs text-muted-foreground">
                    {String(index + 1)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
