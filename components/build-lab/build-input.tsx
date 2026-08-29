import type { ElementName } from "@/lib/types";
import { TowerAnchor } from "@/components/build-lab/tower-anchor";

interface BuildInputProps {
  core: ElementName[];
  anchor: string;
  onCoreChange: (
    index: number,
    value: ElementName,
  ) => void;
  onAnchorChange: (value: string) => void;
  onOptimize: () => void;
  loading: boolean;
  error: string | null;
}

const elements: ElementName[] = [
  "Light",
  "Darkness",
  "Water",
  "Fire",
  "Nature",
  "Earth",
];

export function BuildInput({
  core,
  anchor,
  onCoreChange,
  onAnchorChange,
  onOptimize,
  loading,
  error,
}: BuildInputProps) {
  return (
    <aside className="panel">
      <div className="eyebrow">BUILD INPUT</div>

      <h2>Build focus</h2>

      <p className="muted">
        Core defines the ecosystem. Allocation determines
        the actual 11-point strategy.
      </p>

      {core.map((value, index) => (
        <div className="field" key={index}>
          <label>Core element {index + 1}</label>

          <select
            className="select"
            value={value}
            onChange={(event) =>
              onCoreChange(
                index,
                event.target.value as ElementName,
              )
            }
          >
            {elements.map((element) => (
              <option
                key={element}
                value={element}
              >
                {element}
              </option>
            ))}
          </select>
        </div>
      ))}

      <TowerAnchor
        value={anchor}
        onChange={onAnchorChange}
      />

      <button
        className="primary"
        onClick={onOptimize}
        disabled={loading}
      >
        {loading ? "Evaluating…" : "Optimize build"}
      </button>

      <div style={{ height: 12 }} />

      {error && (
        <div className="notice warn">
          <b>Evaluation error:</b> {error}
        </div>
      )}

      <div style={{ height: 12 }} />

      <div className="notice">
        V8 keeps UNKNOWN mechanics distinct from confirmed
        evidence and makes the final decision at the complete
        build level.
      </div>
    </aside>
  );
}