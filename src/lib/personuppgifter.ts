/**
 * Registerförteckning enligt artikel 30 i dataskyddsförordningen.
 *
 * Förteckningen ligger i kod och inte i databasen, av samma skäl som
 * behörighetsmatrisen: den är en policy som ska granskas och versionshanteras,
 * inte data som ändras i drift. Varje kategori anger ändamål, rättslig grund
 * och vad som styr gallringen.
 *
 * VIKTIGT OM GALLRING. Gallringsfristerna står INTE här. En kommuns gallring
 * styrs av arkivlagen (1990:782) och kommunens egen dokumenthanteringsplan,
 * beslutad av arkivmyndigheten. En frist inbyggd i ett system vore en gissning
 * som ser ut som ett lagkrav. Fristen beslutas därför per kommun och lagras i
 * tabellen gallringsregler; tills den är beslutad visas kategorin som
 * obeslutad.
 *
 * Förteckningen är framtagen som arbetsunderlag och ersätter inte kommunens
 * eget dataskyddsarbete. Den ska granskas av kommunens dataskyddsombud.
 */

export type Kategori = {
  nyckel: string;
  namn: string;
  andamal: string;
  /** Vilka uppgifter som behandlas. */
  uppgifter: string;
  /** Rättslig grund enligt artikel 6, och artikel 9 eller 10 där det behövs. */
  rattslig_grund: string;
  /** Författningen som ålägger kommunen uppgiften. */
  forpliktelse: string;
  /** Vad som utlöser gallringsfristen. */
  gallringsutlosare: string;
  /** Vem uppgifterna kan lämnas till. */
  mottagare: string;
  /** Sant för uppgifter som kräver särskild försiktighet. */
  kanslig: boolean;
};

export const PERSONUPPGIFTER: Kategori[] = [
  {
    nyckel: "krigsplacering",
    namn: "Krigsplacering av personal",
    andamal:
      "Att bemanna kommunens krigsorganisation och kunna underrätta den enskilde om " +
      "placeringen.",
    uppgifter:
      "Namn, personnummer, anställning, verksamhet, kontaktuppgifter och vilken " +
      "befattning personen är placerad på.",
    rattslig_grund:
      "Artikel 6.1 c: behandlingen är nödvändig för att fullgöra en rättslig " +
      "förpliktelse. Personnummer behandlas med stöd av 3 kap. 10 § dataskyddslagen " +
      "(2018:218), eftersom en förväxling vid krigsplacering inte är acceptabel.",
    forpliktelse:
      "3 kap. 15 § lagen (1994:1809) om totalförsvarsplikt samt 7–9 §§ förordningen " +
      "(1995:238) om totalförsvarsplikt.",
    gallringsutlosare:
      "Att placeringen upphört eller anställningen avslutats, beroende på vilket som " +
      "inträffar först.",
    mottagare:
      "Plikt- och prövningsverket och Försvarsmakten vid samråd om en person som redan " +
      "är krigsplacerad eller har annan plikt.",
    kanslig: true,
  },
  {
    nyckel: "sakerhetsprovning",
    namn: "Säkerhetsprövning och registerkontroll",
    andamal:
      "Att pröva om en person får placeras på en befattning i säkerhetsklass, och att " +
      "följa upp att kontrollen är giltig.",
    uppgifter:
      "Säkerhetsklass, status för registerkontroll och datum. Innehållet i en " +
      "registerkontroll lagras inte i systemet.",
    rattslig_grund:
      "Artikel 6.1 c jämförd med artikel 10: uppgifter som rör lagöverträdelser får " +
      "behandlas under kontroll av myndighet. Säkerhetsskyddslagen ger den kontrollen.",
    forpliktelse:
      "Säkerhetsskyddslagen (2018:585) 3 kap. samt säkerhetsskyddsförordningen (2021:955).",
    gallringsutlosare:
      "Att befattningen inte längre är placerad i säkerhetsklass, eller att personen " +
      "lämnat den.",
    mottagare: "Säkerhetspolisen vid begäran om registerkontroll.",
    kanslig: true,
  },
  {
    nyckel: "kontaktuppgifter",
    namn: "Kontaktuppgifter för beredskapsorganisationen",
    andamal:
      "Att nå rätt person vid larm, övning och höjd beredskap.",
    uppgifter: "Namn, befattning, e-postadress och telefonnummer.",
    rattslig_grund:
      "Artikel 6.1 c och 6.1 e: rättslig förpliktelse och uppgift av allmänt intresse.",
    forpliktelse:
      "Lag (2006:544) om extraordinära händelser, 2 kap., samt överenskommelsen om " +
      "kommunernas arbete med krisberedskap och civilt försvar.",
    gallringsutlosare: "Att anställningen eller uppdraget upphört.",
    mottagare: "Inga utanför kommunen vid normal drift.",
    kanslig: false,
  },
  {
    nyckel: "ovningsdeltagande",
    namn: "Deltagande i övning och utbildning",
    andamal:
      "Att visa att kommunen genomfört den utbildning och övning som krävs, och att " +
      "följa upp erfarenheter.",
    uppgifter: "Namn eller befattning, övning och datum.",
    rattslig_grund: "Artikel 6.1 c: rättslig förpliktelse.",
    forpliktelse: "Lag (2006:544) om extraordinära händelser, 2 kap. 8 §.",
    gallringsutlosare:
      "Att underlaget inte längre behövs för rapportering eller tillsyn. Observera att " +
      "övningsdokumentation ofta ska bevaras enligt dokumenthanteringsplanen.",
    mottagare: "Länsstyrelsen vid tillsyn och vid den årliga rapporteringen.",
    kanslig: false,
  },
  {
    nyckel: "anvandarkonton",
    namn: "Användarkonton och spårbarhetslogg",
    andamal:
      "Att styra åtkomsten till systemet och kunna visa vem som gjort vad, vilket krävs " +
      "vid tillsyn och i säkerhetsskyddsanalysen.",
    uppgifter:
      "Namn, e-postadress, roll, inloggningstidpunkter och vidtagna åtgärder.",
    rattslig_grund:
      "Artikel 6.1 c och 6.1 f: rättslig förpliktelse samt berättigat intresse av " +
      "spårbarhet i ett system som innehåller uppgifter om säkerhetsprövning.",
    forpliktelse: "Säkerhetsskyddslagen (2018:585) 2 kap. 1 §.",
    gallringsutlosare: "Att kontot avslutats. Loggen har normalt en längre frist än kontot.",
    mottagare: "Tillsynsmyndighet vid granskning.",
    kanslig: false,
  },
];

export const KATEGORI = Object.fromEntries(
  PERSONUPPGIFTER.map((k) => [k.nyckel, k]),
) as Record<string, Kategori>;
