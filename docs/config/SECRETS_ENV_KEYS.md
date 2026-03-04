# `.env` Current Policy

Last updated: 2026-03-04

## Purpose

`.env` is intentionally minimal and contains only:
- secrets
- deployment-specific overrides

All other defaults come from `src/core/config/manifest.js`.

## Secret keys (active policy)

- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `ANTHROPIC_API_KEY`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`
- `JWT_SECRET`
- `BING_SEARCH_KEY`
- `GOOGLE_CSE_KEY`
- `ELO_SUPABASE_ANON_KEY`

## Allowed non-secret overrides

- `NODE_ENV`
- `PORT`
- `API_BASE_URL`
- `CORS_ORIGIN`
- `OUTPUT_MODE`

## Prohibited in `.env` by default

- Full runtime defaults catalog.
- User/domain mutable settings.
- Duplicated values that already exist in manifest without env-specific need.
