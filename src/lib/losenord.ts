import "server-only";
import { one } from "@/lib/db";
import { verifieraLosenord } from "@/lib/session";

export type Aterstallning = {
  id: number; user_id: number; token_hash: string; token_salt: string;
  gar_ut: string; anvand: string | null; namn: string; epost: string;
  aktiv: number; federerad: number;
};

function nu() {
  return new Date().toISOString().slice(0, 19);
}

export function hamtaAterstallning(id: number): Aterstallning | undefined {
  if (!Number.isInteger(id)) return undefined;
  return one<Aterstallning>(
    `SELECT r.*, u.namn, u.epost, u.aktiv,
       (SELECT COUNT(*) FROM user_orgs uo JOIN org_idp i ON i.org_id = uo.org_id
         WHERE uo.user_id = u.id AND i.aktiv = 1) AS federerad
     FROM password_resets r JOIN users u ON u.id = r.user_id
     WHERE r.id = ?`,
    id,
  );
}

/**
 * Kontrollerar en återställningslänk.
 *
 * Samma svar oavsett om länken saknas, är använd, har gått ut eller koden är
 * fel, så att sidan inte går att använda för att ta reda på vilka konton som
 * finns eller har en pågående återställning.
 */
export function lasAterstallning(
  id: number, token: string,
): { namn: string; epost: string; federerad: boolean } | null {
  if (!token) return null;
  const rad = hamtaAterstallning(id);
  if (!rad || rad.anvand !== null || rad.gar_ut < nu() || rad.aktiv !== 1) return null;
  if (!verifieraLosenord(token, rad.token_salt, rad.token_hash)) return null;
  return { namn: rad.namn, epost: rad.epost, federerad: rad.federerad > 0 };
}
