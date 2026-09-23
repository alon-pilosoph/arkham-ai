import { z } from "zod";
import rows from "./decks.json";
import { type IndexRow, IndexRowSchema, type Role } from "./schema";

export const DECK_INDEX: IndexRow[] = z.array(IndexRowSchema).parse(rows);

/** Roles that cover a deck's gap in a two-player game, best first. */
export const COMPLEMENT: Record<Role, Role[]> = {
  fighter: ["cluever", "flex"],
  cluever: ["fighter", "flex"],
  flex: ["fighter", "cluever", "flex"],
  support: ["flex", "fighter", "cluever"],
};
