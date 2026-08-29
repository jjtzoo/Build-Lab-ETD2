import type { ElementName } from "@/lib/types";
import { TowerAnchor } from "@/components/build-lab/tower-anchor";

interface BuildInputProps {
  core: ElementName[];
  anchor: string;
  mode: "manual" | "auto";
  onModeChange: (mode: "manual" | "auto") => void;
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
      <div className="section-title">
        <div>
          <div className="eyebrow">
            BUILD INPUT
          </div>

          <h2>Choose Your Core</h2>

          <div className="sub">
            Your core is a preferred ecosystem — not a locked
            final allocation.
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginTop: 14,
          marginBottom: 14,
        }}
      >
        <button
          type="button"
          className="active"
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--panel-2)",
            color: "inherit",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          Manual
        </button>

        <button
          type="button"
          disabled
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "inherit",
            opacity: 0.45,
            cursor: "not-allowed",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          Auto
        </button>
      </div>

      {core.map((value, index) => (
        <div
          className="field"
          key={index}
        >
          <label>
            Element {index + 1}
          </label>

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
        style={{
          marginTop: 4,
        }}
      >
        {loading
          ? "Evaluating…"
          : "Optimize Build"}
      </button>

      <div style={{ height: 12 }} />

      {error && (
        <div className="notice warn">
          <b>Evaluation error:</b>{" "}
          {error}
        </div>
      )}

      <div style={{ height: 12 }} />

      <div className="notice">
        The engine never assumes{" "}
        <b>3-3-3-2</b>. It evaluates legal
        allocations for the selected core,
        including paths that unlock additional
        Tri/Quad towers.
      </div>

      <div style={{ height: 12 }} />

      <div className="notice warn">
        <b>Pure Element Charge</b> is modeled as
        a separate scarce resource. The current
        source material does not specify its exact
        quantity/usage rules, so the engine will
        not invent or auto-spend charges.
      </div>
    </aside>
  );
}