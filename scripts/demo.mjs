/**
 * Startar hela demon med ett kommando.
 *
 * Finns för att en demonstration inte ska bero på att fyra saker startas i rätt
 * ordning. Seedar databasen, bygger appen, startar test-utfärdaren för den
 * federerade inloggningen, startar appen och skriver ut körordningen.
 *
 *   npm run demo
 *
 * Kör medvetet produktionsbygget och inte utvecklingsservern. Den senare
 * kompilerar varje sida vid första besöket, vilket ger flera sekunders väntan
 * mitt i en demonstration. Använd npm run dev vid utveckling.
 *
 * Avslutas med Ctrl-C, som stänger allt som startats.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4010;

const fet = (t) => `\x1b[1m${t}\x1b[0m`;
const dim = (t) => `\x1b[2m${t}\x1b[0m`;
const gron = (t) => `\x1b[32m${t}\x1b[0m`;
const rod = (t) => `\x1b[31m${t}\x1b[0m`;

if (!existsSync(join(root, "node_modules"))) {
  console.error(rod("Beroenden saknas.") + " Kör " + fet("npm install") + " först.");
  process.exit(1);
}

// Databasen byggs om varje gång, så demon alltid börjar från samma läge. Det
// är hela poängen: en demonstration ska inte bero på vad någon ändrade sist.
process.stdout.write("Seedar databasen … ");
const seed = spawnSync("node", ["--experimental-sqlite", "scripts/seed.mjs"], {
  cwd: root, encoding: "utf8",
});
if (seed.status !== 0) {
  console.error(rod("misslyckades"));
  console.error(seed.stderr || seed.stdout);
  process.exit(1);
}
console.log(gron("klart"));
for (const rad of (seed.stdout || "").trim().split("\n")) {
  if (rad.startsWith("Seedat") || rad.startsWith("Register") || rad.startsWith("Kravkatalog")) {
    console.log(dim("  " + rad));
  }
}

// Bygget körs varje gång. Det tar några sekunder och gör att demon startar i
// samma skick oavsett om någon senast körde utvecklingsservern, som använder
// samma .next-katalog.
process.stdout.write("Bygger appen … ");
const bygge = spawnSync("npx", ["next", "build"], { cwd: root, encoding: "utf8" });
if (bygge.status !== 0) {
  console.error(rod("misslyckades"));
  console.error(bygge.stdout || bygge.stderr);
  process.exit(1);
}
console.log(gron("klart"));

const barn = [];
function starta(namn, kommando, argument) {
  const p = spawn(kommando, argument, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  p.stdout.on("data", (d) => process.stdout.write(dim(`[${namn}] `) + d));
  p.stderr.on("data", (d) => process.stderr.write(dim(`[${namn}] `) + d));
  p.on("exit", (kod) => {
    if (kod !== 0 && kod !== null) console.error(rod(`[${namn}] avslutades med ${kod}`));
  });
  barn.push(p);
  return p;
}

let avslutar = false;
function avsluta() {
  if (avslutar) return;
  avslutar = true;
  console.log("\nStänger demon …");
  for (const p of barn) p.kill("SIGTERM");
  setTimeout(() => process.exit(0), 600);
}
process.on("SIGINT", avsluta);
process.on("SIGTERM", avsluta);

starta("utfärdare", "node", ["scripts/test-idp.mjs"]);
starta("app", "npx", ["next", "start", "-p", String(PORT)]);

// Väntar in appen innan körordningen skrivs ut, så den inte hamnar ovanför
// ramverkets egna rader.
const bas = `http://localhost:${PORT}`;
for (let i = 0; i < 60 && !avslutar; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  try {
    const svar = await fetch(`${bas}/logga-in`);
    if (svar.ok) break;
  } catch {
    // Appen startar fortfarande.
  }
}
if (avslutar) process.exit(0);

console.log(`
${fet("Beredskapsnavet – demo")}   ${bas}

${fet("Körordning som visar produkten")}

 1. ${fet("Logga in som beredskapssamordnare")}  marika.ohlund@angsholm.se / beredskap2026
    Översikten är en prioriterad lista sammanvägd ur alla moduler. Peka på att
    raderna kommer från olika håll: en vakans ur krigsplaceringen, ett förfallet
    lagkrav, en resurs ur drift.

 2. ${fet("Krigsplacering")}  →  de automatiska kontrollerna
    Samrådsplikt mot Försvarsmakten, dubbelplaceringar, utgången registerkontroll
    och vakanser på oumbärliga befattningar. Det här är arbetet som annars görs
    för hand mot fyra kalkylblad.

 3. ${fet("Övning")}  →  ${fet("Åtgärdsregister")}  →  ${fet("Lagkrav")}
    Följ en brist från en övning till en åtgärd med ansvarig och datum, och vidare
    till det lagkrav den styrker. Kopplingen är poängen, inte modulerna.

 4. ${fet("Byt till Region Västmark")}  helena.krantz@regionvastmark.se / vastmark2026
    Samma katalog, annan kravlista: katastrofmedicinsk beredskap och smittskydd
    i stället för vattentjänster och styrel. Visa NIS2-kravet — regionen har två
    tillsynsmyndigheter, kommunen en.

 5. ${fet("Logga in som leverantör")}  elsa.wikner@beredskapsnavet.se / leverantor2026
    ${fet("Anslutna organisationer")}: alla 310 i landet, kundens egen kommun finns
    redan. Anslut den och visa att kravlistan skapas ur katalogen direkt.
    ${fet("Kravkatalogen")}: rätta ett lagrum och peka på "slår igenom hos N
    organisationer". Det är det återkommande värdet — och LKRB-omläggningen
    1 januari 2027 är det som gör det akut.

 6. ${fet("Logga in som kommunledning")}  henrik.lindgren@angsholm.se / ledning2026
    Alla ändringsmöjligheter försvinner. Behörigheten är per modul och roll.

 7. ${fet("Federerad inloggning")}
    Logga ut och välj "Logga in med Nordmarks kommunkonto". Inloggningen går mot
    test-utfärdaren på port 4011. Flerfaktor kontrolleras mot vad utfärdaren
    faktiskt gjorde.

${fet("Att vara ärlig om när frågan kommer")}
 · SMITTSKYDD är markerat "Ej avstämd mot källa" — lagrummet är inte verifierat.
 · SOSFS 2013:22 om katastrofmedicinsk beredskap upphörde vid utgången av 2025.
 · Gallringsfrister beslutas av kundens arkivmyndighet, inte av systemet.
 · Två kategorier av personuppgifter har med flit ingen frist satt i demon.

${dim("Ctrl-C stänger appen och utfärdaren.")}
`);
