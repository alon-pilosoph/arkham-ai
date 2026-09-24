import { type CardStore, norm, parseCardQuery } from "./cards";
import { cardUrl } from "./urls";

const LINK = /\[([^\]]+)\]\(https:\/\/arkhamdb\.com\/card\/([^)]+)\)/g;

function repairLink(name: string, code: string, store: CardStore): string {
  const wanted = parseCardQuery(name);
  const card = store.get(code.trim());
  if (card && norm(card.name) === wanted.name && (wanted.level === undefined || (card.xp ?? 0) === wanted.level)) {
    return `[${name}](${cardUrl(code)})`;
  }
  const versions = store.find(name).groups[0] ?? [];
  const candidates = wanted.level === undefined ? versions : versions.filter((v) => (v.xp ?? 0) === wanted.level);
  return candidates.length === 1 ? `[${name}](${cardUrl(candidates[0].code)})` : name;
}

export function repairLinks(text: string, store: CardStore): string {
  return text.replace(LINK, (_whole, name: string, code: string) => repairLink(name, code, store));
}
