"use client"

import * as React from "react"

import { Input } from "@/components/ui/input"
import { formatNumberInput, formatNumberInputDraft, parseLocalizedNumberInput } from "@/lib/number-notation"

type NumericInputProps = Omit<React.ComponentProps<typeof Input>, "inputMode" | "onChange" | "type" | "value"> & {
  value: string | number | null | undefined
  onValueChange: (value: string) => void
}

function NumericInput({ value, onBlur, onFocus, onValueChange, ...props }: NumericInputProps) {
  const [displayValue, setDisplayValue] = React.useState(() => formatNumberInput(value))
  const isFocused = React.useRef(false)

  React.useEffect(() => {
    if (!isFocused.current) setDisplayValue(formatNumberInput(value))
  }, [value])

  const commitValue = (text: string) => {
    const parsed = parseLocalizedNumberInput(text)
    const nextValue = parsed === null ? "" : String(parsed)
    onValueChange(nextValue)
    return nextValue
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={(event) => {
        const nextDisplayValue = formatNumberInputDraft(event.target.value)
        setDisplayValue(nextDisplayValue)
        commitValue(nextDisplayValue)
      }}
      onBlur={(event) => {
        const nextValue = commitValue(event.target.value)
        setDisplayValue(formatNumberInput(nextValue))
        isFocused.current = false
        onBlur?.(event)
      }}
      onFocus={(event) => {
        isFocused.current = true
        onFocus?.(event)
      }}
    />
  )
}

export { NumericInput }
