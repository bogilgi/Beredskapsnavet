import "server-only";
import { one } from "@/lib/db";
import { verifieraLosenord } from "@/lib/session";

export type InbjudanRad = {
  id: number; org_id: number; epost: string; roll: string; unit_id: number | null;
  token_hash: string; token_salt: string; gar_ut: string; accepterad: string | null;
  org_namn: string;
};

export type OppenInbjudan = {
  epost: string; roll: string; org_namn: string; har_konto: boolean;
};

function nu() {
  return new Date().toISOString().slice(0, 19);
}

/** Inbjudan som den ser ut i databasen, utan kontroll av koden. */
export function hamtaInbjudanRad(id: number): InbjudanRad | undefined {
  if (!Number.isInteger(id)) return undefined;
  return one<InbjudanRad>(
    `SELECT i.*, o.namn AS org_namn FROM invitations i
     JOIN organisations o ON o.id = i.org_id
     WHERE i.id = ? AND o.aktiv = 1`,
    id,
  );
}

/**
 * Läser en inbjudan och kontrollerar koden.
 *
 * Samma svar ges oavsett om inbjudan saknas, redan är besvarad, har gått ut
 * eller koden är fel. Sidan ska inte gå att använda för att ta reda på vilka
 * adresser som är inbjudna, eller om en viss inbjudan finns.
 *
 * Ligger medvetet utanför "use server"-filen: där blir varje export en
 * anropbar endpoint, och den här funktionen behöver inte vara det.
 */
export function lasInbjudan(id: number, token: string): OppenInbjudan | null {
  if (!token) return null;
  const rad = hamtaInbjudanRad(id);
  if (!rad || rad.accepterad !== null || rad.gar_ut < nu()) return null;
  if (!verifieraLosenord(token, rad.token_salt, rad.token_hash)) return null;

  return {
    epost: rad.epost,
    roll: rad.roll,
    org_namn: rad.org_namn,
    har_konto: Boolean(one<{ id: number }>("SELECT id FROM users WHERE epost = ?", rad.epost)),
  };
}
