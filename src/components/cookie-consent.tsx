import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CookieIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"

export interface CookieConsentProps {
  demo?: boolean
  onAcceptCallback?: () => void
  onDeclineCallback?: () => void
}

function hasStoredConsent(): boolean {
  return document.cookie.includes("cookieConsent=true")
}

export function CookieConsent({
  demo,
  onAcceptCallback,
  onDeclineCallback,
}: CookieConsentProps) {
  const [isOpen, setIsOpen] = useState(() => !(hasStoredConsent() && !demo))
  const [hide, setHide] = useState(() => hasStoredConsent() && !demo)
  const { t } = useTranslation("main")

  const dismiss = (callback?: () => void) => {
    setIsOpen(false)
    setTimeout(() => setHide(true), 700)
    callback?.()
  }

  const accept = () => {
    document.cookie =
      "cookieConsent=true; expires=Fri, 31 Dec 9999 23:59:59 GMT; path=/"
    dismiss(onAcceptCallback)
  }

  const decline = () => {
    dismiss(onDeclineCallback)
  }

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 transition-transform duration-700 sm:right-auto sm:bottom-4 sm:left-4 sm:max-w-md",
        isOpen ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
        hide && "hidden"
      )}
    >
      <div className="m-2 rounded-xl border bg-card text-card-foreground shadow-lg">
        <div className="grid gap-2">
          <div className="flex h-14 items-center justify-between border-b px-4">
            <h2 className="text-base font-medium">
              {t("cookie_consent.title")}
            </h2>
            <CookieIcon />
          </div>
          <div className="px-4 py-3">
            <p className="text-sm">{t("cookie_consent.content")}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              {t("cookie_consent.accept_pt1")}{" "}
              <span className="font-medium">
                "{t("cookie_consent.accept")}"
              </span>{" "}
              {t("cookie_consent.accept_pt2")}
            </p>
            <a href="#" className="text-xs underline">
              {t("cookie_consent.learn_more")}
            </a>
          </div>
          <div className="flex gap-2 border-t px-4 py-4">
            <Button onClick={accept} className="flex-1">
              {t("cookie_consent.accept")}
            </Button>
            <Button onClick={decline} className="flex-1" variant="secondary">
              {t("cookie_consent.decline")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CookieConsent
