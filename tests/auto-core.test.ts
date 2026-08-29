import { describe, expect, it } from "vitest";

import {
  optimizeAutoCore,
} from "@/lib/engine/auto-core";

describe("auto core optimization", () => {
  it("finds a winning core automatically", () => {
    const result =
      optimizeAutoCore();

    expect(result).not.toBeNull();
    expect(result?.core).toHaveLength(3);
    expect(result?.result.winner).not.toBeNull();
  });
});