# Mappo CI and Repository Hygiene

The consolidated validation workflow is `.github/workflows/ci.yml`. It runs on new pushes to `main`, feature/chore/fix/refactor/release branches, pull requests, or manual dispatch. PRs and long-lived branches use the same build, Node regression and two-browser matrix. Superseded runs for the same workflow/ref/PR are canceled.

## Checks

1. Resolve `APP_VERSION` dynamically and run `npm run check` (build + Node tests).
2. Verify `index.html` and `dist/mappo-<APP_VERSION>.html` both exist as tracked files, compare byte-for-byte, and fail on generated changes.
3. Install **test-only** Playwright 1.56.1, Chromium and Firefox; execute both existing browser suites at desktop, ultrawide, tablet and phone sizes (16 checks total).
4. Upload browser screenshots/failure evidence on successful or failed jobs where generated; upload the matching standalone HTML files when the version is known. Retention: **14 days**.

## Local commands

```sh
npm run build
npm test
npm run test:node
npm run check
npm run test:browser  # requires installed test-only Playwright and browsers
npm run test:full     # check + browser QA
```

Browser QA requires `npm install --no-save --no-package-lock playwright@1.56.1` and `npx playwright install chromium firefox` for a local test machine. The shipped app has no new dependencies. `npm test`, `npm run build`, and `npm run check` have unchanged behavior.

## Permissions and deployment

CI uses `contents: read`; it never commits, pushes, tags, or deploys. The existing `.github/workflows/pages.yml` remains separate and untouched. Under current Pages configuration, changes to generated `index.html` or `dist/**` on `main` trigger publishing.

The old milestone-specific workflows will be retired **after the new unified workflow passes**. Avoid reintroducing fixed-version paths or automated commit/push steps into CI.

## Local files

`.gitignore` excludes temporary test screenshots, caches, logs, local editors and coverage. It does **not** exclude `dist/`, `index.html`, `tests/fixtures/`, or `docs/images/`.
