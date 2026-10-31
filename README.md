# Video Timestamp Editor

A focused React application for creating text overlays against selected video time ranges. Users can upload a video, select a range on its audio waveform, add text, and manage saved timestamps through Supabase.

This project was developed as an interview exercise. Its intentionally narrow scope keeps the implementation centred on the areas being demonstrated: a responsive React UI, browser media APIs, reliable client-side state management, and a complete Supabase CRUD integration. It is designed around one video, rather than presenting a multi-video product that the assignment does not require.

## Features

- Upload and preview a local video in the browser
- Generate an audio waveform with the Web Audio API
- Select or reposition a time range on the waveform
- Display text while playback is inside the corresponding range
- Create, read, update, and delete saved text timestamps in Supabase
- Restore saved timestamps after a page refresh
- Show loading, saving, updating, deleting, and error states

## Stack

- React and TypeScript
- Vite
- Tailwind CSS
- Supabase JavaScript client
- Web Audio API

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and provide your Supabase project values:

   ```env
   VITE_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
   VITE_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
   ```

   A Supabase publishable key may be used instead of the anon key.

3. Start the development server:

   ```bash
   npm run dev
   ```

## Database setup

Run the following in the Supabase SQL Editor. PostgreSQL converts unquoted identifiers to lowercase, so the application uses the resulting `texttimestamp` table and lowercase column names.

```sql
create table texttimestamp (
  id bigint generated always as identity primary key,
  starttime int,
  endtime int,
  inputtext text,
  created_at timestamp with time zone default now()
);

alter table texttimestamp enable row level security;

create policy "Allow all operations"
on texttimestamp
for all
to anon
using (true)
with check (true);
```

The permissive policy above is appropriate for the assignment/demo environment. A production product should use authenticated users and restrictive, user-scoped RLS policies.

## Deploying to Vercel

Vercel detects this Vite project automatically. If the repository contains this `vl2` folder alongside other files, set **Root Directory** to `vl2` in the Vercel project settings.

Add these variables in **Settings → Environment Variables** for Production (and Preview if required):

- `VITE_PUBLIC_SUPABASE_URL`
- `VITE_PUBLIC_SUPABASE_ANON_KEY` — or `VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Then deploy. Vite embeds `VITE_*` values into the browser bundle at build time, so redeploy after changing either value. Do not commit `.env`; it is deliberately ignored by this repository.

## Verification

```bash
npm run build
npm run lint
```

Both commands complete successfully before deployment.
