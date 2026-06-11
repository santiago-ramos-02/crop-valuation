import assert from "node:assert/strict"
import test from "node:test"

import {
  equilibriumAgeFromAnnualFlows,
  projectedEquilibriumAgeYears,
} from "./equilibrium-year.ts"

const multiHarvestRecoveryFlows = [
  { ageYears: 1, netFlowCopHa: -100 },
  { ageYears: 2, netFlowCopHa: 30 },
  { ageYears: 3, netFlowCopHa: 30 },
  { ageYears: 4, netFlowCopHa: 50 },
]

test("equilibrium accumulates profit across multiple harvest years", () => {
  assert.equal(equilibriumAgeFromAnnualFlows(multiHarvestRecoveryFlows), 3.8)
})

test("projected equilibrium prefers annual flows over current-year-only fallback", () => {
  assert.equal(
    projectedEquilibriumAgeYears({
      annualFlows: multiHarvestRecoveryFlows,
      breakEvenAgeYears: null,
      currentAgeYears: 2,
      currentYearUtilityCopHa: 30,
      pendingRecoveryCopHa: 70,
      referenceAgeYears: null,
    }),
    3.8,
  )
})

test("equilibrium stays unavailable when lifecycle flows never recover", () => {
  assert.equal(
    equilibriumAgeFromAnnualFlows([
      { ageYears: 1, netFlowCopHa: -100 },
      { ageYears: 2, netFlowCopHa: 25 },
      { ageYears: 3, netFlowCopHa: 25 },
    ]),
    null,
  )
})
