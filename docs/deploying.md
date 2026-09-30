# Deploying

The app is a single Next.js project on Vercel's free Hobby plan. It sits behind Vercel
Authentication so that only the two players can open it, and so spend the model API key. If
Assistant Cloud is configured, chat history is stored there, anonymously and per browser.

## First-time setup

1. **Create a Vercel account.** Sign up at vercel.com with the GitHub account that owns the repo.
2. **Import the repo.** Choose Add New, then Project, and pick the repo. Vercel detects Next.js;
   keep the defaults.
3. **Set the environment variables** under Settings, then Environment Variables, for both
   Production and Preview:

   | Name | Value | Purpose |
   |---|---|---|
   | `OPENAI_API_KEY` | An OpenAI API key | The model. GPT-6 Sol is the default: accurate, fast, and much cheaper per question than Claude ([evals.md](evals.md#the-move-to-gpt-6-sol)). |
   | `NEXT_PUBLIC_ASSISTANT_BASE_URL` | An Assistant Cloud project URL | Saved chats with generated titles. Next.js reads it at build time, so set it before the first build. |

   Leave `ANTHROPIC_API_KEY` unset unless Claude should answer instead. With no OpenAI key the app
   uses the Anthropic key; with both, it uses OpenAI. `ARKHAM_MODEL` overrides the choice.
4. **Protect every URL.** Under Settings, then Deployment Protection, turn on Vercel
   Authentication and set its scope to **All Deployments**. The default, Standard Protection,
   leaves the production domain public.
5. **Deploy**, then open the production URL in a private window. It must show the Vercel login
   page, not the app. A request to `/api/chat` without the login cookie must be refused too.
6. **Give the second player access.** They sign up for Vercel (free), open the URL and click
   Request Access; approve the request under Deployment Protection, then Requests. The Hobby plan
   allows one such outside user, who logs in once per device.

## Recommended settings

- **A monthly spending limit** on the OpenAI key (platform.openai.com, Settings, then Limits), or
  on the Anthropic key (console.anthropic.com, Settings, then Limits) if Claude is answering. This
  caps the damage if a device with a login cookie on it is lost.
- **Assistant Cloud allowed origins.** If chats don't persist on the deployed site, check whether
  the cloud project has a list of allowed origins, and add the production domain to it.

## After deployment

Every push to `main` deploys to production, and every other branch gets its own protected
preview URL. On a cold start the server fetches the card set from ArkhamDB and keeps it in memory
(the disk cache is used only in local development), so the first question after a quiet period
takes a few seconds longer.
