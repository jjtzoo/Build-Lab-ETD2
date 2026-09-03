import towerData from "@/data/towers.json";
import mechanicsData from "@/data/mechanics.json";
import { TOWER_ATTRIBUTE_EVIDENCE_BY_TOWER } from "@/data/tower-attributes";
import type { MechanicsRecord, Tower } from "./types";

export const ELEMENTS = towerData.elements as Tower["recipe"];
export const TOWERS = towerData.towers as Tower[];
export const MECHANICS = mechanicsData.records as MechanicsRecord[];
export const MECHANICS_BY_TOWER = new Map(MECHANICS.map((record) => [record.tower, record]));
export { TOWER_ATTRIBUTE_EVIDENCE_BY_TOWER };
