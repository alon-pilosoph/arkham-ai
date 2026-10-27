import { cardDetail } from "@/lib/card-detail";
import { getCards } from "@/lib/cards";
import { errorMessage } from "@/lib/format";
import { currentUser, SIGNED_OUT } from "@/lib/session";
import { tabooInForce } from "@/lib/taboo";

/** GET /api/card/01060?taboo=1: one card for the card dialog, with the taboo list applied when
 *  the switch is on. Failures are plain text, like the chat route's. */
export async function GET(req: Request, ctx: RouteContext<"/api/card/[code]">) {
  if (!(await currentUser(req.headers))) return SIGNED_OUT();
  const { code } = await ctx.params;
  if (!/^[0-9a-z]{4,10}$/i.test(code)) return new Response("Bad request: not a card code", { status: 400 });
  const taboo = new URL(req.url).searchParams.get("taboo") === "1";
  try {
    const [store, inForce] = await Promise.all([getCards(), tabooInForce({ taboo })]);
    if (inForce.error) return new Response(`Couldn't load the taboo list: ${inForce.error}`, { status: 503 });
    const card = cardDetail(store, code, inForce.list);
    if (!card) return new Response(`No card has code ${code}.`, { status: 404 });
    return Response.json(card, { headers: { "cache-control": "private, max-age=3600" } });
  } catch (e) {
    return new Response(`Couldn't load the card set: ${errorMessage(e)}`, { status: 503 });
  }
}
