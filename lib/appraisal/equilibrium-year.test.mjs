import assert from "node:assert/strict"
import test from "node:test"

import {
  capitalizedEquilibriumAgeFromAnnualFlows,
  projectedEquilibriumAgeYears,
} from "./equilibrium-year.ts"

const multiHarvestRecoveryFlows = [
  { ageYears: 1, netFlowCopHa: -100 },
  { ageYears: 2, netFlowCopHa: 30 },
  { ageYears: 3, netFlowCopHa: 30 },
  { ageYears: 4, netFlowCopHa: 50 },
]

test("capitalized equilibrium accumulates profit across multiple harvest years", () => {
  assert.equal(capitalizedEquilibriumAgeFromAnnualFlows(multiHarvestRecoveryFlows, 0), 3.8)
})

test("projected equilibrium prefers annual flows over current-year-only fallback", () => {
  assert.equal(
    projectedEquilibriumAgeYears({
      annualFlows: multiHarvestRecoveryFlows,
      breakEvenAgeYears: null,
      currentAgeYears: 2,
      currentYearUtilityCopHa: 30,
      pendingRecoveryCopHa: 70,
      discountRateEa: 0,
      referenceAgeYears: null,
    }),
    3.8,
  )
})

test("capitalized equilibrium stays unavailable when lifecycle flows never recover", () => {
  assert.equal(
    capitalizedEquilibriumAgeFromAnnualFlows(
      [
        { ageYears: 1, netFlowCopHa: -100 },
        { ageYears: 2, netFlowCopHa: 25 },
        { ageYears: 3, netFlowCopHa: 25 },
      ],
      0,
    ),
    null,
  )
})
