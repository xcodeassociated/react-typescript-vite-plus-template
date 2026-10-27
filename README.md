# new_app — React Template (Vite+ / shadcn Base UI rebuild)

A ground-up rebuild of the root template using the modern toolchain:

- **[Vite+](https://viteplus.dev)** 1.4 (`vp`) — one binary for dev, build (Vite 8 + Rolldown), test (Vitest 5), lint (Oxlint) and format (Oxfmt); all configured in `vite.config.ts`
- **shadcn/ui** `base-nova` style on **[Base UI](https://base-ui.com)** (`@base-ui/react` 1.9), scaffolded with `bunx --bun shadcn@latest init --preset b0 --template vite --base base`
- **Tailwind CSS v4** (CSS-first, theme tokens in `src/index.css`, no `tailwind.config.js`)
- **React 19** + TypeScript strict, **Redux Toolkit** 2.13 (+ `redux-persist`), **RTK Query**, **Apollo Client** 4 (GraphQL), **Keycloak** 26 via a small own provider, **react-router** 7, **i18next** 26, **react-hook-form** + **zod** 4, **TanStack Table** v9, **MSW** 3
- **[shadcn-ui/lint](https://github.com/shadcn-ui/lint)** (`@shadcn/lint`) design-system rules running inside Oxlint — see `vite.config.ts` `lint.rules`

## Commands (bun only)

| Command                           | Description                                                           |
| --------------------------------- | --------------------------------------------------------------------- |
| `bun run dev`                     | Vite+ dev server on `http://localhost:3000`                           |
| `bun run build`                   | `tsc -b` + production build (`vp build`)                              |
| `bun run preview`                 | Serve the production build                                            |
| `bun run test`                    | Vitest once (`vp test`)                                               |
| `bun run coverage`                | Vitest with V8 coverage                                               |
| `bun run check`                   | `vp check` — format + lint + typecheck in one pass                    |
| `bun run lint` / `bun run format` | Oxlint / Oxfmt individually                                           |
| `bun run typecheck`               | `tsc --noEmit`                                                        |
| `bun run generate:graphql`        | Regenerate `src/graphql/generated/` from `src/graphql/schema.graphql` |

Run a single test: `bun run test -- src/App.test.tsx` (or `-t "name"`).

## Local login

Same topology as the root template: start the backend stack first (`spring-reactive-mongo-template` dev-infra), then `bun run dev`.

| Dependency                                                          | URL                     |
| ------------------------------------------------------------------- | ----------------------- |
| Keycloak (realm `app`, client `frontend`)                           | `http://localhost:8090` |
| Backend REST `/coroutine/*`, GraphQL `/graphql`, SSE `/update/user` | `http://localhost:8080` |

Login via the user menu (top right). Credentials live in the git-ignored `.credentials` file at the repository root.

## Structure

```
src/
├── components/
│   ├── ui/               # generated shadcn (base-nova) — do not hand-edit
│   ├── app/              # nav, side menu, user dropdown, loading screen
│   ├── custom/           # data-table, roles-combobox, cookie-consent, mode-toggle, sse bar, spinner
│   ├── keycloak-provider.tsx  # own Keycloak context (keycloak-js)
│   └── theme-provider.tsx     # light/dark/system, localStorage
├── graphql/              # schema.graphql + generated/ (codegen client preset; git-ignored)
├── lib/                  # keycloak.ts, apollo.ts, utils (cn re-export)
├── locales/              # i18next init + en_US / pl_PL
├── pages/                # counter, users (RTK Query + GraphQL + SSE CRUD), home, error
└── store/                # store + persisted counter slice + RTK Query api
```

## Notes

- `bun run generate:graphql` must run before `build`/`test` after cloning (generated code is git-ignored).
- Formatting is Oxfmt (double quotes, 80 cols) — `vp check --fix` normalizes everything; re-run `generate:graphql` after formatting GraphQL document template literals.
- `src/components/ui/**` is excluded from the shadcn design-system lint rules (components own their appearance); app code under `src/components/app|custom` and `src/pages` is fully linted.
- `vp test` uses the `test` block in `vite.config.ts` (jsdom + globals + `src/setupTests.ts`).
