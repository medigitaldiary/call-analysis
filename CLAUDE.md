# CLAUDE.md — call-analysis

> Read this fully on every new session. This is the working contract for the repo.

---

## 1. Project context

**What:** An internal admin tool that turns RM (relationship manager) sales calls into structured coaching reports.
**Pipeline:** audio upload → Sarvam transcription → Claude analysis → docx/xlsx reports → daily Gmail digest.
**Live URL:** https://call-analysis.sustvest.in
**Stack:** Next.js 16 (App Router), React 19, Tailwind, shadcn/ui, Neon Postgres, Vercel Blob, Anthropic Claude, Sarvam AI, Resend + Gmail SMTP, Turborepo build.

---

## 2. Locked decisions (do not relitigate)

| Decision | Choice |
|---|---|
| Package manager | npm (we have package-lock.json) |
| Node version | 20 LTS |
| Framework | Next.js 16, App Router only |
| DB | Neon Postgres via @neondatabase/serverless |
| LLM | Claude (@anthropic-ai/sdk), default = latest Sonnet |
| Transcription | Sarvam for Indic; no fallback to Whisper |
| Storage | Vercel Blob for audio; no S3 |
| Email | Resend for transactional; Gmail SMTP only for internal daily reports |
| Deploy | Vercel, auto from main |

If a request breaks one of these, surface the tradeoff before implementing.

---

## 3. Branching & PR flow (never push straight to main)

1. New branch: git checkout -b <type>/<slug> (feat, fix, chore, refactor).
2. Commit in logical chunks with conventional-commit messages.
3. Push: git push -u origin <branch>.
4. Open a draft PR immediately — the preview URL is our staging.
5. Mark PR ready when it's done. Never self-merge unless the user asks.
6. main is protected — no direct pushes.

Commit format: <type>(<scope>): <summary>

---

## 4. Secret & env-var handling

- Never commit .env.local, .env.production, or anything matching .env* (except .env.local.example).
- Local dev: vercel env pull .env.local.
- New env var → add to (a) .env.local.example, (b) Vercel dashboard, (c) the table below.
- Never paste real secrets into commits, PRs, or chat.

### Env vars in use

| Name | Purpose | Envs |
|---|---|---|
| DATABASE_URL / NEON_DATABASE_URL | Neon primary | all |
| BLOB_READ_WRITE_TOKEN | Vercel Blob | all |
| ANTHROPIC_API_KEY | Claude | all |
| SARVAM_API_KEY | Sarvam STT | all |
| GOOGLE_API_KEY | Google/Sonar helpers | all |
| RESEND_API_KEY + RESEND_FROM_EMAIL + RESEND_TO_EMAIL | Transactional | all |
| GMAIL_USER + GMAIL_APP_PASSWORD | Daily digest SMTP | prod |
| DAILY_CALL_LIMIT | Per-RM rate limit | prod |
| DAY_REPORT_* | Digest recipient lists | prod |
| NEXT_PUBLIC_APP_URL | Self URL | all |

---

## 5. DB (Neon)

- Migrations: supabase/migrations/*.sql (legacy folder name, Neon in reality).
- New migration: 007_<slug>.sql, sequentially numbered.
- Never run destructive SQL without confirming with the user.
- Read-only exploration: psql "$NEON_DATABASE_URL" then \dt.

---

## 6. LLM (Claude, inside the app)

- Prompts live in lib/analyse.ts, lib/rm-analyse.ts, lib/day-analyse.ts.
- Default model: latest Sonnet.
- Every LLM call must be counted against token_usage.
- Prompt changes: include before/after diff in the PR description.

---

## 7. Definition of done

- [ ] npm run build passes.
- [ ] npx tsc --noEmit clean.
- [ ] Preview URL renders the changed screen with no console errors.
- [ ] For pipeline changes: one end-to-end run with a small audio file.
- [ ] New env vars added to Vercel + .env.local.example + this file.
- [ ] For DB changes: migration file present and applied on Neon.

---

## 8. Natural-language → task translation

| I say | You do |
|---|---|
| Ship it | Push the current branch, open draft PR, paste URL back. |
| Deploy to prod | Confirm CI green, merge to main, watch Vercel, confirm prod URL. |
| Add env var X | .env.local.example + Vercel + this file's table. |
| Test the pipeline | scripts/health-check.mjs pinging Neon, Blob, Anthropic, Sarvam, Resend. |
| Reports look wrong | Read lib/docx.ts + lib/xlsx.ts, ask which report + field, fix. |
| Change analysis rubric | Read lib/analyse.ts or lib/rm-analyse.ts, propose diff, wait for confirmation. |
| It's slow | Vercel function logs, DB query patterns, one fix at a time. |

---

## 9. Voice

- Specific over vague.
- Active verbs.
- No filler (leverage, synergy, in order to).
- Numbers when they exist.

End of file.
