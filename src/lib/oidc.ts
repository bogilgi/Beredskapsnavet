import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { all, one, run } from "@/lib/db";
import {
  delaToken, kontrolleraKrav, verifieraSignatur, type Jwk,
} from "@/lib/oidc-token";

// Återexporteras för anroparnas skull: feltypen hör till verifieringen.
export { FelAutentiseringsmetod } from "@/lib/oidc-token";

/**
 * Federerad inloggning med OpenID Connect.
 *
 * Auktoriseringskod med PKCE. Implicit flöde används inte: en id-token i
 * adressfältet hamnar i webbserverloggar och i webbläsarhistoriken.
 *
 * Konfigurationen hör till organisationen och inte till installationen,
 * eftersom varje kommun har sin egen katalogtjänst. Lokala lösenord finns kvar
 * för organisationer utan konfigurerad leverantör och för leverantörens egen
 * driftpersonal, som annars inte kan logga in någonstans.
 */

export type Idp = {
  org_id: number;
  issuer: string;
  client_id: string;
  client_secret: string;
  knapptext: string;
  krav_amr: string;
  /** Kommaseparerade e-postdomäner utfärdaren får intyga. Tom = ingen. */
  epost_domaner: string;
  auto_medlemskap: number;
  auto_roll: string;
  aktiv: number;
  org_namn: string;
  org_kortnamn: string;
};

export type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

const GILTIG_I_MINUTER = 10;

function nu() {
  return new Date().toISOString().slice(0, 19);
}

function omMinuter(m: number) {
  return new Date(Date.now() + m * 60_000).toISOString().slice(0, 19);
}

export const hamtaIdp = (orgId: number) =>
  one<Idp>(
    `SELECT i.*, o.namn AS org_namn, o.kortnamn AS org_kortnamn
     FROM org_idp i JOIN organisations o ON o.id = i.org_id
     WHERE i.org_id = ? AND i.aktiv = 1 AND o.aktiv = 1`,
    orgId,
  );

export const hamtaIdpPaKortnamn = (kortnamn: string) =>
  one<Idp>(
    `SELECT i.*, o.namn AS org_namn, o.kortnamn AS org_kortnamn
     FROM org_idp i JOIN organisations o ON o.id = i.org_id
     WHERE o.kortnamn = ? AND i.aktiv = 1 AND o.aktiv = 1`,
    kortnamn,
  );

/** Organisationer som erbjuder federerad inloggning, för knapparna. */
export const hamtaIdpVal = () =>
  all<{ kortnamn: string; namn: string; knapptext: string }>(
    `SELECT o.kortnamn, o.namn, i.knapptext
     FROM org_idp i JOIN organisations o ON o.id = i.org_id
     WHERE i.aktiv = 1 AND o.aktiv = 1
     ORDER BY o.namn`,
  );

/* ------------------------------------------------------------------ upptäckt */

export async function hamtaDiscovery(issuer: string): Promise<Discovery> {
  const url = issuer.replace(/\/$/, "") + "/.well-known/openid-configuration";
  const svar = await fetch(url, { cache: "no-store" });
  if (!svar.ok) throw new Error(`Utfärdaren svarade ${svar.status} på discovery.`);
  const d = (await svar.json()) as Discovery;

  // Utfärdaren i dokumentet måste vara den vi frågade. Annars kan en
  // felkonfigurerad adress peka på någon annans utfärdare.
  if (d.issuer.replace(/\/$/, "") !== issuer.replace(/\/$/, "")) {
    throw new Error("Discovery-dokumentets issuer stämmer inte med den konfigurerade.");
  }
  for (const f of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
    if (!d[f]) throw new Error(`Discovery-dokumentet saknar ${f}.`);
  }
  return d;
}

/* -------------------------------------------------------------------- utresa */

function base64url(b: Buffer) {
  return b.toString("base64url");
}

export async function paborjaInloggning(idp: Idp, redirectUri: string): Promise<string> {
  const d = await hamtaDiscovery(idp.issuer);

  const state = base64url(randomBytes(32));
  const nonce = base64url(randomBytes(32));
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());

  run(
    `INSERT INTO oidc_requests (state, org_id, nonce, code_verifier, skapad, gar_ut)
     VALUES (?, ?, ?, ?, ?, ?)`,
    state, idp.org_id, nonce, verifier, nu(), omMinuter(GILTIG_I_MINUTER),
  );

  const p = new URLSearchParams({
    response_type: "code",
    client_id: idp.client_id,
    redirect_uri: redirectUri,
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${d.authorization_endpoint}?${p}`;
}

/* ----------------------------------------------------------------- återkomst */

export type Begaran = {
  state: string; org_id: number; nonce: string; code_verifier: string; gar_ut: string;
};

/** Hämtar och förbrukar en påbörjad inloggning. Engångsbruk. */
export function forbrukaBegaran(state: string): Begaran | undefined {
  const rad = one<Begaran>("SELECT * FROM oidc_requests WHERE state = ?", state);
  // Raden tas bort oavsett utfall, så att samma state inte kan användas igen.
  run("DELETE FROM oidc_requests WHERE state = ?", state);
  if (!rad || rad.gar_ut < nu()) return undefined;
  return rad;
}

/** Städar bort påbörjade inloggningar som aldrig fullföljdes. */
export function stadaBegaranden() {
  run("DELETE FROM oidc_requests WHERE gar_ut < ?", nu());
}

/**
 * Verifierar en id-token.
 *
 * Signaturen kontrolleras mot utfärdarens nycklar, och anspråken mot vad vi
 * begärde. Att bara avkoda token och lita på innehållet vore att släppa in vem
 * som helst som kan skriva JSON.
 */
export async function verifieraIdToken(
  idToken: string, idp: Idp, d: Discovery, nonce: string,
): Promise<Record<string, unknown>> {
  const delar = delaToken(idToken);

  const jwksSvar = await fetch(d.jwks_uri, { cache: "no-store" });
  if (!jwksSvar.ok) throw new Error(`Utfärdaren svarade ${jwksSvar.status} på jwks.`);
  const { keys } = (await jwksSvar.json()) as { keys: Jwk[] };

  verifieraSignatur(delar, keys);
  kontrolleraKrav(
    delar.krav,
    { issuer: idp.issuer, client_id: idp.client_id, krav_amr: idp.krav_amr },
    nonce,
  );
  return delar.krav;
}

export async function vaxlaKod(
  kod: string, verifier: string, idp: Idp, d: Discovery, redirectUri: string,
): Promise<string> {
  const svar = await fetch(d.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    cache: "no-store",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: kod,
      redirect_uri: redirectUri,
      client_id: idp.client_id,
      client_secret: idp.client_secret,
      code_verifier: verifier,
    }),
  });
  if (!svar.ok) {
    throw new Error(`Utfärdaren nekade kodväxlingen (${svar.status}).`);
  }
  const data = (await svar.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("Utfärdarens svar saknar id_token.");
  return data.id_token;
}
