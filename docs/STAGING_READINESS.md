# HITRACE60 - Staging Readiness Audit

Data audit: 2026-07-11

Verdetto: READY CON FIX

Il repository e vicino alla readiness staging. I fix repository-side obbligatori sono stati chiusi; non va comunque dichiarato READY pieno finche non viene eseguita la verifica su un nuovo progetto Supabase staging.

Fix chiusi:

1. `supabase/config.toml` aggiunto;
2. seed demo disabilitato nella config Supabase locale/versionata;
3. `.env.example` ripulito da IP LAN e valori localhost consigliati;
4. `ALLOW_DEMO_FALLBACK=false` aggiunto e implementato come default sicuro;
5. fallback demo consentito solo con valore esatto `ALLOW_DEMO_FALLBACK=true`.

Resta da fare prima del primo staging reale: applicare e verificare le migration `0001`-`0006` su un nuovo progetto Supabase vuoto.

Non sono stati eseguiti comandi remoti, non sono state lette o modificate credenziali reali, non e stato fatto deploy.

## 1. Executive summary

Lo schema versionato copre le tabelle principali, le enum, le funzioni RLS, le policy, le view leaderboard e la publication Realtime su `scores`.

Le migration sono coerenti come ordine generale:

- `0001` crea schema base, RLS iniziale e view;
- `0002` aggiunge indice unico scorecards;
- `0003` abilita Realtime su `scores`;
- `0004` aggiunge campi edizioni sugli eventi;
- `0005` introduce RBAC RLS owner/admin/viewer;
- `0006` consente self-read membership e self-update profilo.

Il punto piu debole per staging e il seed: `supabase/seed.sql` crea un utente in `auth.users`, usa email `.local`, UUID demo fissi, partecipanti, heat, scorecards e token demo. Va bene per local reset controllato, ma non e un seed staging/production-safe.

## 2. Migration audit

| Migration | Oggetti | Dipendenze | Idempotenza | Note staging |
|---|---|---|---|---|
| `0001_initial_schema.sql` | Extension `pgcrypto`; enum; tabelle; indici; trigger; funzione `validate_score_consistency`; view `leaderboard_station_rankings`, `leaderboard_overall`, `score_completion_status`; RLS iniziale; policy base | Richiede schema Supabase con `auth.users` | Parziale: `create type` e molte `create policy` non sono `if not exists`; corretta su DB vuoto | Crea view senza `security_invoker`; ok per uso attuale server-side, da rivalutare se le view diventano pubbliche/RLS-first |
| `0002_scorecards_unique_index.sql` | Indice unico su `scorecards(event_id, station_id, heat_id, participant_id)` | `scorecards` da `0001` | Buona: `create unique index if not exists` | Necessaria per upsert timeline |
| `0003_enable_scores_realtime.sql` | Aggiunge `scores` a `supabase_realtime` | Tabella `scores`, publication Supabase | Buona: gestisce `duplicate_object` | Sufficiente per Display realtime su `scores` |
| `0004_event_editions.sql` | Colonne `slug`, `edition_label`, `timezone`, `duplicated_from_event_id`; indice unique slug | `events` da `0001` | Buona: `add column if not exists`, `create index if not exists` | Necessaria per multi-edizione |
| `0005_rbac_rls_hardening.sql` | Funzioni `is_event_manager`, `is_event_reader`, alias `is_event_admin`; policy read/mutate RBAC; policy `participant_members`; audit insert manager | Tabelle e policy da `0001` | Buona per funzioni; policy usa `drop policy if exists` | Applicabile dopo `0001`-`0004`; corregge viewer read-only |
| `0006_event_admins_self_read_profiles_self_update.sql` | Policy `event_admins self read`; policy `profiles self update` | `event_admins`, `profiles`, RLS attiva da `0001`; RBAC da `0005` | Buona: `drop policy if exists` | Necessaria per authorization helper con client autenticato + RLS |

### Verifiche specifiche

- `0005` puo essere applicata dopo le migration precedenti: si, le tabelle target esistono gia in `0001`; `events.slug` non e richiesto da `0005`.
- `0006` puo essere applicata dopo `0005`: si, aggiunge policy compatibili.
- Le policy richiamano funzioni esistenti: in `0005` le funzioni sono create prima delle policy.
- `profiles`, `events`, `event_admins` sono coerenti con Supabase Auth: `profiles.id` referenzia `auth.users(id)`; `events.owner_id` referenzia `profiles(id)`; `event_admins.user_id` referenzia `profiles(id)`.
- Realtime: `0003` pubblica `scores`.
- View leaderboard: create in `0001`; non risultano marcate `security_invoker`.

### Possibili modifiche manuali non versionate

Dal repository non emergono oggetti che il codice richiede e che mancano nelle migration. I runtime test multiutente non sono ancora stati eseguiti sul progetto reale, quindi resta da verificare che il Supabase attuale non abbia policy o dati creati manualmente fuori migration.

## 3. Bootstrap da database vuoto

Procedura consigliata per un progetto staging nuovo:

1. Installare/avere Supabase CLI disponibile via package o CLI locale.
2. Creare un progetto Supabase staging dalla dashboard Supabase.
3. Recuperare:
   - `<STAGING_PROJECT_REF>`;
   - `<STAGING_DB_PASSWORD>`;
   - URL progetto;
   - anon key;
   - service role key.
4. Verificare di non essere collegati al Supabase attuale.
5. Collegare il repository al progetto staging.
6. Applicare migration.
7. Applicare seed staging solo se separato e controllato.
8. Configurare Auth URLs.
9. Configurare variabili su Vercel staging.

Comandi da preparare, non eseguiti in questo audit:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <STAGING_PROJECT_REF>
pnpm exec supabase db push
```

Se si usa una password DB esplicita:

```bash
pnpm exec supabase link --project-ref <STAGING_PROJECT_REF> --password <STAGING_DB_PASSWORD>
pnpm exec supabase db push
```

Verifiche dopo push:

```sql
select table_name from information_schema.tables where table_schema = 'public' order by table_name;
select proname from pg_proc where pronamespace = 'public'::regnamespace order by proname;
select schemaname, tablename, policyname from pg_policies where schemaname = 'public' order by tablename, policyname;
select * from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'scores';
```

`supabase/config.toml` e presente e versionato. La sezione `[db.seed]` e configurata con `enabled = false`, quindi il seed demo non viene applicato automaticamente.

## 4. Seed staging

Classificazione:

| Tipo | Stato |
|---|---|
| Schema migration | Presente in `supabase/migrations` |
| Seed locale/demo | Presente in `supabase/seed.sql` |
| Seed staging sicuro | Mancante |
| Dati produzione | Non devono essere nel repository |

`supabase/seed.sql` non e staging-safe perche:

- inserisce direttamente in `auth.users`;
- hardcoda `admin@hitrace60.local`;
- hardcoda password demo;
- crea evento `demo-event` live;
- crea partecipanti, heat, scorecards operative;
- crea token giudici demo prevedibili.

Seed staging consigliato: creare `supabase/seed.staging.sql` in un blocco futuro, con solo:

- un evento `hitrace60-staging-demo` in `draft` o `published`;
- `event_settings`;
- 7 categorie standard;
- 8 stazioni score;
- opzionalmente 8 judges/assignment con token chiaramente staging;
- zero partecipanti reali;
- zero score;
- zero timeline operativa, salvo scenario test separato.

Meglio ancora per il primo staging: nessun seed evento. Creare l'utente Auth e poi creare la prima edizione dalla UI, cosi `owner_id` e `event_admins.role = owner` vengono generati dal flusso applicativo.

## 5. Utente admin staging

Procedura consigliata:

1. Supabase Dashboard staging -> Authentication -> Users.
2. Creare utente `<STAGING_ADMIN_EMAIL>`.
3. Confermare email/auto-confirm.
4. Aprire deploy staging.
5. Login con email/password.
6. Creare nuova edizione dalla UI `/admin/events/new`.
7. Verificare che:
   - esista `profiles.id = auth.users.id`;
   - `events.owner_id = auth.users.id`;
   - `event_admins.role = owner`.

Questa e preferibile rispetto a seed SQL evento+owner, per evitare owner hardcoded e dipendenze su `auth.users` in SQL.

## 6. Inventario env

| Variabile | File | Client/server | Segreta | Obbligatoria staging | Diversa local/staging/prod | Se manca |
|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.example`, `middleware.ts`, `src/lib/supabase/*` | Pubblica/browser e server | No | Si | Si | Admin redirect login config missing; Judge/Display fallback/service config mancante |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.example`, `middleware.ts`, `src/lib/supabase/auth-server.ts`, `src/lib/supabase/client.ts` | Pubblica/browser e server | No | Si | Si | Auth admin/browser client non funziona |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.example`, `src/lib/supabase/server.ts` | Solo server | Si | Si per flussi multi-step/Judge/Display attuali | Si | Service role client fallisce; Judge/Display DB reale e alcune mutation non funzionano |
| `NEXT_PUBLIC_APP_URL` | `.env.example`, `src/lib/event-links.ts` | Pubblica/server-rendered | No | Si | Si | Link/QR ricadono su judge base o fallback LAN |
| `NEXT_PUBLIC_JUDGE_BASE_URL` | `.env.example`, `src/lib/event-links.ts` | Pubblica/server-rendered | No | Consigliata | Si | Link giudici usano `NEXT_PUBLIC_APP_URL` o fallback LAN |
| `JUDGE_TOKEN_SECRET` | `.env.example` | Non usata nel codice corrente | Potenzialmente si | No finche non implementata | Si | Nessun effetto attuale |
| `NODE_ENV` | `src/app/judge/[token]/page.tsx` | Server/build | No | Gestita da Vercel | Si | Usata solo per badge dev/admin, non abilita fallback demo |
| `ALLOW_DEMO_FALLBACK` | `src/lib/demo-fallback.ts` e loader demo | Server-only | No | Si, valore raccomandato `false` | Si | Default false: nessun fallback demo |

Problemi env:

- `.env.example` usa placeholder staging sicuri e include `ALLOW_DEMO_FALLBACK=false`.
- Il fallback LAN e stato rimosso dalla configurazione consigliata.
- `JUDGE_TOKEN_SECRET` e dichiarata ma non usata.
- Nessun segreto ha prefisso `NEXT_PUBLIC_`, bene.
- Service role non viene esportata al browser dal codice trovato.

## 7. Compatibilita Vercel

| Area | Stato |
|---|---|
| Next.js App Router | Compatibile |
| Server Actions | Compatibili con Vercel Node runtime |
| Middleware auth | Compatibile; usa Supabase SSR cookies |
| Supabase Realtime | Compatibile lato browser; richiede URL/anon key staging |
| QR generation | `qrcode` server/client safe per uso attuale |
| PDF | `@react-pdf/renderer` presente; verificare timeout se export pesanti |
| File system | Nessuna dipendenza runtime persistente trovata |
| Processi persistenti | Nessuno richiesto; `restart.sh` solo locale |
| IP hardcoded | Nessun IP LAN nella configurazione staging consigliata; resta da evitare qualsiasi override locale su Vercel |
| Native deps | Nessun blocco evidente |
| Lockfile | `pnpm-lock.yaml` presente |

`restart.sh` non deve essere usato su Vercel.

## 8. Auth URL staging

Configurare in Supabase Auth staging:

- Site URL: `https://<VERCEL_STAGING_DOMAIN>`
- Redirect URLs:
  - `https://<VERCEL_STAGING_DOMAIN>/login`
  - `https://<VERCEL_STAGING_DOMAIN>/admin`
  - `https://<VERCEL_STAGING_DOMAIN>/admin/events`
  - eventuale preview URL Vercel se usato per test

Il login email/password non richiede OAuth.

Cookie:

- Vercel fornisce HTTPS; i cookie Supabase SSR dovrebbero funzionare.
- Verificare login, refresh sessione e logout su dominio staging.
- `sanitizeAdminRedirect` limita redirect a `/admin`, quindi non dovrebbe aprire redirect esterni.

## 9. Deployment protection

Obiettivo: proteggere staging senza impedire test multi-device su `/judge/*` e `/display/*`.

Opzioni:

| Opzione | Pro | Contro |
|---|---|---|
| Vercel Authentication globale | Forte e semplice | Blocca anche QR judge/display, scomodo per test multi-device |
| Vercel Password Protection globale | Semplice | Anche judge/display richiedono password, frizione alta |
| Protezione solo preview + admin login app | Compatibile con QR se staging e accessibile | URL pubblico se condiviso |
| Middleware custom con eccezioni | Flessibile | Non implementare in questo audit |

Raccomandazione per primo test: usare un deploy staging non indicizzato, URL non pubblico, admin protetto da Supabase Auth, e non abilitare protezione globale che rompe QR. Se serve una protezione Vercel, verificare che permetta eccezioni per `/judge/*` e `/display/*`; in caso contrario rinviarla al test successivo.

## 10. Procedura deploy checklist

### PRE-DEPLOY

1. Repository pulito.
2. Commit/tag di riferimento creato.
3. `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build` verdi.
4. `supabase/config.toml` creato/versionato o procedura CLI documentata.
5. Progetto Supabase staging creato.
6. Migration `0001`-`0006` applicate su staging.
7. Verifica tabelle, funzioni, policy, Realtime.
8. Seed staging deciso: preferenza nessun seed evento, creazione via UI.
9. Utente `<STAGING_ADMIN_EMAIL>` creato e confermato.
10. Variabili staging raccolte senza copiarle nel repo.

### VERCEL

1. Import GitHub repository.
2. Framework: Next.js.
3. Branch staging o branch principale scelta consapevolmente.
4. Package manager: pnpm.
5. Build command: `pnpm build`.
6. Variabili:
   - `NEXT_PUBLIC_SUPABASE_URL`;
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
   - `SUPABASE_SERVICE_ROLE_KEY`;
   - `NEXT_PUBLIC_APP_URL`;
   - `NEXT_PUBLIC_JUDGE_BASE_URL`;
   - `ALLOW_DEMO_FALLBACK=false`.
7. Deploy.
8. Controllare build logs.
9. Configurare Supabase Auth Site URL e Redirect URLs.

### POST-DEPLOY

1. Aprire `/login`.
2. Login admin.
3. Aprire `/admin/events`.
4. Creare edizione staging.
5. Verificare dashboard.
6. Creare partecipanti test.
7. Generare timeline.
8. Aprire `/admin/events/{slug}/links`.
9. Aprire un link judge da smartphone.
10. Validare uno score.
11. Aprire `/display/{slug}` su un altro device.
12. Verificare Realtime o polling fallback.
13. Logout.
14. Verificare `/admin/*` da anonimo.
15. Testare da rete diversa.

### ROLLBACK

1. Disabilitare o rimuovere il deployment Vercel staging.
2. Non toccare il Supabase attuale/local.
3. Tornare al commit/tag precedente su Vercel.
4. Se necessario, eliminare solo il progetto Supabase staging.
5. Non riutilizzare service role staging in altri ambienti.

## 11. Fix obbligatori prima dello staging

1. Applicare `0001`-`0006` al progetto staging nuovo.
2. Verificare runtime RBAC/RLS owner/admin/viewer/external con gli script gia predisposti.
3. Decidere se creare `supabase/seed.staging.sql` o partire senza seed evento.
4. Impostare su Vercel staging `ALLOW_DEMO_FALLBACK=false`.

## 12. Fix rinviabili

1. Rendere le view leaderboard `security_invoker` se si decide di leggerle via RLS/browser.
2. Migrare Judge/Display da service role a RPC/policy dedicate.
3. Token giudici casuali lunghi, revoca/scadenza avanzata, `last_seen_at`.
4. Seed staging completo e parametrico.
5. Protezione deployment con eccezioni path.
6. PDF load testing su serverless.

## 13. Prossimo passo esatto

Prima di creare il progetto staging:

1. creare il progetto Supabase staging;
2. collegare il CLI al project ref staging;
3. applicare `pnpm exec supabase db push`;
4. creare l'utente admin staging;
5. configurare Vercel con env staging e `ALLOW_DEMO_FALLBACK=false`.
