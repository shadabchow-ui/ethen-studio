export function movePickerActiveIndex(input: {
  currentIndex: number;
  key: string;
  optionCount: number;
}): number {
  if (input.optionCount <= 0) return -1;
  if (input.key === "Home") return 0;
  if (input.key === "End") return input.optionCount - 1;
  if (input.key === "ArrowDown") return (input.currentIndex + 1) % input.optionCount;
  if (input.key === "ArrowUp") {
    return (input.currentIndex - 1 + input.optionCount) % input.optionCount;
  }
  return input.currentIndex;
}

export function getModelPickerA11yContract(label: string) {
  return {
    inputRole: "combobox" as const,
    popupRole: "listbox" as const,
    optionRole: "option" as const,
    label,
    keyboard: ["ArrowDown", "ArrowUp", "Home", "End", "Enter", "Escape"] as const,
    unavailableAttribute: "aria-disabled" as const,
    activeAttribute: "aria-activedescendant" as const,
  };
}
