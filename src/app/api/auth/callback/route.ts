import { NextRequest, NextResponse } from "next/server";
import { logga, one, run } from "@/lib/db";
import { skapaSession } from "@/lib/session";
import { startsida } from "@/lib/behorighet";
import {
  FelAutentiseringsmetod, forbrukaBegaran, hamtaDiscovery, hamtaIdp, vaxlaKod,
  verifieraIdToken,
} from "@/lib/oidc";
import { domanTillaten } from "@/lib/oidc-token";

export const dynamic = "force-dynamic";

function tillbaka(begaran: NextRequest, fel: string) {
  return NextResponse.redirect(new URL(`/logga-in?fel=${fel}`, begaran.nextUrl));
}

/** Tar emot svaret från utfärdaren och loggar in användaren. */
export async function GET(begaran: NextRequest) {
  const p = begaran.nextUrl.searchParams;

  // Utfärdaren kan svara med ett fel i stället för en kod, till exempel när
  // användaren avbrutit.
  if (p.get("error")) return tillbaka(begaran, "avbruten");

  const state = p.get("state") ?? "";
  const kod = p.get("code") ?? "";
  if (!state || !kod) return tillbaka(begaran, "ofullstandigt-svar");

  // Engångsbruk: raden tas bort i och med läsningen, så ett svar inte kan
  // spelas upp igen.
  const begaranRad = forbrukaBegaran(state);
  if (!begaranRad) return tillbaka(begaran, "utgangen-begaran");

  const idp = hamtaIdp(begaranRad.org_id);
  if (!idp) return tillbaka(begaran, "okand-organisation");

  const redirectUri = new URL("/api/auth/callback", begaran.nextUrl).toString();

  let epost: string;
  let namn: string;
  let sub: string;
  try {
    const d = await hamtaDiscovery(idp.issuer);
    const idToken = await vaxlaKod(kod, begaranRad.code_verifier, idp, d, redirectUri);
    const krav = await verifieraIdToken(idToken, idp, d, begaranRad.nonce);

    epost = String(krav.email ?? "").toLowerCase();
    namn = String(krav.name ?? "").trim() || epost;
    // Kontrollerad i kontrolleraKrav: obligatorisk och icke-tom.
    sub = String(krav.sub);

    // En e-postadress som utfärdaren inte intygat är verifierad duger inte som
    // identitet: den kan vara vad användaren själv skrivit in.
    if (krav.email_verified === false) {
      logga(idp.org_id, epost, "Nekad federerad inloggning", "E-postadressen är inte verifierad");
      return tillbaka(begaran, "epost-ej-verifierad");
    }
    if (!epost) {
      logga(idp.org_id, "okänd", "Nekad federerad inloggning", "Id-token saknar e-postadress");
      return tillbaka(begaran, "saknar-epost");
    }
  } catch (f) {
    logga(idp.org_id, "okänd", "Federerad inloggning misslyckades",
      f instanceof Error ? f.message : "okänt fel");
    // Att ha loggat in utan flerfaktor är något användaren kan göra något åt,
    // till skillnad från att signaturen inte gick att verifiera.
    if (f instanceof FelAutentiseringsmetod) return tillbaka(begaran, "kraver-mfa");
    return tillbaka(begaran, "verifiering");
  }

  /*
   * Vilken identitet utfärdaren får intyga.
   *
   * Varje organisation konfigurerar sin egen utfärdare. Slås kontot bara upp
   * på e-postadressen kan var och en av dem intyga vilken adress som helst i
   * installationen — adressen står ju i den token utfärdaren själv skrivit.
   * En kommuns IT-avdelning hade därmed kunnat logga in som leverantörens
   * driftpersonal och nå den kravkatalog alla kunder delar.
   *
   * Domänen är gränsen för vad utfärdaren har något att säga om, och den
   * kontrolleras före uppslagningen.
   */
  if (!domanTillaten(epost, idp.epost_domaner)) {
    logga(
      idp.org_id, epost, "Nekad federerad inloggning",
      idp.epost_domaner
        ? `Adressen ligger utanför ${idp.epost_domaner}`
        : "Ingen e-postdomän är konfigurerad för utfärdaren",
    );
    return tillbaka(begaran, idp.epost_domaner ? "doman-ej-tillaten" : "ofullstandig-federering");
  }

  /*
   * Identiteten är utfärdarens sub, inte adressen. En adress kan skrivas om i
   * en katalogtjänst och ges till en annan person; sub är stabil. Bindningen
   * skapas vid första inloggningen, när adressen är det enda som finns att gå
   * på, och gäller därefter.
   */
  const bunden = one<{ user_id: number; epost: string }>(
    "SELECT user_id, epost FROM federated_identities WHERE issuer = ? AND sub = ?",
    idp.issuer, sub,
  );

  const anvandare = bunden
    ? one<{ id: number; aktiv: number; leverantor: number }>(
        "SELECT id, aktiv, leverantor FROM users WHERE id = ?", bunden.user_id,
      )
    : one<{ id: number; aktiv: number; leverantor: number }>(
        "SELECT id, aktiv, leverantor FROM users WHERE epost = ?", epost,
      );

  let userId: number;
  if (anvandare) {
    if (anvandare.aktiv !== 1) {
      logga(idp.org_id, epost, "Nekad federerad inloggning", "Kontot är avaktiverat");
      return tillbaka(begaran, "avaktiverat");
    }
    // Leverantörskontot har behörighet utanför alla organisationer, och en
    // organisations utfärdare ska inte kunna utfärda den. Domänspärren ovan
    // räcker så länge den är rätt konfigurerad; den här gör det oberoende av
    // konfigurationen.
    if (anvandare.leverantor === 1) {
      logga(
        idp.org_id, epost, "Nekad federerad inloggning",
        "Leverantörskonto kan inte logga in via en organisations utfärdare",
      );
      return tillbaka(begaran, "leverantorskonto-federerat");
    }
    userId = anvandare.id;
  } else if (bunden) {
    // Bindningen finns men kontot är borta. Att falla tillbaka på adressen här
    // vore att återinföra uppslagningen bindningen ska ersätta.
    logga(idp.org_id, epost, "Nekad federerad inloggning", "Det bundna kontot finns inte kvar");
    return tillbaka(begaran, "saknar-behorighet");
  } else if (idp.auto_medlemskap === 1) {
    // Kontot skapas utan lösenord: inloggningen sker mot katalogtjänsten, och
    // ett lösenordsfält som ingen använder är bara en angreppsyta.
    userId = Number(
      run(
        `INSERT INTO users (namn, epost, losenord_hash, losenord_salt, aktiv, leverantor, skapad)
         VALUES (?, ?, '', '', 1, 0, ?)`,
        namn, epost, new Date().toISOString().slice(0, 19),
      ).lastInsertRowid,
    );
  } else {
    logga(idp.org_id, epost, "Nekad federerad inloggning", "Saknar konto i organisationen");
    return tillbaka(begaran, "saknar-behorighet");
  }

  const medlem = one<{ roll: string }>(
    "SELECT roll FROM user_orgs WHERE user_id = ? AND org_id = ?", userId, idp.org_id,
  );
  if (!medlem) {
    if (idp.auto_medlemskap !== 1) {
      logga(idp.org_id, epost, "Nekad federerad inloggning", "Saknar behörighet till organisationen");
      return tillbaka(begaran, "saknar-behorighet");
    }
    run(
      "INSERT INTO user_orgs (user_id, org_id, roll, unit_id) VALUES (?, ?, ?, NULL)",
      userId, idp.org_id, idp.auto_roll,
    );
  }

  // Namnet hålls i takt med katalogtjänsten, som är källan efter federering.
  if (namn) run("UPDATE users SET namn = ? WHERE id = ?", namn, userId);

  if (!bunden) {
    run(
      `INSERT INTO federated_identities (issuer, sub, user_id, org_id, epost, skapad)
       VALUES (?, ?, ?, ?, ?, ?)`,
      idp.issuer, sub, userId, idp.org_id, epost,
      new Date().toISOString().slice(0, 19),
    );
    logga(idp.org_id, namn || epost, "Band konto till katalogtjänsten", idp.issuer);
  }

  await skapaSession(userId, idp.org_id);
  const roll = medlem?.roll ?? idp.auto_roll;
  logga(idp.org_id, namn || epost, "Loggade in federerat", `Roll: ${roll}`);
  return NextResponse.redirect(new URL(startsida(roll), begaran.nextUrl));
}
