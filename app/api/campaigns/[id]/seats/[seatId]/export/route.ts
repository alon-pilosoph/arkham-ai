// A seat's deck, or one of its earlier versions (?version=<number>), as a file ArkhamDB imports.

import { arkhamDbText, exportFileName } from "@/lib/campaign/export";
import { loadCampaign } from "@/lib/campaign/store";
import { getCards } from "@/lib/cards";
import { currentUser, SIGNED_OUT } from "@/lib/session";

export async function GET(req: Request, ctx: RouteContext<"/api/campaigns/[id]/seats/[seatId]/export">) {
  const user = await currentUser(req.headers);
  if (!user) return SIGNED_OUT();
  const { id, seatId } = await ctx.params;
  const c = await loadCampaign(user.id, id);
  const s = c?.seats.find((x) => x.id === seatId);
  if (!s) return new Response("Not found", { status: 404 });
  const wanted = new URL(req.url).searchParams.get("version");
  const v = wanted ? s.versions.find((x) => String(x.number) === wanted) : s.versions.find((x) => x.id === s.deck?.id);
  if (!v) return new Response("Not found", { status: 404 });
  const name = exportFileName(`${v.name} v${v.number}`);
  return new Response(arkhamDbText(await getCards(), v), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
