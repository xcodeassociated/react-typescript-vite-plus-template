import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import type { SseConnectionStatus, SseMessage } from "@/hooks/useSseUsers"

export interface SseStatusBarProps {
  connectionStatus: SseConnectionStatus
  lastMessage: SseMessage | null
  onReconnect: () => void
}

export function SseStatusBar({
  connectionStatus,
  lastMessage,
  onReconnect,
}: SseStatusBarProps) {
  const { t } = useTranslation("main")

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <Badge
        variant={connectionStatus === "connected" ? "default" : "secondary"}
      >
        {t(`sse.${connectionStatus}`)}
      </Badge>
      {lastMessage && (
        <span>{`${t("sse.last_update")}: ${lastMessage.content}`}</span>
      )}
      {connectionStatus === "disconnected" && (
        <button type="button" className="underline" onClick={onReconnect}>
          {t("sse.reconnect")}
        </button>
      )}
    </div>
  )
}
