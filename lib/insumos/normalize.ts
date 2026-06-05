function cleanText(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
}

export function normalizeText(value: unknown): string {
  const text = cleanText(value)
  if (!text) return ""

  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
