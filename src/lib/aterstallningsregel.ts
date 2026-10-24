/**
 * Vem som får återställa vems lösenord.
 *
 * Installationen skickar ingen e-post — en kommun kör systemet i eget nät —
 * så återställningslänken lämnas till den som begär den. Återställningen är
 * därmed i praktiken en övertagning av kontot: den som begär den kan själv
 * sätta lösenordet och logga in.
 *
 * Lösenordet sitter på kontot, inte på medlemskapet. Övertagningen når därför
 * allt kontot når, även det som ligger utanför den organisation där
 * behörigheten att återställa gavs. Att kontot är medlem HÄR säger inte att
 * det bara är medlem här.
 *
 * Regeln är att en återställning bara får göras av någon vars behörighet redan
 * täcker kontots.
 *
 * Modulen är fri från server- och databasberoenden. Serveråtgärden nekar och
 * sidan erbjuder inte, båda ur samma regel, och ett test prövar den direkt.
 */

export type Konto = {
  /** Leverantörsflaggan: behörighet utanför alla organisationer. */
  leverantor: number;
  /** Medlemskap utöver det i organisationen begäran görs från. */
  andra_organisationer: number;
  /** Tomt lösenordsfält: kontot loggar in mot katalogtjänsten. */
  utan_losenord: number;
};

export type Hinder = {
  /** Kort skäl, att visa i en lista intill kontot. */
  kort: string;
  /** Hela beskedet till den som försöker, utan e-postadressen. */
  forklaring: string;
};

/** Skälet att vägra en återställning, eller null när den får göras. */
export function hinderForAterstallning(
  begarare: { leverantor: number },
  konto: Konto,
): Hinder | null {
  // Gäller alla, också leverantören: ett lösenord på ett konto som inte har
  // något blir en inloggningsväg förbi katalogtjänsten och dess krav på
  // autentiseringsmetod. Det kontot återställs där det hör hemma.
  if (konto.utan_losenord === 1) {
    return {
      kort: "loggar in mot katalogtjänsten",
      forklaring:
        "loggar in mot katalogtjänsten och har inget lösenord i systemet. Att " +
        "sätta ett här skapar en inloggningsväg förbi katalogtjänsten och dess " +
        "krav på autentiseringsmetod. Lösenordet återställs i katalogtjänsten.",
    };
  }

  // Leverantörens behörighet täcker varje organisation, så ingen av
  // spärrarna nedan skyddar något den inte redan når.
  if (begarare.leverantor === 1) return null;

  if (konto.leverantor === 1) {
    return {
      kort: "leverantörskonto",
      forklaring:
        "är ett leverantörskonto och har behörighet utanför alla organisationer. " +
        "Ett nytt lösenord skulle ge den behörigheten vidare. Återställningen " +
        "görs av leverantören.",
    };
  }

  if (konto.andra_organisationer > 0) {
    const n = konto.andra_organisationer;
    return {
      kort: `behörighet i ${n + 1} organisationer`,
      forklaring:
        `har behörighet i ${n} organisation${n === 1 ? "" : "er"} utöver din. ` +
        "Ett nytt lösenord ger åtkomst även där, och återställningen görs " +
        "därför av leverantören.",
    };
  }

  return null;
}
