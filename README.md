# Beredskapsnavet

Samlat arbetsverktyg för kommunal krisberedskap och civilt försvar. Byggt för den
roll som idag gör jobbet i Excel och Word: beredskapssamordnaren i en kommun.

En installation betjänar flera kommuner. Demodatan innehåller tre fiktiva
kommuner i olika mognadsgrad:

| Kommun | Invånare | Ansluten | Läge |
| --- | --- | --- | --- |
| Ängsholms kommun | 31 420 | mars 2025 | Inarbetad, fylld med data |
| Nordmarks kommun | 9 840 | januari 2026 | Halvvägs, krigsorganisation ej bemannad |
| Vreta kommun | 4 215 | september 2026 | Nyansluten, nästan tom |

Alla personer, anläggningar och diarienummer är påhittade.

## Kom igång

```bash
npm install
npm run db:reset   # skapar och seedar db/beredskap.db
npm run dev        # http://localhost:4010
```

Produktionsbygge: `npm run build && npm start`.

## Vad produkten löser

Varje kommun har samma lagstadgade uppgifter: risk- och sårbarhetsanalys,
krigsorganisation, krigsplacering av personal, kontinuitetsplanering för
samhällsviktig verksamhet, övning och utbildning samt årlig rapportering till
länsstyrelsen. Underlagen ligger i dag utspridda i kalkylblad, och ingen av dem
talar med någon annan.

Beredskapsnavet håller ihop dem i en modell och drar slutsatser över modulgränserna:

- **Översikt** – en prioriterad lista över vad som behöver göras härnäst,
  sammanvägd från alla moduler.
- **Lagkrav och efterlevnad** – kommunens skyldigheter med status, ansvarig,
  förfallodatum och vilket underlag som styrker kravet.
- **Krigsorganisation** – befattningar med uppgift, kritikalitet och säkerhetsklass.
- **Krigsplacering** – person mot befattning, med automatiska kontroller av
  samrådsplikt mot Försvarsmakten, annan plikt, dubbelplaceringar, saknad
  registerkontroll och vakanser på oumbärliga befattningar.
- **Risk- och sårbarhetsanalys** – risklista och riskmatris, bedömning kan
  ändras direkt i listan.
- **Kontinuitetshantering** – samhällsviktig verksamhet med tolererad
  avbrottstid mot bedömd faktisk, plus kartlagda beroenden och sårbarheter.
- **Resurser och förnödenheter** – reservkraft, drivmedel, nödvatten, samband
  och förråd med placering, ansvarig och kontrollintervall.
- **Övning och utbildning** – övningsplan, erfarenheter och de åtgärder som
  erfarenheterna ledde till.
- **Åtgärdsregister** – allt som ska göras, oavsett var det upptäcktes.
- **Användare och behörighet** – konton, roller, behörighetsmatris, aktiva
  sessioner och spårbarhetslogg.
- **Beredskapsrapport** – utskriftsfärdigt underlag med en samlad bedömning som
  skrivs av systemet ur aktuell data, plus CSV-export per modul.

Den egentliga poängen är kopplingen: en brist upptäckt i en övning blir en
åtgärd med ansvarig och datum, som syns på översikten, och som styrker ett
lagkrav i rapporten till länsstyrelsen.

## Teknik

| Del | Val | Motiv |
| --- | --- | --- |
| Ramverk | Next.js 15, App Router, React 19 | Serverrendering, inga API-lager att underhålla |
| Databas | SQLite via inbyggda `node:sqlite` | Noll externa beroenden, kan driftas i egen miljö |
| Mutationer | Server actions | Fungerar utan klient-JavaScript där det går |
| Utseende | Tailwind CSS v4 | Designtokens i `src/app/globals.css` |
| Inloggning | Sessioner i databasen, scrypt-hashade lösenord | Sessioner kan återkallas, vilket krävs vid avslutad anställning |

Ingen extern tjänst anropas i runtime. Hela installationen kan köras på en
server i kommunens eget nät, vilket är ett krav hos de flesta köpare i
segmentet.

### Kodkarta

```
db/schema.sql          Datamodell
scripts/seed.mjs       Demodata för Ängsholms kommun
src/lib/db.ts          Anslutning, frågehjälpare, spårbarhetslogg
src/lib/queries.ts     Alla läsningar och de automatiska kontrollerna
src/lib/actions.ts     Alla skrivningar, loggade
src/lib/domain.ts      Begrepp, etiketter och färgsättning på ett ställe
src/lib/behorighet.ts  Roller och behörighetsmatris per modul
src/lib/session.ts     Sessioner, lösenord och spärrarna kravLas/kravSkriv
src/app/(app)/         Skyddade sidor, en modul per katalog
src/app/logga-in/      Publik inloggningssida
src/app/api/export/    CSV-export (semikolon och BOM, för svensk Excel)
```

## Flera kommuner i samma installation

Varje tabell som bär kunddata har en `org_id`, och varje fråga filtrerar på den
organisation sessionen arbetar i. Sessionen bär alltså både användare och aktiv
organisation.

En användare kopplas till organisationer genom `user_orgs`, med **en roll per
organisation**. Samma person kan därför vara systemadministratör i en kommun och
ha ren läsbehörighet i en annan, vilket är vad driftpersonal hos en leverantör
behöver. Den som har flera organisationer byter i topbaren; bytet kräver
medlemskap och kontrolleras på servern.

Isoleringen vilar på tre saker:

1. **Läsning.** Varje fråga i `src/lib/queries.ts` tar `orgId` och filtrerar på
   den. Även underfrågor filtreras, eftersom en koppling på namn (en åtgärd mot
   en risk, till exempel) annars hade kunnat matcha en annan kommuns rad.
2. **Skrivning.** Varje `UPDATE` har `AND org_id = ?`, och hjälpfunktionen
   `skrivEn` kastar fel om ingen rad träffades. Ett id från en annan kommun går
   alltså inte igenom, och misslyckas dessutom högljutt i stället för tyst.
3. **Administration.** Användarlistan och rollbyten gäller medlemskapet i den
   aktiva organisationen. En administratör i en kommun ser inte ens att en person
   har behörighet i en annan.

Kravkatalogen är i dag kopierad per kommun. Lagkraven är desamma för alla, så
nästa steg är en delad katalog med status per organisation, så att en rättad
lagrumshänvisning slår igenom hos alla på en gång. Det som faktiskt skiljer sig
mellan kommuner, som antal anställda och vilken länsstyrelse som utövar tillsyn
enligt cybersäkerhetsförordningen, räknas ut per organisation vid seedning.

## Behörighet

Åtkomsten styrs per modul i tre nivåer: ingen, läsa, ändra. Matrisen ligger i
`src/lib/behorighet.ts` och inte i databasen, eftersom den är en policy som ska
granskas och versionshanteras. Vilken roll en enskild användare har ligger
däremot i databasen och kan ändras i gränssnittet.

Sex roller finns: systemadministratör, beredskapssamordnare, säkerhetsskyddschef,
HR, förvaltningschef och kommunledning. Krigsplaceringsmodulen är snävare satt än
övriga, eftersom den innehåller personuppgifter och uppgifter om
säkerhetsprövning: en förvaltningschef kommer inte åt den alls.

Spärrarna sitter på tre ställen, och den avgörande är den sista:

1. `(app)/layout.tsx` kräver inloggning, så att ramverket aldrig visas för en
   oinloggad användare.
2. Varje sida anropar `kravLas(modul)` och döljer dessutom de kontroller som
   användaren inte får använda.
3. Varje serveråtgärd inleder med `kravSkriv(modul)`. Det är den kontrollen som
   faktiskt hindrar en skrivning, eftersom en serveråtgärd kan anropas utan att
   gränssnittet varit inblandat.

CSV-exporten kontrolleras separat i `src/app/api/export/[typ]/route.ts`, och
kräver läsbehörighet både till modulen och till rapportmodulen. Den andra låsningen
är medveten: en CSV-fil lämnar systemets spårbarhet, och massuttag av
personuppgifter ska vara en snävare behörighet än att läsa samma uppgifter på
skärmen.

Nekad åtkomst och nekad skrivning loggas med användare, tidpunkt och modul.
Ändrad roll och avaktiverat konto återkallar användarens sessioner direkt, så att
ändringen inte väntar på att personen loggar ut.

### Demokonton

| Konto | E-post | Lösenord | Åtkomst |
| --- | --- | --- | --- |
| Beredskapssamordnare | marika.ohlund@angsholm.se | beredskap2026 | Ängsholm |
| Säkerhetsskyddschef | pontus.ahlberg@angsholm.se | sakerhet2026 | Ängsholm |
| HR | sara.molin@angsholm.se | personal2026 | Ängsholm |
| Förvaltningschef | annika.bergstrom@angsholm.se | social2026 | Ängsholm |
| Kommunledning | henrik.lindgren@angsholm.se | ledning2026 | Ängsholm |
| Systemadministratör | jens.akerlund@angsholm.se | drift2026 | Ängsholm |
| Beredskapssamordnare | tove.bergqvist@nordmark.se | nordmark2026 | Nordmark |
| Beredskapssamordnare | johan.stenmark@vreta.se | vreta2026 | Vreta |
| Driftansvarig, leverantör | elsa.wikner@beredskapsnavet.se | leverantor2026 | Alla tre, olika roll |

Två demos värda att köra: logga in som kommunledning för att visa att
ändringsmöjligheter försvinner, och som Elsa för att byta organisation i
topbaren. Hon är systemadministratör i Nordmark och Vreta men bara
kommunledning i Ängsholm, så administrationsmodulen försvinner när hon byter.

## Vad som återstår före skarp drift

Demon är komplett som produktdemo men inte som driftsatt system. Följande
saknas medvetet:

1. **Federerad inloggning.** Behörighetsmodellen är på plats, men lösenorden är
   lokala. Skarp drift behöver inloggning mot kommunens katalogtjänst med
   flerfaktorsautentisering. Roller och behörighetsmatris kan vara kvar som de är.
   Lösenordsbyte, kontoskapande och återställning saknas helt, eftersom de
   funktionerna försvinner med federerad inloggning.
2. **Personuppgiftshantering.** Personnummer visas maskerade och åtkomsten är
   begränsad per roll, men krigsplacering kräver också dokumenterad rättslig
   grund och gallringsrutin.
3. **Integrationer.** Personalregistret bör hämtas från kommunens HR-system i
   stället för att matas in.
4. **Bevakning av rättsläget.** Lagrum, intervall och förfallodatum är
   kontrollerade mot författningstexten i oktober 2026, och varje krav bär en
   källhänvisning och en rättslig status i gränssnittet. Regelverket är dock
   under omarbetning: LEH föreslås ersättas av lagen om kommuners och regioners
   grundläggande beredskap (LKRB) den 1 januari 2027 enligt prop. 2026/27:5, som
   ännu inte var beslutad i riksdagen, och överenskommelsen med MCF och SKR löper
   ut vid årsskiftet. Kravlistan måste stämmas av på nytt när riksdagen beslutat,
   och det är i sig ett argument för att köpa ett system i stället för att hålla
   listan själv i ett kalkylblad.

   Cybersäkerhetslagen (2025:1506) är kontrollerad och inlagd. Kommuner omfattas
   uttryckligen enligt 1 kap. 3 §, kommunfullmäktige är undantaget enligt 14 §,
   och en kommun som är större än medelstor är väsentlig verksamhetsutövare.
   Demokommunens tillsynsmyndighet följer av cybersäkerhetsförordningen
   (2025:1507) och är Länsstyrelsen i Örebro län. Den kopplingen mellan län och
   tillsynsmyndighet behöver sättas per kund.
5. **Delad kravkatalog.** Lagkraven kopieras i dag per kommun. De bör ligga i en
   gemensam katalog med status per organisation, så att en rättad
   lagrumshänvisning når alla kunder samtidigt.
6. **Organisationsadministration.** Nya kommuner och nya konton läggs in genom
   seedning. Ett gränssnitt för att lägga upp en kommun, bjuda in användare och
   ge behörighet saknas.
