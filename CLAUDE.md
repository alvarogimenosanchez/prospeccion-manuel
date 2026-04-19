# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CRM de prospección comercial para Manuel, asesor de seguros y finanzas. Gestión de leads, agentes IA de prospección automática, mensajes WhatsApp generados por Claude, y agenda de citas.

**Deployments:**
- Frontend: Vercel (`prospeccion-manuel.vercel.app`)
- Backend: Railway (`prospeccion-manuel-production.up.railway.app`)
- DB: Supabase (PostgreSQL + RLS)

---

## Commands

### Frontend (Next.js 16 / React 19 / Tailwind 4)
```bash
cd frontend
npm run dev        # dev server on :3000
npm run build      # production build
npm run lint       # eslint
```

### Backend (FastAPI / Python)
```bash
cd backend
uvicorn main:app --reload --port 8000
```
No test suite currently. Manual testing via `/docs` (FastAPI auto-docs).

### Backend dependencies
```bash
pip install -r backend/requirements.txt
```

---

## Architecture

### Data flow
```
Next.js (Vercel)
  ↓ /api/* rewrites (next.config.ts)
FastAPI (Railway)
  ↓ supabase-py (service role)
Supabase PostgreSQL
  ↑ @supabase/ssr (anon key + RLS)
Next.js frontend (direct queries)
```

The frontend queries Supabase **directly** via `@supabase/ssr` for most reads/writes. The FastAPI backend is only used for AI agents, WhatsApp webhooks, and heavy background operations.

### Frontend structure (`frontend/`)
- `app/` — Next.js App Router. All authenticated routes are in `app/`, public routes under `app/(public)/`
- `components/` — Shared UI: `AppShell`, `Sidebar`, `Navbar`, badges, `StatsCard`, `FiltrosBar`
- `lib/supabase.ts` — Browser client + all TypeScript types (`Lead`, `Interaction`, `Appointment`, `Comercial`, `Cliente`, `Team`)
- `lib/supabase-server.ts` — Server component client
- `lib/supabase-browser.ts` — Alternative browser client
- `brand/` — Design tokens from NN España brand book (colors, typography)
- `middleware.ts` — Auth guard: verifies Supabase session + checks `comerciales` table for `activo: true`

### Backend structure (`backend/`)
- `main.py` → mounts `api/webhook_whatsapp.py` as the FastAPI app
- `api/webhook_whatsapp.py` — All HTTP routes + WhatsApp webhook (Wassenger HMAC verification)
- `agents/`
  - `agent1_scraper.py` — Google Places API scraping by zone+category → inserts leads
  - `agent2_seguimiento.py` — Automated follow-up reminders for cold/stale leads
  - `agent3_mensajes.py` — Claude (`anthropic` SDK) generates personalized WhatsApp messages
  - `agent3_plantillas.py` — Static product-specific WhatsApp templates
  - `agent4_linkedin.py` — LinkedIn enrichment (name/role lookup)
  - `agent5_chatbot.py` — Incoming WhatsApp auto-response bot
  - `agent6_scoring.py` — Lead scoring: updates `temperatura`, `nivel_interes`, `prioridad`

### Database (Supabase)
Schema in `database/schema.sql`. Key tables:
- `leads` — central table, pipeline states: `nuevo → enriquecido → segmentado → mensaje_generado → mensaje_enviado → respondio → cita_agendada → en_negociacion → cerrado_ganado/perdido/descartado`
- `interactions` — WhatsApp/call history per lead
- `lead_state_history` — every state change (used for timeline in `/leads/[id]`)
- `appointments` — citas with full lifecycle states
- `comerciales` — users (roles: `director`, `comercial`), checked by middleware
- `mensajes_ia` — AI-generated messages pending review
- `teams`, `team_members` — sales team groupings
- `clientes` — converted leads with contract data

**Important:** `temperatura` is stored in DB but also derived from `estado` in some places — keep them in sync when updating state. Supabase `.in()` only accepts arrays, not subquery builders.

### Auth
- Google OAuth via Supabase Auth
- `middleware.ts` protects all routes except `/login`, `/captacion`, `/landing`, `/auth/callback`
- After OAuth, middleware checks `comerciales` table — users not in this table are rejected and signed out
- Frontend uses **anon key** (respects RLS); backend uses **service role key** (bypasses RLS)

### AI / Claude integration
- `backend/agents/agent3_mensajes.py` uses `anthropic` SDK to generate WhatsApp messages
- Messages stored in `mensajes_ia` table with status `pendiente` → commercial reviews in `/mensajes`
- `ANTHROPIC_API_KEY` required in backend `.env`
- No prompt caching implemented yet (optimization opportunity)

### API routing (next.config.ts)
All `/api/*` calls from frontend are proxied to Railway:
- `/api/scraping/*` → `/scraping/*`
- `/api/seguimiento/*` → `/seguimiento/*`
- `/api/linkedin/*` → `/linkedin/*`
- `/api/backend/*` → `/*` (catch-all)

### Environment variables
**Frontend (Vercel):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Backend (Railway):**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `WASSENGER_API_KEY` + `WASSENGER_DEVICE_ID` + `WASSENGER_WEBHOOK_SECRET`
- `GOOGLE_PLACES_API_KEY`
- `ALLOWED_ORIGINS` (comma-separated, defaults to `*`)

### Design system
- Font: `Lato` (Google Fonts fallback for NNNittiGrotesk)
- Brand tokens in `frontend/brand/` — NN España colors + border radius rules
- Background: `#f1edeb` (warm off-white), sidebar: white `#ffffff`
- Tailwind 4 with PostCSS — no `tailwind.config.js`, config via CSS `@theme`
