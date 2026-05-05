# Luna 💊

Een vriendelijke Progressive Web App voor Luna om haar medicatie en supplementen bij te houden — met fotobewijs, een gezellig dashboard en (zo nodig) een liefdevolle reminder mail.

## Features

- **Dashboard** met de medicatie van vandaag, ingedeeld per ochtend / middag / avond
- **Foto bewijs** per inname via de camera (mobiel) of file upload
- **Status per medicijn**: niet genomen (grijs), genomen (groen ✓), gemist (rood) zodra het tijdslot >30 min voorbij is
- **Geluidje + animatie** bij iedere succesvolle inname (Web Audio API)
- **Weekoverzicht** met klikbare dagen — toont de foto's van die dag
- **Reminder mails** met drie tiers: vriendelijk → serieus → dringend
- **PWA**: installeerbaar op het iPhone homescreen, met basic offline-fallback via service worker
- **Lokale SQLite** opslag (geen externe service nodig)

## Tech stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (lichtblauw kleurenschema)
- `better-sqlite3` voor lokale data
- `nodemailer` met Gmail SMTP voor reminder mails

## Installatie

```bash
npm install
cp .env.example .env
# vul .env in (zie hieronder)
npm run dev
```

App draait op http://localhost:3000.

> **Node**: getest met Node 18+. `better-sqlite3` heeft prebuilt binaries voor de meeste platforms; mocht installeren mislukken, dan zijn Python 3 en build tools (`xcode-select --install` op macOS) nodig.

## .env configureren

```env
GMAIL_USER=jouw-email@gmail.com
GMAIL_PASSWORD=app-password-16-tekens
LUNA_EMAIL=luna@example.com
REMINDER_CRON_SECRET=    # optioneel
```

Het `GMAIL_PASSWORD` is **niet** je gewone wachtwoord, maar een App Password — aanmaken via <https://myaccount.google.com/apppasswords> (2FA moet aan staan).

## Medicatie aanpassen

Pas `lib/medications.ts` aan. Elke entry heeft:

```ts
{
  id: 'levothyroxine',
  name: 'Levothyroxine',
  slot: 'ochtend',         // 'ochtend' | 'middag' | 'avond'
  time: '07:30',
  notes: 'Op een lege maag',
  type: 'medicatie',       // 'medicatie' | 'supplement'
  required: true,
}
```

`required: true` betekent: telt mee voor de "alles genomen" status én reminder mails.

## Reminder mail tiers

Endpoint: `POST /api/send-reminders` (ook `GET` werkt).

- **gentle** (vriendelijk) — vandaag een tijdslot >30 min overschreden
- **serious** — gisteren ook al een verplicht medicijn gemist (2 dagen op rij)
- **urgent** — drie of meer dagen op rij gemist

### Lokaal triggeren

```bash
curl -X POST http://localhost:3000/api/send-reminders
```

### Geautomatiseerd

Configureer een externe cron (Vercel Cron, GitHub Actions, een eigen server, …) die het endpoint elke ~30 min hit. Als `REMINDER_CRON_SECRET` is ingevuld, stuur dan ook `Authorization: Bearer <secret>`.

Voorbeeld GitHub Action:

```yaml
on:
  schedule:
    - cron: '*/30 * * * *'
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST "$URL" \
            -H "Authorization: Bearer $SECRET"
        env:
          URL: ${{ secrets.LUNA_REMINDER_URL }}
          SECRET: ${{ secrets.LUNA_REMINDER_SECRET }}
```

## Op iPhone homescreen installeren

1. Open de app in Safari op je iPhone
2. Tik op het deel-icoon
3. Kies **"Zet op beginscherm"**

De PWA opent voortaan fullscreen met het Luna-icoon.

> Het meegeleverde icoon is een eenvoudige gekleurde placeholder. Vervang `public/icon-192.png`, `public/icon-512.png` en `public/apple-touch-icon.png` voor een mooier resultaat.

## Datastructuur

- SQLite database: `data/luna.db` (auto aangemaakt)
- Foto's: `uploads/` (auto aangemaakt)

Beide directories staan in `.gitignore`.

### Schema

```sql
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,         -- "2026-05-06"
  time_taken TEXT,            -- "08:23"
  medication_id TEXT NOT NULL,
  taken INTEGER DEFAULT 0,
  photo_path TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

## Project structuur

```
luna-meds/
├─ app/
│  ├─ layout.tsx
│  ├─ page.tsx                    # dashboard
│  ├─ globals.css
│  ├─ components/
│  │  └─ MedicationCard.tsx
│  ├─ history/
│  │  ├─ page.tsx                 # weekoverzicht
│  │  └─ [date]/page.tsx          # detail per dag
│  └─ api/
│     ├─ log/route.ts             # POST inname
│     ├─ photo/[filename]/route.ts
│     └─ send-reminders/route.ts
├─ lib/
│  ├─ medications.ts              # config: pas hier de medicatie aan
│  ├─ db.ts                       # SQLite setup + queries
│  ├─ email.ts                    # Gmail SMTP + tier templates
│  ├─ status.ts                   # status berekening
│  └─ types.ts
├─ public/
│  ├─ manifest.json
│  ├─ sw.js                       # service worker
│  └─ icon*.png/.svg
├─ data/                          # auto, .gitignored
├─ uploads/                       # auto, .gitignored
└─ .env.example
```

## Deployment

Voor Vercel/eigen server:

- `npm run build && npm run start`
- Bij Vercel werkt `better-sqlite3` op de Node runtime (niet edge). De DB staat in een lokale file — op Vercel is filesystem **niet persistent**. Voor productie wil je een persistente disk (Vercel Postgres / Fly.io volume / VPS) of de DB driver vervangen.

Voor persoonlijk gebruik (raspberry pi, Fly.io, eigen server) werkt dit prima.
