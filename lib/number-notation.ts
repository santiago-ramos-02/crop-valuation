const inputNumberFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 8,
})

function normalizeSingleSeparator(value: string, separator: "." | ",") {
  const parts = value.split(separator)
  if (parts.length === 1) return value

  const lastPart = parts.at(-1) || ""
  const integerPart = parts.slice(0, -1).join("")
  const isLikelyThousands = lastPart.length === 3 && integerPart !== "0"

  if (parts.length > 2 || isLikelyThousands) {
    return parts.join("")
  }

  return `${integerPart}.${lastPart}`
}

export function parseLocalizedNumberInput(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (value === null || value === undefined) return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const cleaned = trimmed.replace(/[^\d.,+-]/g, "")
  if (!cleaned || cleaned === "-" || cleaned === "+" || cleaned === "," || cleaned === ".") return null

  const sign = cleaned.startsWith("-") ? "-" : ""
  const unsigned = cleaned.replace(/^[+-]/, "")
  const lastComma = unsigned.lastIndexOf(",")
  const lastDot = unsigned.lastIndexOf(".")
  let normalized = unsigned

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : "."
    const groupSeparator = decimalSeparator === "," ? "." : ","
    normalized = unsigned.replaceAll(groupSeparator, "").replace(decimalSeparator, ".")
  } else if (lastComma >= 0) {
    normalized = normalizeSingleSeparator(unsigned, ",")
  } else if (lastDot >= 0) {
    normalized = normalizeSingleSeparator(unsigned, ".")
  }

  const parsed = Number(`${sign}${normalized}`)
  return Number.isFinite(parsed) ? parsed : null
}

export function formatNumberInput(value: string | number | null | undefined) {
  const parsed = parseLocalizedNumberInput(value)
  return parsed === null ? "" : inputNumberFormatter.format(parsed)
}

export function formatNumberInputDraft(value: string) {
  const cleaned = value.replace(/[^\d,+-]/g, "")
  if (!cleaned || cleaned === "-" || cleaned === "+") return cleaned

  const sign = cleaned.startsWith("-") ? "-" : ""
  const unsigned = cleaned.replace(/^[+-]/, "")
  const commaIndex = unsigned.indexOf(",")
  const integerDigits = (commaIndex >= 0 ? unsigned.slice(0, commaIndex) : unsigned).replace(/\D/g, "")
  const decimalDigits = commaIndex >= 0 ? unsigned.slice(commaIndex + 1).replace(/\D/g, "") : ""
  const integerText = integerDigits ? inputNumberFormatter.format(Number(integerDigits)) : "0"

  if (commaIndex >= 0) return `${sign}${integerText},${decimalDigits}`
  return `${sign}${integerText}`
}
