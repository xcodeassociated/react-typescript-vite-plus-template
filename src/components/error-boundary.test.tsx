import { type ReactElement } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"

import "@/locales/i18n"
import { ErrorBoundary } from "@/components/error-boundary"

// Flipped only from the test body (never during render) so a render-time
// throw can be armed and then cleared before pressing "Try again".
let shouldFail = false

function FlakyChild(): ReactElement {
  if (shouldFail) {
    throw new Error("boom while rendering")
  }
  return <p>child ok</p>
}

beforeEach(() => {
  shouldFail = false
  // React logs caught errors to console.error; silence the expected noise.
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <FlakyChild />
      </ErrorBoundary>
    )

    expect(screen.getByText("child ok")).toBeInTheDocument()
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument()
  })

  it("shows the fallback when a child throws during render", () => {
    shouldFail = true

    render(
      <ErrorBoundary>
        <FlakyChild />
      </ErrorBoundary>
    )

    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
    expect(screen.getByText("boom while rendering")).toBeInTheDocument()
  })

  it("recovers when Try again re-renders a healthy tree", async () => {
    shouldFail = true
    render(
      <ErrorBoundary>
        <FlakyChild />
      </ErrorBoundary>
    )
    expect(screen.getByText("Something went wrong")).toBeInTheDocument()

    shouldFail = false
    await userEvent.click(screen.getByRole("button", { name: "Try again" }))

    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument()
    expect(screen.getByText("child ok")).toBeInTheDocument()
  })
})
