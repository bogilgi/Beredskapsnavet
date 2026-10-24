/**
 * Prövar att tre vägar förbi behörighetsgränsen är stängda, mot den körande
 * appen och den riktiga databasen.
 *
 * Vägarna hittades i en säkerhetsgranskning av grenen. Alla tre delar samma
 * form: kontrollen var riktig men gällde en organisation, medan det som
 * ändrades — kontot och dess medlemskap — gäller hela installationen.
 *
 *   npm run demo            # i en terminal
 *   npm run prov-behorighet # i en annan
 *
 * Provet skiljer sig från testerna i tests/ på en punkt som är hela poängen:
 * det anropar serveråtgärderna genom gränssnittet, med en riktig session, och
 * läser sedan databasen för att se om något faktiskt ändrades. Ett test som
 * bara kallar på en regelfunktion visar att regeln är riktig, inte att den
 * sitter i vägen.
 *
 * Playwright är inte ett beroende i projektet: det behövs bara för
 * granskningen och ska inte följa med in i driften.
 */
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BAS = process.env.BEREDSKAP_BAS || "http://localhost:4010";
const DB = process.env.BEREDSKAP_DB || join(root, "db", "beredskap.db");

// Administratör i Ängsholm, utan leverantörsflaggan. Det är rollen angreppen
// utgår från: störst behörighet i en kommun, ingen utanför den.
const ANGRIPARE = { epost: "jens.akerlund@angsholm.se", losenord: "drift2026" };
// Leverantörskonto, och dessutom medlem i Ängsholm med en roll som inte
// ändrar något. Kontot når tre andra organisationer och kravkatalogen.
const MAL = "elsa.wikner@beredskapsnavet.se";
// Konto i en annan kommun, utan behörighet i Ängsholm.
const UTOMSTAENDE = "tove.bergqvist@nordmark.se";
// Konto som bara finns i Ängsholm: återställningen ska fortfarande fungera.
const EGEN = "sara.molin@angsholm.se";

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error(
    "Saknar playwright. Installera granskningsverktygen:\n\n" +
    "  npm i --no-save playwright && npx playwright install chromium\n",
  );
  process.exit(2);
}

try {
  const svar = await fetch(`${BAS}/logga-in`);
  if (!svar.ok) throw new Error(String(svar.status));
} catch {
  console.error(`Appen svarar inte på ${BAS}. Starta den med npm run demo först.`);
  process.exit(2);
}

const db = new DatabaseSync(DB, { readOnly: true });
const en = (sql, ...p) => db.prepare(sql).get(...p);

const orgId = (kortnamn) =>
  en("SELECT id FROM organisations WHERE kortnamn = ?", kortnamn)?.id;
const userId = (epost) => en("SELECT id FROM users WHERE epost = ?", epost)?.id;

const ANGSHOLM = orgId("angsholm");
const MAL_ID = userId(MAL);
const UTOM_ID = userId(UTOMSTAENDE);
if (!ANGSHOLM || !MAL_ID || !UTOM_ID) {
  console.error("Demodatan ser inte ut som provet förväntar. Kör npm run db:reset.");
  process.exit(2);
}

/*
 * Förutsättningen för inbjudningsangreppet är att det utomstående kontot INTE
 * har behörighet i Ängsholm: har det redan det vägras inbjudan som dubblett,
 * och provet hade då mätt fel sak och sagt ok.
 *
 * Har ett tidigare prov lyckats lägga på medlemskapet står det kvar i
 * databasen. Provet vägrar då hellre än att tolka tystnaden som ett godkänt
 * utfall.
 */
const redanMedlem = en(
  "SELECT roll FROM user_orgs WHERE user_id = ? AND org_id = ?", UTOM_ID, ANGSHOLM,
);
if (redanMedlem) {
  console.error(
    `${UTOMSTAENDE} har redan behörighet i Ängsholm (${redanMedlem.roll}).\n` +
    "Antingen har ett tidigare prov lyckats lägga på medlemskapet, eller så har\n" +
    "demodatan ändrats. Provet kan inte mäta angreppet mot det läget.\n\n" +
    "  npm run db:reset   # och starta om appen\n",
  );
  process.exit(2);
}

const resultat = [];
const notera = (namn, ok, detalj = "") => {
  resultat.push({ namn, ok });
  console.log(`${ok ? "ok  " : "FEL "} ${namn}${detalj ? "  — " + detalj : ""}`);
};

const egenWebblasare = process.env.BEREDSKAP_CHROMIUM;
const webb = await chromium.launch(egenWebblasare ? { executablePath: egenWebblasare } : {});
const sida = await (await webb.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();

/* ------------------------------------------------------------- logga in */

await sida.goto(`${BAS}/logga-in`);
await sida.fill('input[name="epost"]', ANGRIPARE.epost);
await sida.fill('input[name="losenord"]', ANGRIPARE.losenord);
await sida.click('button[type="submit"]');
await sida.waitForURL((u) => !u.pathname.includes("logga-in"), { timeout: 20000 }).catch(() => {});
notera("Angriparen är inloggad som administratör i Ängsholm",
  !new URL(sida.url()).pathname.includes("logga-in"));

/* ------------------------------- 1. återställningslistan erbjuder inte målet */

await sida.goto(`${BAS}/anvandare`, { waitUntil: "networkidle" });

const valen = await sida.$$eval(
  'select[name="user_id"] option', (o) => o.map((e) => e.textContent.trim()),
);
notera(
  "Målkontot erbjuds inte i återställningslistan",
  !valen.some((v) => v.includes(MAL)),
  `${valen.length} konton i listan`,
);
notera(
  "Egna kommunens konton erbjuds fortfarande",
  valen.some((v) => v.includes(EGEN)),
  "annars är spärren bredare än felet",
);

const sidtext = await sida.innerText("body");
notera(
  "Sidan säger varför kontot inte går att återställa",
  sidtext.includes(MAL) && /återställs inte härifrån/i.test(sidtext),
);

/* ------------------- 2. servern vägrar även när valet läggs tillbaka i DOM:en */

// Spärren i gränssnittet är en bekvämlighet. Den som skickar formuläret ändå
// ska mötas av serverns vägran, och ingen återställning får skapas.
const foreResets = en(
  "SELECT COUNT(*) AS v FROM password_resets WHERE user_id = ?", MAL_ID,
).v;

await sida.evaluate((id) => {
  const valjare = document.querySelector('select[name="user_id"]');
  const alt = document.createElement("option");
  alt.value = String(id);
  alt.textContent = "injicerat";
  valjare.appendChild(alt);
  valjare.value = String(id);
}, MAL_ID);
await sida.click('form:has(select[name="user_id"]) button[type="submit"]');
await sida.waitForTimeout(3000);

const efterResets = en(
  "SELECT COUNT(*) AS v FROM password_resets WHERE user_id = ?", MAL_ID,
).v;
notera(
  "Servern skapar ingen återställning för kontot",
  efterResets === foreResets,
  `${foreResets} före, ${efterResets} efter`,
);

const svarstext = await sida.innerText("body");
notera(
  "Vägran har ett besked som säger vad som gäller",
  /leverantörskonto|behörighet utanför|görs av leverantören/i.test(svarstext),
);

/* --------------- 3. en inbjudan till ett befintligt konto löses inte in av den
                      som bjöd in */

const foreMedlem = en(
  "SELECT COUNT(*) AS v FROM user_orgs WHERE user_id = ? AND org_id = ?", UTOM_ID, ANGSHOLM,
).v;

await sida.goto(`${BAS}/anvandare`, { waitUntil: "networkidle" });

// En obesvarad inbjudan från ett tidigare prov gör att nästa vägras som
// dubblett, och provet hade då mätt fel sak. Den återkallas först, så att
// provet går att köra om utan att databasen seedas mellan gångerna.
const oppen = en(
  "SELECT id FROM invitations WHERE org_id = ? AND epost = ? AND accepterad IS NULL",
  ANGSHOLM, UTOMSTAENDE,
);
if (oppen) {
  // Återkallandet frågar med window.confirm, och Playwright avvisar dialoger
  // som standard. Utan det här hade knappen inte gjort något.
  sida.once("dialog", (d) => d.accept());
  await sida.locator(`tr:has-text("${UTOMSTAENDE}") button`).first().click();
  await sida.waitForTimeout(2500);
  await sida.goto(`${BAS}/anvandare`, { waitUntil: "networkidle" });
  if (en(
    "SELECT id FROM invitations WHERE org_id = ? AND epost = ? AND accepterad IS NULL",
    ANGSHOLM, UTOMSTAENDE,
  )) {
    console.error(
      `Kunde inte återkalla den obesvarade inbjudan till ${UTOMSTAENDE}.\n` +
      "Provet kan inte skapa en ny och mäter därför inget. Kör npm run db:reset.\n",
    );
    process.exit(2);
  }
}

await sida.fill('input[name="epost"]', UTOMSTAENDE);
await sida.selectOption('select[name="roll"]', "administrator");
await sida.click('form:has(input[name="epost"]) button[type="submit"]');
await sida.waitForTimeout(3000);

const medSvar = await sida.innerText("body");
const lank = medSvar.match(/\/inbjudan\?i=\d+&t=[\w-]+/);
notera("Inbjudan skapas och länken lämnas till den som bjöd in",
  Boolean(lank), lank ? "länk i svaret" : "ingen länk i svaret");

if (lank) {
  // Angriparen öppnar länken själv, med sin egen session. Det är hela
  // angreppet: inbjudan är bunden till en adress, inte till en person.
  await sida.goto(`${BAS}${lank[0]}`, { waitUntil: "networkidle" });
  const inbjudanstext = await sida.innerText("body");
  const knappar = await sida.$$eval("button", (b) => b.map((e) => e.textContent.trim()));

  const erbjuds = knappar.some((k) => /Lägg till behörigheten/i.test(k));
  notera(
    "Länken erbjuder inte att lägga till behörigheten",
    !erbjuds,
    knappar.length ? knappar.join(", ") : "inga knappar",
  );
  if (erbjuds) {
    // Erbjuds den ska den också tryckas, så att nästa kontroll mäter vad
    // servern gör och inte bara vad sidan visar.
    await sida.click("button:has-text('Lägg till behörigheten')");
    await sida.waitForTimeout(3000);
  }
  notera(
    "Sidan hänvisar till kontots ägare",
    new RegExp(`[Ll]ogga in som\\s+${UTOMSTAENDE}`).test(inbjudanstext.replace(/\s+/g, " ")),
  );
}

const efterMedlem = en(
  "SELECT COUNT(*) AS v FROM user_orgs WHERE user_id = ? AND org_id = ?", UTOM_ID, ANGSHOLM,
).v;
notera(
  "Inget medlemskap läggs på kontot",
  efterMedlem === foreMedlem,
  `${foreMedlem} före, ${efterMedlem} efter`,
);

/* ----------- 4. en organisations utfärdare kan inte intyga någon annans adress */

/*
 * Den federerade inloggningen slog upp kontot på e-postadressen i id-token,
 * och adressen står i den token utfärdaren själv har skrivit. Varje
 * organisation konfigurerar sin egen utfärdare, så var och en av dem kunde
 * intyga vilken adress som helst i installationen.
 *
 * Flödet drivs med fetch och inte i webbläsaren, eftersom provet behöver
 * ändra adressen i utfärdarens /authorize — det är den enda punkt där
 * angriparen, som äger utfärdaren, gör något annat än en vanlig användare.
 */
const IDP = process.env.BEREDSKAP_IDP || "http://localhost:4011";
try {
  const svar = await fetch(`${IDP}/.well-known/openid-configuration`);
  if (!svar.ok) throw new Error(String(svar.status));
} catch {
  console.error(
    `\nTest-utfärdaren svarar inte på ${IDP}. Den startas av npm run demo,\n` +
    "och utan den går den federerade delen av provet inte att köra.\n",
  );
  await webb.close();
  db.close();
  process.exit(2);
}

/** Går hela OIDC-flödet och svarar med var vi hamnade, och sessionskakan. */
async function federeradInloggning(kortnamn, demoEpost) {
  const start = await fetch(`${BAS}/api/auth/start?org=${kortnamn}`, { redirect: "manual" });
  const authorize = start.headers.get("location");
  if (!authorize) return { fel: "ingen omdirigering till utfärdaren" };

  // Angriparen äger utfärdaren och bestämmer vad den intygar.
  const url = new URL(authorize);
  url.searchParams.set("demo_epost", demoEpost);
  const svar = await fetch(url, { redirect: "manual" });
  const tillbaka = svar.headers.get("location");
  if (!tillbaka) return { fel: "utfärdaren skickade ingen kod" };

  const callback = await fetch(new URL(tillbaka, BAS), { redirect: "manual" });
  const slut = new URL(callback.headers.get("location") ?? "/", BAS);
  return {
    sokvag: slut.pathname,
    felkod: slut.searchParams.get("fel"),
    kaka: /beredskap[^=]*=/.test(callback.headers.get("set-cookie") ?? ""),
  };
}

const MAL_FORE = en(
  "SELECT COUNT(*) AS v FROM sessions WHERE user_id = ?", MAL_ID,
).v;

const angrepp = await federeradInloggning("nordmark", MAL);
notera(
  "Utfärdaren får inte intyga en adress utanför sin domän",
  angrepp.felkod === "doman-ej-tillaten",
  `hamnade på ${angrepp.sokvag}${angrepp.felkod ? "?fel=" + angrepp.felkod : ""}`,
);
notera(
  "Ingen session skapas för det intygade kontot",
  !angrepp.kaka && en("SELECT COUNT(*) AS v FROM sessions WHERE user_id = ?", MAL_ID).v === MAL_FORE,
);

// Och den riktiga inloggningen ska fortfarande fungera, annars är spärren
// bredare än felet.
const riktig = await federeradInloggning("nordmark", "tove.bergqvist@nordmark.se");
notera(
  "Den egna domänens användare loggar in federerat",
  riktig.felkod === null && riktig.kaka,
  `hamnade på ${riktig.sokvag}${riktig.felkod ? "?fel=" + riktig.felkod : ""}`,
);
notera(
  "Kontot binds till utfärdarens sub, inte till adressen",
  Boolean(en(
    "SELECT sub FROM federated_identities WHERE user_id = ?",
    userId("tove.bergqvist@nordmark.se"),
  )),
);

await webb.close();
db.close();

const fel = resultat.filter((r) => !r.ok);
console.log();
if (fel.length === 0) {
  console.log(`Samtliga ${resultat.length} kontroller stängda.`);
  console.log("Provet gäller de vägar granskningen hittade, inte alla vägar.");
  process.exit(0);
}
console.log(`${fel.length} av ${resultat.length} kontroller misslyckades.`);
process.exit(1);
