import assert from "node:assert/strict"
import fs from "node:fs"
import { registerHooks } from "node:module"
import test from "node:test"
import path from "node:path"
import { pathToFileURL } from "node:url"

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context)

    let resolvedPath = path.resolve(process.cwd(), specifier.slice(2))
    if (!path.extname(resolvedPath) && fs.existsSync(`${resolvedPath}.ts`)) resolvedPath = `${resolvedPath}.ts`

    return nextResolve(pathToFileURL(resolvedPath).href, context)
  },
})

const { calculateCropAppraisal } = await import("./calculate-crop-appraisal.ts")

class Query {
  #rows
  #filters = []

  constructor(rows) {
    this.#rows = rows
  }

  select() {
    return this
  }

  eq(column, value) {
    this.#filters.push((row) => row[column] === value)
    return this
  }

  order() {
    return this
  }

  returns() {
    return this
  }

  maybeSingle() {
    return Promise.resolve({ data: this.#result()[0] ?? null, error: null })
  }

  then(resolve, reject) {
    return Promise.resolve({ data: this.#result(), error: null }).then(resolve, reject)
  }

  #result() {
    return this.#filters.reduce((rows, filter) => rows.filter(filter), this.#rows)
  }
}

function mockSupabase(tables) {
  return {
    from(table) {
      return new Query(tables[table] || [])
    },
  }
}

test("vegetative appraisal stays investment-based when fresh yield is entered before harvest age", async () => {
  const supabase = mockSupabase({
    cost_template_lines: [
      {
        crop_id: "naranja",
        variety_id: "naranja_comun",
        stage_id: "establecimiento",
        quantity: "1",
        fixed_unit_price_cop: "4000000",
        unit_price_mode: "fixed",
        input_group_name: "Labores",
        input_name: "Establecimiento",
        activity_name: "Siembra",
        normalized_input_name: "establecimiento",
      },
    ],
    yield_curve_points: [
      {
        id: "naranja-comun-1",
        crop_id: "naranja",
        variety_id: "naranja_comun",
        age_years: "1",
        stage_id: "establecimiento",
        potential_yield_kg_ha: "0",
        source_row: 1,
      },
      {
        id: "naranja-comun-2",
        crop_id: "naranja",
        variety_id: "naranja_comun",
        age_years: "2",
        stage_id: "improductivo",
        potential_yield_kg_ha: "0",
        source_row: 2,
      },
      {
        id: "naranja-comun-3",
        crop_id: "naranja",
        variety_id: "naranja_comun",
        age_years: "3",
        stage_id: "mantenimiento",
        potential_yield_kg_ha: "7500",
        source_row: 3,
      },
    ],
    department_jornal_costs: [{ departamento_id: "narino", active: true, jornal_without_food_cop: "47166.67" }],
  })

  const appraisal = await calculateCropAppraisal({
    supabase,
    cropId: "naranja",
    varietyId: "naranja_comun",
    departamentoId: "narino",
    currentStageId: "establecimiento",
    ageYears: 1,
    cropAreaHa: 1,
    densityPlantsHa: 204,
    fitosanitaryFactor: 1,
    commercialPriceCopKg: 1000,
    freshYieldKgHa: 3000,
    jornalCostCop: null,
    landRentCopHaYear: null,
    slopePercent: null,
    discountRateMethod: "manual",
    discountRateEa: 0.1,
  })

  assert.equal(appraisal.currentYearRevenueCopHa, 3000000)
  assert.equal(appraisal.currentYearUtilityCopHa, -1000000)
  assert.equal(appraisal.appraisalRule, "vegetative")
  assert.equal(appraisal.startedProducing, false)
  assert.equal(appraisal.appraisedValueCopHa, 4400000)
  assert.equal(appraisal.appraisedValueCop, 4400000)
})
