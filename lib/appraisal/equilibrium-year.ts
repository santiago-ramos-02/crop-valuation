type NumericInput = string | number | null | undefined

export interface EquilibriumFlowInput {
  ageYears: NumericInput
  netFlowCopHa: NumericInput
}

export interface EquilibriumAgeInput {
  annualFlows?: EquilibriumFlowInput[]
  breakEvenAgeYears: NumericInput
  currentAgeYears: NumericInput
  currentYearUtilityCopHa: NumericInput
  pendingRecoveryCopHa: NumericInput
  referenceAgeYears?: NumericInput
}

function numericValue(value: NumericInput) {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function equilibriumAgeFromAnnualFlows(flows: EquilibriumFlowInput[]) {
  const validFlows = flows
    .map((flow) => {
      const ageYears = numericValue(flow.ageYears)
      const netFlowCopHa = numericValue(flow.netFlowCopHa)
      return ageYears === null || netFlowCopHa === null ? null : { ageYears, netFlowCopHa }
    })
    .filter((flow): flow is { ageYears: number; netFlowCopHa: number } => flow !== null)
    .sort((left, right) => left.ageYears - right.ageYears)

  let cumulativeNetFlowCopHa = 0
  let previousAgeYears = 0

  for (const flow of validFlows) {
    const previousCumulativeNetFlowCopHa = cumulativeNetFlowCopHa
    cumulativeNetFlowCopHa += flow.netFlowCopHa

    if (cumulativeNetFlowCopHa >= 0) {
      if (previousCumulativeNetFlowCopHa >= 0 || flow.netFlowCopHa <= 0) return flow.ageYears

      const yearSpan = flow.ageYears - previousAgeYears
      const recoveryFraction = Math.min(Math.max(-previousCumulativeNetFlowCopHa / flow.netFlowCopHa, 0), 1)
      return previousAgeYears + yearSpan * recoveryFraction
    }

    previousAgeYears = flow.ageYears
  }

  return null
}

export function projectedEquilibriumAgeYears({
  annualFlows,
  breakEvenAgeYears,
  currentAgeYears,
  currentYearUtilityCopHa,
  pendingRecoveryCopHa,
  referenceAgeYears,
}: EquilibriumAgeInput) {
  const directAge = numericValue(breakEvenAgeYears)
  if (directAge !== null) return directAge

  const flowAge = annualFlows ? equilibriumAgeFromAnnualFlows(annualFlows) : null
  if (flowAge !== null) return flowAge

  const referenceAge = numericValue(referenceAgeYears)
  if (referenceAge !== null) return referenceAge

  const currentAge = numericValue(currentAgeYears)
  if (currentAge === null) return null

  const pendingRecovery = numericValue(pendingRecoveryCopHa)
  if (pendingRecovery !== null && pendingRecovery <= 0) return currentAge

  const currentUtility = numericValue(currentYearUtilityCopHa)
  if (pendingRecovery === null || currentUtility === null || currentUtility <= 0) return null

  return currentAge + pendingRecovery / currentUtility
}
