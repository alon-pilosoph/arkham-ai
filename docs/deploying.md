# Deploying

The app is one Next.js project on Vercel's free Hobby plan, behind Vercel Authentication so
that only the two players can open it (and spend the model key). Chat history stays in
Assistant Cloud, anonymous per browser.

## Once

1. **Vercel account.** Sign up at vercel.com with the GitHub account that owns the repo.
2. **Import the repo.** Add New, then Project, then pick the repo. Vercel detects Next.js; keep the defaults.
3. **Environment variables** (Settings, then Environment Variables, for Production and Preview):

   | Name | Value | Why |
   |---|---|---|
   | `OPENAI_API_KEY` | the OpenAI key | the model (GPT-6 Sol by default: accurate, fast, and far cheaper per question than Claude) |
   | `NEXT_PUBLIC_ASSISTANT_BASE_URL` | the Assistant Cloud project URL | saved chats and titles; read at build time, so set it before the first build |

   Leave out `ANTHROPIC_API_KEY` unless Claude should answer instead: with no OpenAI key the
   app falls back to it, and with both it uses OpenAI. `ARKHAM_MODEL` overrides the choice.
4. **Protect every URL.** Settings, then Deployment Protection: turn on Vercel Authentication and
   set the scope to **All Deployments**. The default, Standard Protection, leaves the
   production domain public.
5. **Deploy**, then open the production URL in a private window. It must show the Vercel
   login, not the app. A request to `/api/chat` without the login cookie must be refused too.
6. **The second player** signs up for Vercel (free), opens the URL, and clicks Request
   Access; approve it under Deployment Protection, then Requests. The Hobby plan allows one
   such outside user, who logs in once per device.

## Worth setting

- **A monthly spend limit** on the OpenAI key (platform.openai.com, Settings, then Limits), or
  the Anthropic key (console.anthropic.com, Settings, then Limits) if Claude is answering
  instead, in case a device is lost with a login cookie on it.
- **Assistant Cloud:** if chats don't persist on the deployed site, check the cloud project's
  settings for an allowed-origins list and add the production domain.

## After that

Every push to `main` deploys to production; every other branch gets a protected
preview URL. The card set is fetched from ArkhamDB on a cold start and kept in memory (the
disk cache is development only), so the first question after a quiet spell waits a few
seconds longer.
