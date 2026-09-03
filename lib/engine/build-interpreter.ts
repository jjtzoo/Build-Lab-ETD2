import { aggregateBuildCapabilities } from "@/lib/engine/capabilities";
import {
  deriveCompensations,
  deriveVulnerabilities,
} from "@/lib/engine/compensation";
import { deriveElementalComposition } from "@/lib/engine/element-analysis";
import {
  deriveCapabilityGaps,
  deriveRequirements,
} from "@/lib/engine/requirements";
import { deriveStrategicProfiles } from "@/lib/engine/strategic-profile";
import type { BuildInterpretation, BuildState } from "@/lib/types";

export function interpretBuild(state: BuildState): BuildInterpretation {
  const capabilities = aggregateBuildCapabilities(state);
  const elementalComposition = deriveElementalComposition(state);
  const strategicProfiles = deriveStrategicProfiles(capabilities);
  const requirements = deriveRequirements(strategicProfiles);
  const gaps = deriveCapabilityGaps(capabilities, requirements);
  const compensations = deriveCompensations(capabilities, strategicProfiles, gaps);
  const vulnerabilities = deriveVulnerabilities(gaps, compensations);

  return Object.freeze({
    capabilities,
    elementalComposition,
    strategicProfiles,
    requirements,
    gaps,
    compensations,
    vulnerabilities,
  });
}
