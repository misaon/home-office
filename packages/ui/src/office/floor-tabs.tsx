import { LOBBY_ID } from "@ho/sim";
import { useUi } from "../store.ts";

/** One tab per floor (Lobby + every project with a repository); the building strip in miniature. */
export function FloorTabs(): React.JSX.Element {
  const snapshot = useUi((s) => s.snapshot);
  const headcounts = useUi((s) => s.headcounts);
  const floorId = useUi((s) => s.floorId);
  const selectFloor = useUi((s) => s.selectFloor);
  const floors = [
    { id: LOBBY_ID, name: "Lobby" },
    ...[...snapshot.projects.values()]
      .filter((p) => p.repo.kind !== "none")
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ id: p.id, name: p.name })),
  ];
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 py-1">
      {floors.map((floor) => (
        <button
          key={floor.id}
          type="button"
          onClick={() => {
            selectFloor(floor.id);
          }}
          className={`rounded px-2 py-1 text-xs whitespace-nowrap ${
            floor.id === floorId ? "bg-accent text-black" : "bg-panel text-gray-300 hover:bg-line"
          }`}
        >
          {floor.name}
          <span className="ml-1 text-[10px] opacity-70">{headcounts[floor.id] ?? 0}</span>
        </button>
      ))}
    </nav>
  );
}
