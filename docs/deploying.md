# Deploying

The app is a single Next.js project on Vercel's free Hobby plan, at `arkham.alonp.dev`, with its
functions in Frankfurt (`vercel.json`). Its database is Postgres on Neon's free plan, also in
Frankfurt. People sign in with Google or with a one-time link emailed through Resend, and the app
is invite-only ([ARCHITECTURE.md](ARCHITECTURE.md#accounts-and-the-database)). If Assistant Cloud
is configured, chat history is stored there, anonymously and per browser, until chats move into
the database.

## First-time setup

1. **Create a Vercel account and import the repo.** Sign up at vercel.com with the GitHub account
   that owns the repo, then Add New, Project, and pick the repo. Keep the defaults.
2. **Add the database.** In the project, Storage, then Create Database, then Neon: region
   Frankfurt; leave Neon's Auth and Realtime off; the Free plan. Connect it to Production and
   Preview, check "Create database branch for deployment" for **Preview** only, and set the
   variable prefix to `DATABASE` so the connection string is `DATABASE_URL`. Every preview then
   gets its own copy of the database, and the build migrates whichever database it is given.
3. **Create the Google sign-in client.** In Google Cloud Console, in a project of its own:
   - Google Auth Platform, Get started: app name, support email, audience **External**.
   - Branding: home page `https://arkham.alonp.dev`, privacy policy
     `https://arkham.alonp.dev/privacy`, authorized domain `alonp.dev`. No logo (a logo needs
     Google's review).
   - Data access: nothing to add; name, email and picture need no review.
   - Audience: **Publish app**, so anyone invited can sign in, not only listed test users.
   - Clients, Create client, Web application. JavaScript origins `https://arkham.alonp.dev` and
     `http://localhost:3000`; redirect URIs `https://arkham.alonp.dev/api/auth/callback/google`
     and `http://localhost:3000/api/auth/callback/google`. Google takes no wildcards, so preview
     deployments sign in by email link only.
4. **Set up email.** At resend.com, add the domain `mail.alonp.dev` (region Ireland) and let it
   add its DNS records to Cloudflare, or add them by hand as DNS only. Once verified, create an
   API key with sending access to that domain only.
5. **Set the environment variables** under Settings, then Environment Variables, for Production
   and Preview, marked Sensitive:

   | Name | Value | Purpose |
   |---|---|---|
   | `OPENAI_API_KEY` | An OpenAI API key | The model. GPT-6 Sol is the default ([evals.md](evals.md#the-move-to-gpt-6-sol)). With no OpenAI key the app uses `ANTHROPIC_API_KEY`; `ARKHAM_MODEL` overrides the choice. |
   | `DATABASE_URL` | Set by the Neon integration | The database. |
   | `BETTER_AUTH_SECRET` | 32 random bytes: `openssl rand -base64 32` | Signs sessions. Changing it signs everyone out. |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From step 3 | Google sign-in. Without them the sign-in page offers email links only. |
   | `RESEND_API_KEY` | From step 4 | Sign-in emails. |
   | `OWNER_EMAIL` | The owner's address | The one account that can sign up without an invite. Without it nobody can. |
   | `NEXT_PUBLIC_ASSISTANT_BASE_URL` | An Assistant Cloud project URL | Saved chats with generated titles, until chats move into the database. Read at build time. |

   Optional: `DAILY_QUESTIONS` (questions per account per day, 150 by default), `EMAIL_FROM` (the
   sender, `Arkham assistant <signin@mail.alonp.dev>` by default), and `BETTER_AUTH_URL` (the
   app's address; production uses Vercel's production domain and a preview its branch URL
   without it).
6. **Deploy.** The build runs `npm run db:migrate` before `next build`, so the database is
   migrated before the new code serves anything.
7. **Deployment protection.** The app's own sign-in guards production. Under Settings, then
   Deployment Protection, **Standard Protection** keeps Vercel Authentication on preview
   deployments only, as a second lock on branches still being worked on.

For local runs, the same variables go in `.env.local` (ignored by git), except `DATABASE_URL`:
without it the app uses PGlite under `.data/`. Without `RESEND_API_KEY` a sign-in link is printed
in the server log instead of emailed.

## Recommended settings

- **A monthly spending limit** on the OpenAI key (platform.openai.com, Settings, then Limits), or
  on the Anthropic key (console.anthropic.com, Settings, then Limits) if Claude is answering. With
  the daily question cap, this bounds what a lost phone with a session on it can cost.
- **Assistant Cloud allowed origins.** If chats don't persist on the deployed site, check whether
  the cloud project has a list of allowed origins, and add the production domain to it.

## After deployment

Every push to `main` deploys to production, and every other branch gets its own preview URL and
database branch. On a cold start the server fetches the card set from ArkhamDB and keeps it in
memory (the disk cache is used only in local development), so the first question after a quiet
period takes a few seconds longer; Neon also wakes from sleep in about a second.
