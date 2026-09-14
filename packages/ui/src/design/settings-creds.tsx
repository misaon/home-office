import { CredRow } from "./settings-cred-row.tsx";
import { useDesign } from "./store.ts";

/** The keys the office holds, each opening to what it is for and where to paste it. */
export function SettingsCreds(): React.JSX.Element {
  const creds = useDesign((s) => s.creds);
  return (
    <div
      style={{
        borderRadius: "14px",
        background: "#101013",
        border: "1px solid #232328",
        overflow: "hidden",
        marginBottom: "18px",
      }}
    >
      {creds.map((cred, i) => (
        <CredRow key={cred.name} cred={cred} index={i} first={i === 0} />
      ))}
    </div>
  );
}
