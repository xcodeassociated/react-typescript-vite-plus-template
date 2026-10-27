import { useEffect, useMemo } from "react"
import { useForm, Controller, type SubmitHandler } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RolesCombobox } from "@/components/custom/roles-combobox"
import type { Role, UserInput } from "@/pages/users/api/usersApi.types"

const userFormSchema = z.object({
  _id: z.string().optional(),
  name: z.string().min(2),
  email: z.string().min(2),
  role: z.array(z.string()).min(1),
  version: z.number().optional(),
})

type UserFormValues = z.infer<typeof userFormSchema>

export interface UserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data?: UserInput | undefined
  roles: Role[]
  onSubmit: (data: UserInput) => void
}

export function UserDialog({
  open,
  onOpenChange,
  data,
  roles,
  onSubmit,
}: UserDialogProps) {
  const { t } = useTranslation("main")

  const schema = useMemo(
    () =>
      z.object({
        _id: z.string().optional(),
        name: z.string().min(2, t("users.name_validation")),
        email: z.string().min(2, t("users.email_validation")),
        role: z.array(z.string()).min(1, t("users.role_validation")),
        version: z.number().optional(),
      }),
    [t]
  )

  const form = useForm<UserFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      _id: undefined,
      name: "",
      email: "",
      role: [],
      version: undefined,
    },
  })

  useEffect(() => {
    if (!open) {
      return
    }
    form.reset(
      data
        ? {
            _id: data._id,
            name: data.name,
            email: data.email,
            role: data.role.map((role) => role._id ?? ""),
            version: data.version,
          }
        : { _id: undefined, name: "", email: "", role: [], version: undefined }
    )
  }, [open, data, form])

  const isEdit = data?._id !== undefined

  const handleSubmit: SubmitHandler<UserFormValues> = (values) => {
    const payload: UserInput = {
      _id: values._id,
      name: values.name,
      email: values.email,
      version: values.version,
      role: values.role
        .map((id) => roles.find((role) => role._id === id))
        .filter((role): role is Role => role !== undefined),
    }
    onSubmit(payload)
    toast.success(t(isEdit ? "users.update" : "users.submit"))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t(isEdit ? "users.update" : "users.add")}</DialogTitle>
          <DialogDescription>{t("users.f1")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <FieldGroup>
            <Field data-invalid={form.formState.errors.name !== undefined}>
              <FieldLabel htmlFor="user-name">{t("users.name")}</FieldLabel>
              <Input
                id="user-name"
                placeholder={t("users.name_placeholder")}
                {...form.register("name")}
              />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>
            <Field data-invalid={form.formState.errors.email !== undefined}>
              <FieldLabel htmlFor="user-email">{t("users.email")}</FieldLabel>
              <Input
                id="user-email"
                placeholder={t("users.email_placeholder")}
                {...form.register("email")}
              />
              <FieldError errors={[form.formState.errors.email]} />
            </Field>
            <Field data-invalid={form.formState.errors.role !== undefined}>
              <FieldLabel htmlFor="user-role">{t("users.role")}</FieldLabel>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <RolesCombobox
                    id="user-role"
                    roles={roles}
                    placeholder={t("users.role_placeholder")}
                    emptyText={t("users.role_not_found")}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <FieldError errors={[form.formState.errors.role]} />
            </Field>
            <DialogFooter className="mt-4">
              <Button type="submit">{t("users.submit")}</Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}
