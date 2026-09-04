import type { ElementName } from "@/lib/types";

export const ELEMENT_VISUALS = Object.freeze({
  Light: { color: "#f1d783", symbol: "☀", short: "L", slug: "light" },
  Darkness: { color: "#b79bef", symbol: "◆", short: "D", slug: "darkness" },
  Water: { color: "#7dc7e8", symbol: "≈", short: "W", slug: "water" },
  Fire: { color: "#ed9775", symbol: "▲", short: "F", slug: "fire" },
  Nature: { color: "#95ce9b", symbol: "✦", short: "N", slug: "nature" },
  Earth: { color: "#c8af8b", symbol: "⬡", short: "E", slug: "earth" },
} satisfies Record<ElementName, { color: string; symbol: string; short: string; slug: string }>);
