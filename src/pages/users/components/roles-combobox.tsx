import { useMemo } from "react"

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox"
import type { Role } from "@/pages/users/api/usersApi.types"

export interface RoleOption {
  value: string
  label: string
}

export interface RolesComboboxProps {
  id?: string
  roles: Role[]
  /** selected role ids */
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  emptyText?: string
  disabled?: boolean
}

export function RolesCombobox({
  id,
  roles,
  value,
  onChange,
  placeholder,
  emptyText,
  disabled,
}: RolesComboboxProps) {
  const anchor = useComboboxAnchor()

  const options = useMemo<RoleOption[]>(
    () => roles.map((role) => ({ value: role._id ?? "", label: role.name })),
    [roles]
  )

  const selected = useMemo(
    () => options.filter((option) => value.includes(option.value)),
    [options, value]
  )

  return (
    <Combobox
      multiple
      autoHighlight
      items={options}
      value={selected}
      onValueChange={(next: RoleOption[] | null) =>
        onChange((next ?? []).map((option) => option.value))
      }
      isItemEqualToValue={(a: RoleOption, b: RoleOption) => a.value === b.value}
      itemToStringLabel={(option: RoleOption) => option.label}
      disabled={disabled}
    >
      <ComboboxChips ref={anchor}>
        <ComboboxValue>
          {(values: RoleOption[]) => (
            <>
              {values.map((option) => (
                <ComboboxChip key={option.value}>{option.label}</ComboboxChip>
              ))}
              <ComboboxChipsInput id={id} placeholder={placeholder} />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(option: RoleOption) => (
            <ComboboxItem key={option.value} value={option}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
