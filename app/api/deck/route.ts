import { getCards } from "@/lib/cards";
import { fetchDeck, parseRef } from "@/lib/decks";
import { errorMessage } from "@/lib/format";
import { currentUser, SIGNED_OUT } from "@/lib/session";
import type { SavedDeck } from "@/lib/settings";

/** GET /api/deck?ref=<an ArkhamDB deck link>: the deck a player is saving as theirs or their
 *  partner's, with its name and investigator for the deck slots to show. */
export async function GET(req: Request) {
  if (!(await currentUser(req.headers))) return SIGNED_OUT();
  const ref = new URL(req.url).searchParams.get("ref") ?? "";
  const parsed = parseRef(ref);
  if (!parsed) return new Response("That isn't an ArkhamDB deck link.", { status: 400 });
  try {
    const [store, fetched] = await Promise.all([getCards(), fetchDeck(parsed)]);
    if (!fetched.ok) return new Response(fetched.message, { status: fetched.status === "not_found" ? 404 : 503 });
    const { deck, kind } = fetched.data;
    const investigator = store.get(deck.investigator_code)?.name ?? deck.investigator_name ?? "Unknown investigator";
    const saved: SavedDeck = { id: deck.id, kind, name: deck.name.slice(0, 200), investigator: investigator.slice(0, 100) };
    return Response.json(saved);
  } catch (e) {
    return new Response(`Couldn't read the deck: ${errorMessage(e)}`, { status: 503 });
  }
}
