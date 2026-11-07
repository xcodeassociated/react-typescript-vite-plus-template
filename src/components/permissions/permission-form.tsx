import { useMemo } from "react"
import { type SubmitHandler, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export interface PermissionFormValues {
  name: string
  description: string
}

export interface PermissionFormProps {
  initialName?: string
  initialDescription?: string
  onSubmit: (values: PermissionFormValues) => void
  onCancel: () => void
}

// Shared by the widget's create and inline-edit modes; mounted fresh per
// mode, so defaultValues are enough — no reset effect needed.
export function PermissionForm({
  initialName = "",
  initialDescription = "",
  onSubmit,
  onCancel,
}: PermissionFormProps) {
  const { t } = useTranslation("main")

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().min(2, t("permissions.name_validation")),
        description: z.string(),
      }),
    [t]
  )

  const form = useForm<PermissionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: initialName, description: initialDescription },
  })

  const handleSubmit: SubmitHandler<PermissionFormValues> = (values) => {
    onSubmit(values)
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit(handleSubmit)}
    >
      <FieldGroup>
        <Field data-invalid={form.formState.errors.name !== undefined}>
          <FieldLabel htmlFor="permission-name">
            {t("permissions.name")}
          </FieldLabel>
          <Input
            id="permission-name"
            placeholder={t("permissions.name_placeholder")}
            {...form.register("name")}
          />
          <FieldError errors={[form.formState.errors.name]} />
        </Field>
        <Field data-invalid={form.formState.errors.description !== undefined}>
          <FieldLabel htmlFor="permission-description">
            {t("permissions.description")}
          </FieldLabel>
          <Textarea
            id="permission-description"
            placeholder={t("permissions.description_placeholder")}
            {...form.register("description")}
          />
          <FieldError errors={[form.formState.errors.description]} />
        </Field>
      </FieldGroup>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("permissions.cancel")}
        </Button>
        <Button type="submit">{t("permissions.submit")}</Button>
      </div>
    </form>
  )
}
