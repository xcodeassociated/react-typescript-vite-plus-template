import "@testing-library/jest-dom/vitest"
import { vi } from "vite-plus/test"

// jsdom does not implement matchMedia — ThemeProvider and Base UI need it
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// jsdom does not implement EventSource — stub a no-op transport for the SSE hook
class EventSourceStub {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2

  url: string
  readyState = 1
  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null

  constructor(url: string) {
    this.url = url
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {}
  dispatchEvent(): boolean {
    return true
  }
}

vi.stubGlobal("EventSource", EventSourceStub)
