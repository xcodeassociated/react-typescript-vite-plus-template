# AGENTS.md – Vite+ / shadcn Base UI React template

Guidelines for automated agents working in this repository. Shared rules: `bun` only, never commit/push without explicit permission, keep `README.md` and this file current.

## Project Overview

- Frontend service template on the modern toolchain: **Vite+ 1.4** unified toolchain (`vp dev/build/test/lint/fmt/check`), **shadcn/ui base-nova** style on **Base UI** (`@base-ui/react`), **Tailwind v4 CSS-first**, React 19, TS strict.
- Everything (dev server, Rolldown build, Vitest 5, Oxlint, Oxfmt, Vitest `test` block) is configured in **`vite.config.ts`** — there is no ESLint, Prettier, `.oxlintrc`, or `tailwind.config.js`.
- Package manager: `bun` only. Dev server: `http://localhost:3000` — Keycloak redirects to :3000, so no other instance may hold the port.

## Commands

| Command                     | Notes                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `bun run dev`               | `vp dev`                                                                                    |
| `bun run build`             | `tsc -b && vp build` (typecheck IS included)                                                |
| `bun run check`             | format + lint + typecheck in one pass — run before committing                               |
| `bun run test` / `coverage` | Vitest 5 via `vp test`; single file: `bun run test -- src/App.test.tsx`                     |
| `bun run generate:graphql`  | REQUIRED before build/test on fresh clone; regenerates git-ignored `src/graphql/generated/` |

## Key Conventions

- **Structure**: feature-first — pages own their `api/`, `components/`, `hooks/` and colocated tests; components live in the feature that uses them and only graduate to `src/components/` when a second consumer appears (colocate-until-reuse). React context providers live in `src/providers/` (never `src/components/`); `src/components/` holds only shared renderable chrome beside generated `ui/`. Route trees are wrapped in `src/components/error-boundary.tsx` so a render error degrades to a recoverable card instead of a blank page.
- **Generated files**: `src/components/ui/**` (shadcn registry) and `src/graphql/generated/**` — never hand-edit; add components with `bunx --bun shadcn@latest add <name>` (Base UI style; `form` is a stub here — use `field` + react-hook-form + `zod`; multi-select uses the native `combobox` chips, not cmdk).
- **Base UI API**: components use the `render` prop instead of Radix `asChild`; `DropdownMenuLabel` must sit inside `DropdownMenuGroup`; `Combobox` multi-select uses `ComboboxChips`/`ComboboxValue` children-fn + `useComboboxAnchor`.
- **Design-system lint** (`@shadcn/lint` in the `lint` block): rules apply to all app code; only `src/components/ui/**` is exempt via `lint.overrides`. Restyling ui components (color/typography/spacing/shape) is an error — wrap ui components in your own components (`src/components/*.tsx` for shared, `src/pages/<feature>/components/` for feature-local) and put spacing on plain wrapper divs; only `layout` classes are allowed on ui components.
- **Auth**: own `KeycloakProvider` (`src/providers/keycloak.tsx`) over `keycloak-js` — no `@react-keycloak/web`. Event-driven like `@react-keycloak/core`'s `createAuthProvider`: `onReady/onAuthSuccess/onAuthError/onAuthRefreshSuccess/onAuthRefreshError/onAuthLogout/onTokenExpired` are attached before a module-guarded single `init()` (keycloak-js throws on second init; StrictMode-safe). Auth state is derived from `authenticated && token && idToken`, never a cached boolean. A refresh error alone does NOT log the user out (transient network); only `onAuthLogout` (fired by `clearToken()` after a 400 from the token endpoint) flips to logged-out. `getAccessToken()` proactively `updateToken(60)`s before every RTK Query/Apollo request so idle-then-request never sends an expired token. The 15s init watchdog renders logged-out if the silent-SSO iframe never settles.
- **State**: Redux Toolkit store with persisted `counter` slice + `usersApi` (RTK Query, `/coroutine` REST, optimistic patches, `prepareHeaders` bearer). Roles come from GraphQL via Apollo 4 typed documents (`graphql` tag from `@/graphql/generated`).
- **Users page state lives in the URL** (`page/size/sort/desc` search params) — no effect loops; SSE (`useSimpleSSE`) triggers `usersApi` refetch.
- **Responsive**: wide content (the users table) must scroll inside the ui Table's own `overflow-x-auto` wrapper, never stretch the page. The ancestor chain has to be shrinkable: `grid-cols-1` (minmax(0,1fr)) on page grids and `min-w-0 w-full` on flex-col ancestors (see `App.tsx`, `Users.tsx`, `data-table.tsx`). Verified 0 horizontal overflow at 375/390/768/1024/1280; body scrolls vertically when content exceeds the viewport; header is sticky.
- **Formatting**: Oxfmt (double quotes, 80 cols). `vp fmt` may reformat `graphql` template literals — always run `bun run generate:graphql` after `vp check --fix`, then typecheck.
- **Tests**: Vitest + RTL + MSW v3 (`server.listen()` — no `onUnhandledRequest`); jsdom lacks `matchMedia`/`EventSource` (stubbed in `src/setupTests.ts`). Apollo `MockedProvider` from `@apollo/client/testing/react`; import DocumentNodes from `@/graphql/generated/graphql` (index only exports the `graphql` tag).

## Gotchas

- redux-persist's `lib/storage` default import arrives as a module namespace under Rolldown; `store.ts` unwraps it — keep that guard.
- Oxlint JS plugins (incl. `@shadcn/lint`) are an alpha API; if rules stop firing after a `vp` upgrade, re-check `vp check` output rather than assuming green.
- The only expected console noise is Keycloak's silent-SSO iframe sandbox warning.
- `KeycloakProvider` has a 15s init watchdog: if the silent-SSO iframe never posts back (origin not registered in the Keycloak client), the app renders logged-out instead of hanging on the loading screen.
- CI: `.github/workflows/ci.yml` (check+test+build on every push/PR) and `docker.yml` (multi-arch publish on `main`/`release/*` → `docker.io/<org>/<repo>:latest`); Dockerfile serves `dist/` via nginx with SPA fallback — verify `docker build .` after changing build wiring.
- `@shadcn/lint` scoping is verified empirically: restyle/arbitrary/static rules fire on app code and stay silent inside `src/components/ui/**`; `no-raw-colors`/`no-unknown-classes` remain active everywhere. Re-check with temporary probe files if the config changes.

## Local Login

Backend stack: `spring-reactive-mongo-template` dev-infra (Keycloak `http://localhost:8090`, API `http://localhost:8080`), started before `bun run dev`. Login: user menu → **Login**.

**Env**: committed `.env` holds local-dev defaults (`VITE_APP_DOMAIN`/`_KEYCLOAK_URL`/`_BACKEND_URL`); `.env.template` documents all variables, `.env.*` files (incl. `.env.production`) are git-ignored. Values are inlined at build time — rebuild after changing them, and keep `VITE_APP_DOMAIN` registered in the Keycloak client's redirect/web origins.

**Credentials**: the git-ignored `.credentials` file at the repository root holds the real local Keycloak login (realm `app`, client `frontend`, user `user` / `user@user.com`). `.credentials.template` documents the format — copy it to `.credentials` and fill in values on a fresh clone. If `.credentials` is missing, stop and ask the developer; never guess, create it with real values, or reset passwords unless explicitly asked. Never print the password (watch for trailing punctuation — it is part of the password).

Verified flows: login/logout redirect, silent-SSO restore, counter persistence, users CRUD + roles combobox + SSE badge, dark mode, pl/en switch, mobile sheet, 404/401 pages — all with zero console errors.

## Keeping This File Current

Update this guide in the same change whenever commands, tooling wiring, provider/auth patterns, lint config, or the dev-infra topology change; verify any documented command by running it.
