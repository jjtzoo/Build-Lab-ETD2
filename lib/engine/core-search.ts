import type { ElementName } from "@/lib/types";

const ELEMENTS: ElementName[] = [
  "Light",
  "Darkness",
  "Water",
  "Fire",
  "Nature",
  "Earth",
];

export function allCoreCombinations(): ElementName[][] {
  const cores: ElementName[][] = [];

  for (let i = 0; i < ELEMENTS.length; i += 1) {
    for (
      let j = i + 1;
      j < ELEMENTS.length;
      j += 1
    ) {
      for (
        let k = j + 1;
        k < ELEMENTS.length;
        k += 1
      ) {
        cores.push([
          ELEMENTS[i],
          ELEMENTS[j],
          ELEMENTS[k],
        ]);
      }
    }
  }

  return cores;
}