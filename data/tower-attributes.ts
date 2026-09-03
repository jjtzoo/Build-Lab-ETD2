import type {
  AttributeTier,
  CapabilityKey,
  TowerAttributeEvidence,
} from "@/lib/types";

type AttributeTiers = Partial<Record<CapabilityKey, AttributeTier>>;

function attributeRecord(
  tiers: AttributeTiers,
  page: string,
): TowerAttributeEvidence {
  return Object.freeze({
    tiers: Object.freeze(tiers),
    sourceUrl: `https://eletd2.fandom.com/wiki/${page}`,
    confidence: "medium",
  });
}

// Canonical qualitative evidence transcribed from the supplied tower attribute
// matrix. Tiers retain their Gold/Silver/Bronze semantics; they are not scores.
export const TOWER_ATTRIBUTE_EVIDENCE_BY_TOWER: Readonly<
  Record<string, TowerAttributeEvidence>
> = Object.freeze({
  Trickery: attributeRecord({ subDps: "silver", replication: "gold" }, "Trickery_Tower"),
  Ice: attributeRecord({ subDps: "silver", singleTarget: "gold", disable: "gold", areaAmp: "bronze" }, "Ice_Tower"),
  Lightning: attributeRecord({ mainDps: "gold", subDps: "bronze", singleTarget: "bronze", chain: "gold", areaAmp: "silver", range: "silver" }, "Lightning_Tower"),
  Bloom: attributeRecord({ mainDps: "gold", singleTarget: "gold", range: "bronze", uptime: "silver", attackSpeedScaling: "gold" }, "Bloom_Tower"),
  Atom: attributeRecord({ mainDps: "gold", singleTarget: "gold", range: "bronze", uptime: "gold" }, "Atom_Tower"),
  Poison: attributeRecord({ subDps: "gold", aoeDps: "silver", dot: "gold", areaAmp: "gold", range: "bronze" }, "Poison_Tower"),
  Infernal: attributeRecord({ mainDps: "gold", singleTarget: "gold", areaAmp: "bronze", range: "bronze" }, "Infernal_Tower"),
  Disease: attributeRecord({ subDps: "silver", singleTarget: "gold", execute: "gold", range: "bronze" }, "Disease_Tower"),
  Howitzer: attributeRecord({ mainDps: "gold", singleTarget: "gold", aoeDps: "gold", areaAmp: "gold", range: "gold" }, "Howitzer_Tower"),
  Vapor: attributeRecord({ mainDps: "gold", singleTarget: "bronze", aoeDps: "gold", areaAmp: "gold", range: "silver", uptime: "silver", densityScaling: "gold" }, "Vapor_Tower"),
  Well: attributeRecord({ attackSpeedAmp: "gold", range: "silver" }, "Well_Tower"),
  Geyser: attributeRecord({ mainDps: "gold", singleTarget: "silver", aoeDps: "gold", burst: "gold", areaAmp: "gold", range: "bronze" }, "Geyser_Tower"),
  Blacksmith: attributeRecord({ damageAmp: "gold", range: "bronze" }, "Blacksmith_Tower"),
  Solar: attributeRecord({ subDps: "gold", aoeDps: "silver", dot: "gold", areaAmp: "silver", range: "bronze" }, "Solar_Tower"),
  Mushroom: attributeRecord({ mainDps: "gold", singleTarget: "gold", areaAmp: "bronze", range: "bronze", slowScaling: "gold" }, "Mushroom_Tower"),
  Astral: attributeRecord({ mainDps: "gold", aoeDps: "silver", burst: "silver", areaAmp: "gold", range: "gold" }, "Astral_Tower"),
  Runic: attributeRecord({ mainDps: "gold", aoeDps: "gold", burst: "gold", areaAmp: "gold", range: "silver" }, "Runic_Tower"),
  Jinx: attributeRecord({ subDps: "silver", singleTarget: "silver", aoeDps: "bronze", damageAmp: "gold", range: "bronze" }, "Jinx_Tower"),
  Laser: attributeRecord({ mainDps: "gold", singleTarget: "gold", range: "bronze", isolation: "gold" }, "Laser_Tower"),
  Windstorm: attributeRecord({ subDps: "silver", aoeDps: "silver", slow: "gold", areaAmp: "gold", range: "silver" }, "Windstorm_Tower"),
  Wisp: attributeRecord({ mainDps: "gold", singleTarget: "gold", aoeDps: "silver", areaAmp: "silver", range: "bronze", uptime: "gold" }, "Wisp_Tower"),
  Polar: attributeRecord({ disable: "silver", areaAmp: "gold", range: "bronze", hpManipulation: "gold" }, "Polar_Tower"),
  Nova: attributeRecord({ subDps: "silver", aoeDps: "bronze", slow: "gold", areaAmp: "gold", range: "bronze" }, "Nova_Tower"),
  Money: attributeRecord({ mainDps: "gold", range: "silver", uptime: "silver", economy: "gold" }, "Money_Tower"),
  Incantation: attributeRecord({ subDps: "bronze", singleTarget: "gold", damageAmp: "gold", range: "bronze", isolation: "gold" }, "Incantation_Tower"),
  Corrosion: attributeRecord({ subDps: "silver", aoeDps: "silver", dot: "silver", damageAmp: "gold", areaAmp: "gold", range: "bronze" }, "Corrosion_Tower"),
  Flooding: attributeRecord({ mainDps: "gold", singleTarget: "silver", aoeDps: "silver", areaAmp: "gold", range: "silver", uptime: "gold" }, "Flooding_Tower"),
  Muck: attributeRecord({ subDps: "silver", aoeDps: "bronze", slow: "gold", areaAmp: "gold", range: "bronze" }, "Muck_Tower"),
  Ethereal: attributeRecord({ mainDps: "gold", singleTarget: "gold", range: "gold", killScaling: "gold" }, "Ethereal_Tower"),
  Flamethrower: attributeRecord({ mainDps: "gold", singleTarget: "bronze", aoeDps: "gold", dot: "gold", areaAmp: "gold", range: "bronze", chainReaction: "gold" }, "Flamethrower_Tower"),
  Root: attributeRecord({ subDps: "gold", aoeDps: "silver", dot: "gold", slow: "gold", areaAmp: "gold", range: "silver" }, "Root_Tower"),
  Impulse: attributeRecord({ mainDps: "gold", singleTarget: "gold", range: "gold", uptime: "silver" }, "Impulse_Tower"),
  Haste: attributeRecord({ mainDps: "gold", singleTarget: "gold", range: "bronze", uptime: "gold", attackSpeedScaling: "gold" }, "Haste_Tower"),
  Golem: attributeRecord({ mainDps: "gold", singleTarget: "gold", burst: "gold", range: "silver" }, "Golem_Tower"),
  Quake: attributeRecord({ mainDps: "gold", aoeDps: "gold", burst: "gold", areaAmp: "gold", range: "bronze" }, "Quake_Tower"),
  Singularity: attributeRecord({ mainDps: "silver", aoeDps: "bronze", disable: "silver", geometryControl: "gold", areaAmp: "gold", range: "bronze" }, "Singularity_Tower"),
  Railgun: attributeRecord({ mainDps: "gold", aoeDps: "gold", areaAmp: "gold", range: "bronze", waveClear: "gold", globalFinisher: "gold", abilityCharge: "gold" }, "Railgun_Tower"),
  "Phantom Zone": attributeRecord({ subDps: "silver", aoeDps: "silver", disable: "gold", areaAmp: "gold", range: "bronze" }, "Phantom_Zone_Tower"),
  Doom: attributeRecord({ mainDps: "gold", singleTarget: "gold", execute: "gold", range: "bronze", uptime: "gold" }, "Doom_Tower"),
  Rage: attributeRecord({ subDps: "gold", singleTarget: "gold", dot: "gold", damageAmp: "gold", range: "bronze", isolation: "gold", speedManipulation: "gold" }, "Rage_Tower"),
  Nuclear: attributeRecord({ mainDps: "gold", aoeDps: "gold", dot: "gold", slow: "silver", areaAmp: "gold", hpManipulation: "silver", waveClear: "gold" }, "Nuclear_Tower"),
  "Tesla Tree": attributeRecord({ mainDps: "gold", range: "bronze", network: "gold" }, "Tesla_Tree_Tower"),
  Obelisk: attributeRecord({ mainDps: "gold", aoeDps: "gold", burst: "gold", areaAmp: "gold", range: "bronze" }, "Obelisk_Tower"),
  "Life Altar": attributeRecord({ damageAmp: "gold", attackSpeedAmp: "gold", areaAmp: "gold", range: "bronze" }, "Life_Altar_Tower"),
  Archdruid: attributeRecord({ mainDps: "gold", aoeDps: "silver", geometryControl: "gold", areaAmp: "gold", range: "bronze" }, "Archdruid_Tower"),
  Plague: attributeRecord({ subDps: "gold", aoeDps: "gold", dot: "gold", areaAmp: "gold", range: "bronze", chainReaction: "gold", waveClear: "gold" }, "Plague_Tower"),
  "Crystal Spire": attributeRecord({ subDps: "silver", aoeDps: "silver", burst: "gold", areaAmp: "silver", range: "bronze", waveClear: "silver" }, "Crystal_Spire_Tower"),
  "Gravity Cannon": attributeRecord({ mainDps: "gold", singleTarget: "gold", geometryControl: "gold", range: "gold", isolation: "bronze", speedManipulation: "gold" }, "Gravity_Cannon_Tower"),
  Shredder: attributeRecord({ mainDps: "gold", singleTarget: "gold", aoeDps: "silver", areaAmp: "gold", range: "bronze", chainReaction: "gold", waveClear: "gold" }, "Shredder_Tower"),
  Tsunami: attributeRecord({ mainDps: "gold", aoeDps: "gold", burst: "gold", areaAmp: "gold", range: "silver", waveClear: "gold", bossSpecialist: "gold", abilityCharge: "gold" }, "Tsunami_Tower"),
});
