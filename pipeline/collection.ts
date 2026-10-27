// npm run data:collection: checks the hand-kept lib/collection.json against ArkhamDB's pack list
// and reports packs added since, for an owned-or-not decision.

import collection from "@/lib/collection.json";
import { getJsonText } from "./http";

// Chapter 2 (the 2026 Core Set, its standalone investigators and its campaigns) is out of scope:
// the app covers Chapter 1 only.
const NOT_OWNED = new Set(["core_2026", "tom", "car", "and", "mar", "mig", "cob"]);

async function main(): Promise<number> {
  const res = await getJsonText<{ code: string; name: string }[]>("/api/public/packs/");
  if (!res.ok) {
    console.error(res.message);
    return 1;
  }
  const owned = new Set(collection.packs);
  const onArkhamDB = new Set(res.data.map((p) => p.code));
  const gone = [...owned].filter((c) => !onArkhamDB.has(c));
  const undecided = res.data.filter((p) => !owned.has(p.code) && !NOT_OWNED.has(p.code));
  console.log(`${owned.size} owned packs, ${onArkhamDB.size} on ArkhamDB`);
  for (const c of gone) console.log(`  owned but no longer on ArkhamDB: ${c}`);
  for (const p of undecided) console.log(`  new on ArkhamDB, owned or not? ${p.code} ${p.name}`);
  return gone.length || undecided.length ? 1 : 0;
}

process.exitCode = await main();
