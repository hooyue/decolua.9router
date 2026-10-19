# Repository Guidelines

## Project Structure & Module Organization

9Router is a Next.js/React dashboard and AI routing gateway.

- `src/app/`: dashboard pages and API route handlers; `src/shared/`: reusable components, hooks, and constants.
- `src/lib/`: persistence, authentication, and integrations; `src/sse/`: application-side routing glue.
- `open-sse/`: provider executors, request/response translation, streaming, and routing services. Read `open-sse/AGENTS.md` before editing it.
- `tests/`: independent Vitest package, with `unit/`, `auth/`, and `translator/` suites. Translator work also follows `tests/translator/AGENTS.md`.
- `public/` and `images/`: assets; `src/i18n/`: application localization; `gitbook/`: documentation site; `cli/`: separately packaged launcher.

## Build, Test, and Development Commands

Run from the repository root unless stated otherwise:

- `npm install`: install application dependencies.
- `npm run dev`: start Next.js development on port `20127`; `npm run dev:webpack` selects webpack.
- `npm run build`: create the standalone production build and copy runtime assets through `postbuild`.
- `npm run start`: start `custom-server.js` on port `20127`.
- `npx eslint .`: run ESLint with Next.js Core Web Vitals rules; no root lint script exists.
- `npm --prefix tests install`: install test dependencies.
- `npm --prefix tests test`: run Vitest; append `-- unit/provider-validation.test.js` to target one file.
- `npm --prefix tests run test:watch`: watch tests during development.

## Coding Style & Naming Conventions

Use JavaScript/ESM and follow nearby code: two-space indentation, double quotes, and semicolons. Name React components in PascalCase, hooks as `useSomething`, and functions/variables in camelCase. Preserve Next.js filenames such as `page.js` and `route.js`. Use `@/` for `src/` imports and `open-sse/` for engine imports. Reuse provider configuration and translator schema constants instead of duplicating literals.

## Testing Guidelines

Name tests `*.test.js` and add focused regression cases for behavior changes. Vitest uses a Node environment; no numerical coverage threshold is configured. Review snapshot changes. Translator tests must load `registerAll.js`. Live provider tests require explicit opt-in (`RUN_REAL=1`) and credentials. Report existing failures separately from regressions.

## Commit & Pull Request Guidelines

Follow the observed Conventional Commit style: `feat(provider): ...`, `fix(claude): ...`, or `chore: ...`. Keep commits focused. PRs should explain the problem, resulting behavior, linked issues, and validation performed; include screenshots for dashboard changes.

## Security & Configuration

Copy `.env.example` to `.env`, replace placeholder secrets, and choose a writable `DATA_DIR`. Align base URLs with the actual listening port. Never commit credentials, local databases, or request logs.
