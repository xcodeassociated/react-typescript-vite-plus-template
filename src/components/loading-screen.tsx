import { memo } from "react"

import { Spinner } from "@/components/spinner"

export function LoadingScreen() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background">
      <Spinner size="large" />
    </div>
  )
}

export const LoadingScreenMemo = memo(LoadingScreen)
