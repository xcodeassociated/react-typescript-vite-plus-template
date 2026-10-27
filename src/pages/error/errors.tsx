import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"

export function NotFound() {
  const { t } = useTranslation("main")
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-4xl font-bold">{t("error.not_found")}</h1>
      <Button variant="outline" onClick={() => navigate("/")}>
        {t("menu.home")}
      </Button>
    </div>
  )
}

export function Unauthorized() {
  const { t } = useTranslation("main")
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-4xl font-bold">{t("error.unauthorized")}</h1>
      <Button variant="outline" onClick={() => navigate("/")}>
        {t("menu.home")}
      </Button>
    </div>
  )
}
