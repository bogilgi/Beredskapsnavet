/**
 * Behörighetsmodell.
 *
 * Åtkomsten styrs per modul och nivå. Matrisen ligger i kod och inte i
 * databasen, eftersom den är en policy som ska granskas och versionshanteras,
 * inte data som vem som helst kan ändra i drift. Vilken roll en enskild
 * användare har ligger däremot i databasen.
 */

export const MODULER = [
  "oversikt",
  "efterlevnad",
  "atgarder",
  "krigsorganisation",
  "krigsplacering",
  "rsa",
  "kontinuitet",
  "resurser",
  "ovningar",
  "rapport",
  "anvandare",
  "personuppgifter",
  "organisationer",
  "katalog",
] as const;

export type Modul = (typeof MODULER)[number];
export type Niva = "ingen" | "las" | "skriv";

export const MODULNAMN: Record<Modul, string> = {
  oversikt: "Översikt",
  efterlevnad: "Lagkrav och efterlevnad",
  atgarder: "Åtgärdsregister",
  krigsorganisation: "Krigsorganisation",
  krigsplacering: "Krigsplacering",
  rsa: "Risk- och sårbarhetsanalys",
  kontinuitet: "Kontinuitetshantering",
  resurser: "Resurser och förnödenheter",
  ovningar: "Övning och utbildning",
  rapport: "Beredskapsrapport",
  anvandare: "Användare och behörighet",
  personuppgifter: "Personuppgifter och gallring",
  organisationer: "Anslutna organisationer",
  katalog: "Kravkatalogen",
};

export const MODULVAG: Record<Modul, string> = {
  oversikt: "/",
  efterlevnad: "/efterlevnad",
  atgarder: "/atgarder",
  krigsorganisation: "/krigsorganisation",
  krigsplacering: "/krigsplacering",
  rsa: "/rsa",
  kontinuitet: "/kontinuitet",
  resurser: "/resurser",
  ovningar: "/ovningar",
  rapport: "/rapport",
  anvandare: "/anvandare",
  personuppgifter: "/personuppgifter",
  organisationer: "/organisationer",
  katalog: "/katalog",
};

export const ROLLER = [
  "administrator",
  "beredskapssamordnare",
  "sakerhetsskyddschef",
  "hr",
  "forvaltningschef",
  "kommunledning",
] as const;

export type Roll = (typeof ROLLER)[number];

export const ROLLNAMN: Record<Roll, string> = {
  administrator: "Systemadministratör",
  beredskapssamordnare: "Beredskapssamordnare",
  sakerhetsskyddschef: "Säkerhetsskyddschef",
  hr: "HR och personalförsörjning",
  forvaltningschef: "Förvaltningschef",
  kommunledning: "Kommunledning",
};

export const ROLLBESKRIVNING: Record<Roll, string> = {
  administrator: "Förvaltar användare och behörigheter. Full åtkomst till samtliga moduler.",
  beredskapssamordnare:
    "Driver beredskapsarbetet och ansvarar för planering, övning och rapportering. Full åtkomst utom användaradministration.",
  sakerhetsskyddschef:
    "Ansvarar för säkerhetsskydd, krigsorganisation och säkerhetsprövning. Får hantera krigsplacering.",
  hr: "Hanterar krigsplacering och bemanning. Ser inte risk-, kontinuitets- eller resursuppgifter.",
  forvaltningschef:
    "Ansvarar för den egna verksamhetens kontinuitet och resurser. Får inte se personuppgifter i krigsplaceringen.",
  kommunledning:
    "Följer beredskapsläget och tar fram underlag till nämnd. Läsrättigheter, inga ändringar.",
};

const I: Niva = "ingen";
const L: Niva = "las";
const S: Niva = "skriv";

/**
 * Krigsplaceringsmodulen innehåller personuppgifter och uppgifter om
 * säkerhetsprövning. Den är därför snävare satt än övriga moduler.
 *
 * Modulerna organisationer och katalog har skriv endast för administrator, men
 * rollen räcker inte: de kräver dessutom att användaren är leverantörspersonal.
 * Se kravLeverantor() i session.ts. Katalogen är delad av alla kunder, så en
 * ändring där är inte en åtgärd inom en organisation utan över alla.
 */
export const BEHORIGHET: Record<Roll, Record<Modul, Niva>> = {
  administrator: {
    oversikt: S, efterlevnad: S, atgarder: S, krigsorganisation: S, krigsplacering: S,
    rsa: S, kontinuitet: S, resurser: S, ovningar: S, rapport: S, anvandare: S, personuppgifter: S, organisationer: S, katalog: S,
  },
  beredskapssamordnare: {
    oversikt: S, efterlevnad: S, atgarder: S, krigsorganisation: S, krigsplacering: S,
    rsa: S, kontinuitet: S, resurser: S, ovningar: S, rapport: S, anvandare: I, personuppgifter: S, organisationer: I, katalog: I,
  },
  sakerhetsskyddschef: {
    oversikt: L, efterlevnad: S, atgarder: S, krigsorganisation: S, krigsplacering: S,
    rsa: L, kontinuitet: L, resurser: L, ovningar: L, rapport: L, anvandare: I, personuppgifter: S, organisationer: I, katalog: I,
  },
  hr: {
    oversikt: L, efterlevnad: I, atgarder: L, krigsorganisation: L, krigsplacering: S,
    rsa: I, kontinuitet: I, resurser: I, ovningar: I, rapport: I, anvandare: I, personuppgifter: L, organisationer: I, katalog: I,
  },
  forvaltningschef: {
    oversikt: L, efterlevnad: L, atgarder: S, krigsorganisation: L, krigsplacering: I,
    rsa: L, kontinuitet: S, resurser: S, ovningar: L, rapport: L, anvandare: I, personuppgifter: I, organisationer: I, katalog: I,
  },
  kommunledning: {
    oversikt: L, efterlevnad: L, atgarder: L, krigsorganisation: L, krigsplacering: L,
    rsa: L, kontinuitet: L, resurser: L, ovningar: L, rapport: L, anvandare: I, personuppgifter: L, organisationer: I, katalog: I,
  },
};

export function niva(roll: string, modul: Modul): Niva {
  const rad = BEHORIGHET[roll as Roll];
  return rad ? rad[modul] : "ingen";
}

export function farLasa(roll: string, modul: Modul): boolean {
  return niva(roll, modul) !== "ingen";
}

export function farSkriva(roll: string, modul: Modul): boolean {
  return niva(roll, modul) === "skriv";
}

/** Första modulen en roll kommer åt, att skicka användaren till efter inloggning. */
export function startsida(roll: string): string {
  const modul = MODULER.find((m) => farLasa(roll, m));
  return modul ? MODULVAG[modul] : "/ingen-behorighet";
}
