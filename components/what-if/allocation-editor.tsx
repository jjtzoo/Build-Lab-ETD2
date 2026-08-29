"use client";

import type { Allocation } from "@/lib/types";

interface AllocationEditorProps {
  allocation: Allocation | null;
  onChange: (allocation: Allocation) => void;
}

const elements = [
  "Light",
  "Darkness",
  "Water",
  "Fire",
  "Nature",
  "Earth",
] as const;

export function AllocationEditor({
  allocation,
  onChange,
}: AllocationEditorProps) {
  if (!allocation) {
    return (
      <div className="notice">
        No Build Lab recommendation is available yet.
      </div>
    );
  }

  function movePoint(
    fromIndex: number,
    toIndex: number,
  ) {
    if (!allocation) {
      return;
    }

    if (fromIndex === toIndex) {
      return;
    }

    if (allocation[fromIndex] <= 0) {
      return;
    }

    if (allocation[toIndex] >= 3) {
      return;
    }

    const next = [...allocation] as Allocation;

    next[fromIndex] -= 1;
    next[toIndex] += 1;

    onChange(next);
  }

  return (
    <div>
      <div className="eyebrow">
        SCENARIO ALLOCATION
      </div>

      <h2>Move One Point</h2>

      <p className="muted">
        Move one elemental point at a time.
        The 11-point total is preserved
        automatically.
      </p>

      <div
        className="alloc-grid"
        style={{ marginTop: 14 }}
      >
        {allocation.map((level, index) => (
          <div
            className="alloc-card"
            key={elements[index]}
          >
            <div className="e">
              {elements[index]}
            </div>

            <div className="n">
              {level}
            </div>

            <div
              className="muted"
              style={{
                marginTop: 6,
                fontSize: 10,
              }}
            >
              {level <= 0
                ? "No points available"
                : level >= 3
                  ? "Maxed"
                  : `Level ${level}`}
            </div>
          </div>
        ))}
      </div>

      <div
        className="panel"
        style={{ marginTop: 14 }}
      >
        <div className="rank">
          MOVE 1 POINT
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr auto 1fr",
            gap: 10,
            alignItems: "center",
            marginTop: 10,
          }}
        >
          {elements.map((from, fromIndex) => (
            <div key={from}>
              {elements.map(
                (to, toIndex) => {
                  if (
                    fromIndex === toIndex
                  ) {
                    return null;
                  }

                  const disabled =
                    allocation[fromIndex] <=
                      0 ||
                    allocation[toIndex] >= 3;

                  return (
                    <button
                      key={`${from}-${to}`}
                      type="button"
                      className="chip"
                      disabled={disabled}
                      onClick={() =>
                        movePoint(
                          fromIndex,
                          toIndex,
                        )
                      }
                      style={{
                        marginRight: 6,
                        marginBottom: 6,
                        cursor: disabled
                          ? "not-allowed"
                          : "pointer",
                        opacity: disabled
                          ? 0.4
                          : 1,
                      }}
                    >
                      {from} → {to}
                    </button>
                  );
                },
              )}
            </div>
          ))}
        </div>
      </div>

      <div
        className="notice"
        style={{ marginTop: 14 }}
      >
        Total points:{" "}
        <b>
          {allocation.reduce(
            (sum, value) =>
              sum + value,
            0,
          )}
        </b>
        {" / 11"}
      </div>
    </div>
  );
}