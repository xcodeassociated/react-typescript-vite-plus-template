import { Component, type ErrorInfo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface ErrorFallbackProps {
  error: Error
  onReset: () => void
}

export function ErrorFallback({ error, onReset }: ErrorFallbackProps) {
  const { t } = useTranslation("main")

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>{t("error.something_wrong")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm break-words text-muted-foreground">
          {error.message}
        </p>
      </CardContent>
      <CardFooter>
        <Button onClick={onReset}>{t("error.try_again")}</Button>
      </CardFooter>
    </Card>
  )
}

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Route-level boundary: a render error inside the page tree degrades to a
 * recoverable card instead of unmounting the whole app (blank page).
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, info.componentStack)
  }

  private readonly reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onReset={this.reset} />
    }
    return this.props.children
  }
}
