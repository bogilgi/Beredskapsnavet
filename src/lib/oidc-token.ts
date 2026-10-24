import { createPublicKey, createVerify } from "node:crypto";

/**
 * Verifiering av id-token.
 *
 * Ren modul utan server-beroenden: inga databasanrop och ingen nätverkstrafik,
 * så kontrollerna går att testa direkt mot framställda tokens. Hämtningen av
 * nycklar och kodväxlingen ligger i oidc.ts.
 */

/**
 * Inloggningen genomfördes utan den metod organisationen kräver.
 *
 * Egen feltyp, eftersom användaren ska få veta att hen ska logga in med
 * flerfaktor — inte det intetsägande "svaret kunde inte verifieras", som inte
 * säger vad hen ska göra åt saken.
 */
export class FelAutentiseringsmetod extends Error {}

/**
 * Signaturalgoritmer som accepteras.
 *
 * Bara asymmetriska. "none" och de symmetriska HS-algoritmerna saknas med
 * flit: att acceptera dem är den klassiska vägen förbi signaturkontrollen,
 * eftersom klienthemligheten då räcker för att signera en egen token.
 */
export const ALGORITM: Record<string, string> = {
  RS256: "RSA-SHA256",
  RS384: "RSA-SHA384",
  RS512: "RSA-SHA512",
};

export type Jwk = {
  kid?: string; kty: string; alg?: string; use?: string; n?: string; e?: string;
};

export type TokenKrav = {
  issuer: string;
  client_id: string;
  /** Krävd autentiseringsmetod i amr. Tom sträng = inget krav. */
  krav_amr: string;
};

export type Delar = { huvud: { alg: string; kid?: string }; krav: Record<string, unknown>; data: Buffer; signatur: Buffer };

/** Delar upp en token och avkodar huvud och anspråk, utan att lita på dem. */
export function delaToken(idToken: string): Delar {
  const bitar = idToken.split(".");
  if (bitar.length !== 3) throw new Error("Id-token har fel format.");
  return {
    huvud: JSON.parse(Buffer.from(bitar[0], "base64url").toString()),
    krav: JSON.parse(Buffer.from(bitar[1], "base64url").toString()),
    data: Buffer.from(`${bitar[0]}.${bitar[1]}`),
    signatur: Buffer.from(bitar[2], "base64url"),
  };
}

/** Kontrollerar signaturen mot utfärdarens nycklar. */
export function verifieraSignatur(delar: Delar, nycklar: Jwk[]): void {
  const nodeAlg = ALGORITM[delar.huvud.alg];
  if (!nodeAlg) {
    throw new Error(`Id-token är signerad med ${delar.huvud.alg}, som inte accepteras.`);
  }

  const kandidater = nycklar.filter(
    (k) => k.kty === "RSA" && (!delar.huvud.kid || !k.kid || k.kid === delar.huvud.kid),
  );
  if (kandidater.length === 0) throw new Error("Ingen matchande nyckel hos utfärdaren.");

  const giltig = kandidater.some((jwk) => {
    try {
      const nyckel = createPublicKey({ key: jwk as never, format: "jwk" });
      return createVerify(nodeAlg).update(delar.data).verify(nyckel, delar.signatur);
    } catch {
      return false;
    }
  });
  if (!giltig) throw new Error("Id-tokens signatur går inte att verifiera.");
}

/**
 * Kontrollerar anspråken mot det vi begärde.
 *
 * Att bara avkoda token och lita på innehållet vore att släppa in vem som helst
 * som kan skriva JSON. `nu` är injicerbart för att utgångskontrollen ska gå att
 * testa utan att vänta.
 */
export function kontrolleraKrav(
  krav: Record<string, unknown>,
  forvantat: TokenKrav,
  nonce: string,
  nu = Math.floor(Date.now() / 1000),
): void {
  const utanSlash = (s: string) => s.replace(/\/$/, "");

  if (utanSlash(String(krav.iss)) !== utanSlash(forvantat.issuer)) {
    throw new Error("Id-tokens iss stämmer inte med utfärdaren.");
  }
  const aud = Array.isArray(krav.aud) ? krav.aud : [krav.aud];
  if (!aud.includes(forvantat.client_id)) {
    throw new Error("Id-token är utfärdad för en annan klient.");
  }
  if (typeof krav.exp !== "number" || krav.exp < nu) throw new Error("Id-token har gått ut.");
  if (typeof krav.iat === "number" && krav.iat > nu + 300) {
    throw new Error("Id-token är utfärdad i framtiden.");
  }
  if (krav.nonce !== nonce) throw new Error("Id-tokens nonce stämmer inte med begäran.");

  // sub är utfärdarens stabila identifierare för användaren, och obligatorisk
  // enligt OpenID Connect. Det är den identiteten kontot binds till — en
  // e-postadress kan skrivas om i en katalogtjänst, sub kan inte.
  if (typeof krav.sub !== "string" || krav.sub.trim() === "") {
    throw new Error("Id-token saknar sub, och går därför inte att binda till ett konto.");
  }

  // Flerfaktor ska verifieras mot vad utfärdaren faktiskt gjorde. Att anta att
  // kommunens katalogtjänst alltid kräver det vore att gissa om en säkerhet
  // systemet säljs på.
  if (forvantat.krav_amr) {
    const amr = Array.isArray(krav.amr) ? krav.amr.map(String) : [];
    if (!amr.includes(forvantat.krav_amr)) {
      throw new FelAutentiseringsmetod(
        `Inloggningen genomfördes utan ${forvantat.krav_amr}. Organisationen kräver det.`,
      );
    }
  }
}

/* ------------------------------------------------------------ e-postdomäner */

/**
 * Om utfärdaren får intyga adressen.
 *
 * Varje organisation konfigurerar sin egen utfärdare, och utan den här
 * kontrollen kan var och en av dem intyga vilken adress som helst i
 * installationen: kontot slås upp på adressen, och adressen står i den token
 * utfärdaren själv har skrivit. En kommuns IT-avdelning hade därmed kunnat
 * logga in som leverantörens driftpersonal. Domänen säger vilka identiteter
 * utfärdaren har något att säga om.
 *
 * En tom lista tillåter ingenting. Att låta den betyda "alla domäner" vore
 * samma hål igen, och ett hål man råkar lämna öppet genom att inte fylla i
 * ett fält.
 */
export function domanTillaten(epost: string, domaner: string): boolean {
  const tillatna = domaner
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  if (tillatna.length === 0) return false;

  const delar = epost.trim().toLowerCase().split("@");
  if (delar.length !== 2 || !delar[0] || !delar[1]) return false;
  const doman = delar[1];

  // Exakt domän, eller en underdomän till en tillåten. Suffixjämförelsen görs
  // mot "." + domänen, annars hade "ondnordmark.se" matchat "nordmark.se".
  return tillatna.some((d) => doman === d || doman.endsWith("." + d));
}
