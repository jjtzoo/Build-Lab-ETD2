import { TOWERS } from "@/lib/data";
import type { Tower } from "@/lib/types";

interface TowerAnchorProps {
  value: string;
  onChange: (value: string) => void;
}

export function TowerAnchor({
  value,
  onChange,
}: TowerAnchorProps) {
  return (
    <div className="field">
      <label>Tower Anchor</label>

      <select
        className="select"
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
      >
        <option value="Auto">
          Auto
        </option>

        {TOWERS.map((tower: Tower) => (
          <option
            key={tower.name}
            value={tower.name}
          >
            {tower.name}
          </option>
        ))}
      </select>

      <div
        className="muted"
        style={{
          marginTop: 6,
          fontSize: 11,
        }}
      >
        Auto lets V8 choose the strongest
        anchor. Selecting a tower tells V8
        to preserve that tower as the build
        center.
      </div>
    </div>
  );
}