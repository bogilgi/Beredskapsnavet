# Beredskapsnavet

Samlat arbetsverktyg för kommunal krisberedskap och civilt försvar. Byggt för den
roll som idag gör jobbet i Excel och Word: beredskapssamordnaren i en kommun.

En installation betjänar flera kommuner **och regioner**. Demodatan innehåller
fyra fiktiva organisationer i olika mognadsgrad:

| Organisation | Typ | Invånare | Ansluten | Läge |
| --- | --- | --- | --- | --- |
| Ängsholms kommun | kommun | 31 420 | mars 2025 | Inarbetad, fylld med data |
| Nordmarks kommun | kommun | 9 840 | januari 2026 | Halvvägs, krigsorganisation ej bemannad |
| Vreta kommun | kommun | 4 215 | september 2026 | Nyansluten, nästan tom |
| Region Västmark | region | 298 400 | november 2025 | Inarbetad, hälso- och sjukvårdens beredskap |

Region Västmark ligger i samma län som Ängsholm, vilket gör skillnaden mellan
huvudmannatyperna synlig i demon: de får olika kravlistor ur samma katalog, och
olika tillsynsmyndighet enligt cybersäkerhetsförordningen.

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
db/schema.sql          Datamodell, inkl. delad kravkatalog och status per org
scripts/data/          Nationellt organisationsregister, vendorat med proveniens
src/lib/katalog-actions.ts  Redaktionen: ändring, avstämning och nya krav
src/lib/formsvar.ts    Serveråtgärder som svarar med text i stället för att krascha
src/lib/inbjudan*.ts   Inbjudan av användare, med engångskod och hashad token
src/lib/personuppgifter.ts  Registerförteckning enligt artikel 30
src/lib/gallring-actions.ts Gallring, med spärr när fristen inte är beslutad
src/lib/personalimport.ts   CSV-inläsning, med citerade fält och BOM
src/lib/import-actions.ts   Import med torrkörning och allt-eller-inget
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

## Flera kommuner och regioner i samma installation

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

## Den delade kravkatalogen

Lagkraven ligger i en **gemensam katalog** (`requirement_catalog`) som delas av
alla anslutna organisationer. Status, ansvarig, underlag och förfallodatum ligger
per organisation (`requirement_status`). Uppdelningen är det som gör produkten
säljbar i skala: en rättad lagrumshänvisning är en ändring i stället för en per
kund, och vid omläggningen till LKRB den 1 januari 2027 når uppdateringen alla
samtidigt.

Katalogen typar varje krav på huvudman i `galler_for`: `kommun`, `region` eller
`bada`. En region är inte en stor kommun. LEH, säkerhetsskyddslagen,
totalförsvarsplikten och cybersäkerhetslagen träffar båda, medan vattentjänster
och styrel sitter hos kommunen och katastrofmedicinsk beredskap och smittskydd
hos regionen. En organisation får statusrader bara för de krav som gäller dess
typ, så en kommun ser aldrig regionernas krav och tvärtom.

Några krav betyder olika saker beroende på organisationen: storleken avgör om
den är väsentlig eller viktig verksamhetsutövare, och länet avgör
tillsynsmyndighet. Sådan text får inte skrivas in i den delade beskrivningen.
Den ligger i stället som en `kontextmall` med platshållare och fylls med
organisationens egna uppgifter vid läsning, av `fyllKontext()` i `queries.ts`.
Därför kan samma katalograd ge en kommun *"Tillsynsmyndighet är Länsstyrelsen i
Örebro län"* och en region *"Länsstyrelsen i Örebro län (offentlig förvaltning)
och Inspektionen för vård och omsorg (vårdgivare)"*.

### Proveniens

Katalogen säljs som underlag vid tillsyn, och varje rad måste därför gå att
granska. `kontrollerad` och `kontrollerad_av` anger mot vilken källa raden senast
stämdes av och av vem. **En tom `kontrollerad` betyder att raden inte är avstämd
mot författningstext**, och raden visas då som *Ej avstämd mot källa* i
gränssnittet och i CSV-exporten. Ett krav som ingen kontrollerat får inte se
likadant ut som ett som är kontrollerat.

## Import av personal

Personalregistret kan läsas in från kommunens personalsystem som
semikolonseparerad CSV, samma format som exporten. Importen når man från
krigsplaceringsmodulen och den kräver skrivbehörighet där — HR-rollen har det.

Tre saker styr utformningen:

**Nyckeln.** Matchningen sker på `extern_id`, anställningsnumret i
personalsystemet. Maskerat personnummer duger inte: fyra siffror är
bortmaskerade, och två personer födda samma dag skulle slås ihop. Rader utan
nyckel avvisas.

**Torrkörning först.** Utan kryss i *Genomför importen* läses filen och
rapporten visas, men ingenting skrivs. En fil från ett personalsystem innehåller
fel — stavade verksamhetsnamn, dubbla anställningsnummer, rader utan nyckel —
och den som importerar ska se dem innan de blir till poster. Hittas fel vid en
skarp körning avbryts hela importen: en halvt genomförd import av ett
personalregister är värre än ingen, eftersom den som rättar filen inte längre
vet vad som redan gått in.

**Importen rör aldrig krigsplaceringar.** Den uppdaterar personuppgifter och
anställning. Vem som är placerad på vilken befattning är ett beslut som fattas i
systemet, med samrådskontroller och allt, och ska inte kunna ändras av en fil.
Ett tomt fält lämnar dessutom uppgiften orörd i stället för att radera den,
eftersom en HR-export inte alltid innehåller alla kolumner.

Filvägen finns kvar även när en direktintegration byggts, av den enkla
anledningen att alla kommuner inte har ett personalsystem som går att integrera
mot.

## Personuppgifter och gallring

Modulen innehåller en **registerförteckning enligt artikel 30** i
dataskyddsförordningen: fem kategorier med ändamål, rättslig grund, vilka
uppgifter som behandlas, vad som utlöser gallringen och vem uppgifterna kan
lämnas till. Förteckningen ligger i `src/lib/personuppgifter.ts`, av samma skäl
som behörighetsmatrisen: den är en policy som ska granskas och
versionshanteras. Den är ett arbetsunderlag och ersätter inte kommunens eget
dataskyddsarbete — den ska granskas av dataskyddsombudet.

**Gallringsfristerna står inte i koden.** En kommuns gallring styrs av
arkivlagen (1990:782) och kommunens dokumenthanteringsplan, beslutad av
arkivmyndigheten. En frist inbyggd i ett system vore en gissning som ser ut som
ett lagkrav. Fristen beslutas därför per kommun, lagras i `gallringsregler` med
vem som beslutat den och när, och visas som **obeslutad** tills dess. I
demodatan är två kategorier medvetet obeslutade: säkerhetsprövning och
övningsdeltagande, de två som i praktiken brukar fastna eftersom de rör sig
mellan gallring och bevarande.

Gallring kräver tre saker, och systemet nekar om någon saknas:

1. Att anställningen är registrerad som avslutad.
2. Att fristen är **beslutad** och har löpt ut.
3. Att personen inte har en krigsplacering som är öppen. Placeringen ska
   avslutas först, så att befattningen syns som vakant i stället för att tyst
   tömmas.

Loggposten noterar kategori, verksamhet och tillämpad frist — men varken namn
eller personnummer. Att skriva in den gallrade personens namn i
spårbarhetsloggen skulle göra gallringen meningslös. Det som ska gå att visa vid
tillsyn är att gallring skett enligt beslutad frist, inte vem den gällde.

## Inbjudan av användare

En organisations administratör bjuder in till **sin egen** organisation och
väljer roll. Till skillnad från att ansluta en ny organisation krävs ingen
leverantörsbehörighet: det är en åtgärd inom organisationen.

Har personen redan ett konto, till exempel för att hen arbetar i en annan
kommun, tillkommer bara medlemskapet. Lösenordet rörs inte, och den andra
kommunens behörighet påverkas inte.

Koden i länken **lagras aldrig i klartext**, bara som hash med salt. Den som
läser databasen ska inte kunna ta över en obesvarad inbjudan. Länken visas en
gång när inbjudan skapas och går inte att läsa igen — installationen skickar
ingen e-post, och ska inte göra det, eftersom en kommun kör systemet i eget
nät. Förmedlingen sköter kommunen på det sätt den själv valt.

Inbjudan gäller i sju dygn och är engångsgiltig. En besvarad, utgången,
återkallad eller felaktig länk ger **samma** besked, så att sidan inte går att
använda för att ta reda på vilka adresser som är inbjudna.

Lokala lösenord kräver minst tolv tecken. Det är en tillfällig lösning: se
punkt 1 under *Vad som återstår*.

## Redaktionen för kravkatalogen

Modulen *Kravkatalogen* är där lagtexten underhålls. Varje rad visar hur många
organisationer den finns hos, så att den som rättar ett lagrum ser att
ändringen når 287 kommuner och inte tror att den gäller en. Ändringen kräver
ingen skrivning hos kunderna: texten är delad, och det är hela vinsten med
modellen.

Tre regler gäller i `src/lib/katalog-actions.ts`:

1. **Leverantörsbehörighet krävs.** En ändring i katalogen är inte en åtgärd
   inom en organisation utan över samtliga.
2. **Varje ändrat fält loggas** i `catalog_revisions` med före- och eftervärde,
   vem som gjorde den, varför, och hur många organisationer den nådde.
   Historiken är underlaget när en kund frågar varför ett lagrum i deras lista
   ser annorlunda ut än förra kvartalet. Motiveringen är obligatorisk.
3. **En ändring som skulle radera kundernas arbete stoppas.** Begränsas ett krav
   från `bada` till `kommun` försvinner det ur regionernas listor — med deras
   underlag, ansvariga och genomförandedatum. Har någon av dem redovisat arbete
   nekas ändringen, med uppmaningen att markera kravet som upphört i stället.
   Det bevarar redovisningen och är dessutom juridiskt riktigare: ett krav som
   upphört har gällt.

Att lägga till ett krav skriver det en gång och lägger det hos varje kund av
rätt huvudmannatyp. Det är vägen in för en ny lag, och precis vad omläggningen
till LKRB kräver. Nya krav läggs in som **ej avstämda**: att skriva in ett
lagrum är inte detsamma som att ha kontrollerat det mot författningstexten.

### Fel som går att läsa

Serveråtgärder som validerar indata kastar inte fel, utan svarar med text.
Next.js döljer felmeddelanden från serveråtgärder i produktionsläge, så ett
kastat fel når användaren som en generisk krasch utan förklaring — och en spärr
som ingen kan läsa är ingen spärr. Mönstret ligger i `src/lib/formsvar.ts` och
`src/components/formular.tsx`.

Komponenten återställer dessutom inmatningen när en åtgärd svarat med fel.
React 19 nollställer okontrollerade formulär när en åtgärd är klar, vilket annars
innebär att en lång beskrivning försvinner för att motiveringen var för kort.

## Nationellt organisationsregister

`org_registry` innehåller **samtliga kommuner och regioner i landet** med
kommunkod, län och tillsynsmyndighet. Det är referensdata, inte kunddata: en rad
finns för varje organisation i Sverige, oavsett om den är kund. Att lägga upp en
ny kund är därmed ett val i en lista i stället för ett formulär där någon skriver
in länet för hand, och en säljdemo kan börja med att köparens egen kommun redan
finns där.

Registret innehåller **310 rader, inte 311**. Sverige har 290 kommuner och 21
regioner, men Gotlands kommun är en enda juridisk person som fullgör både
kommunens och regionens uppgifter. Den har därför typen `kommun_region` och får
båda kravuppsättningarna: 15 gemensamma krav, 5 kommunkrav och 4 regionkrav.

| Typ | Antal | Krav ur katalogen |
| --- | --- | --- |
| `kommun` | 289 | 20 |
| `region` | 20 | 19 |
| `kommun_region` | 1 (Gotland) | 24 |

Källorna står i `scripts/data/organisationsregister.json`: SCB:s läns- och
kommunkoder för indelningen, cybersäkerhetsförordningen (2025:1507) 7 och
10–15 §§ för tillsynsmyndigheten. Filen är vendorad in i repot med avsikt.
Registret får inte hämtas över nät vid seedning, eftersom installationen ska gå
att köra i ett slutet kommunnät.

Invånarantalet ingår **inte** i registret och är frivilligt när en organisation
läggs upp. Det styr ingen bedömning i systemet: storlekstestet i
cybersäkerhetslagen utgår från antal anställda, inte invånare. Ett tomt fält är
ärligare än en gissning.

## Att ansluta en organisation

Modulen *Anslutna organisationer* visar registret och vilka som är kunder.
Anslutning hämtar namn, län, huvudmannatyp och tillsynsmyndighet ur registret —
det är fakta om landet och inte något en säljare ska kunna skriva fel — och
skapar kravlistan ur den delade katalogen efter huvudmannatyp. Det som matas in
är kontaktvägar.

Åtkomsten kräver mer än rollen administratör. Att lägga upp en ny kund är till
sin natur en operation över organisationsgränsen, och sidan avslöjar dessutom
vilka andra kommuner som är kunder. En administratör i en kommun är
administratör *där*, inte i installationen som helhet. Därför finns flaggan
`users.leverantor`, och spärren `kravLeverantor()` kräver både skrivbehörighet i
modulen och att kontot är leverantörspersonal. Menyn använder samma villkor, så
den visar aldrig något som sidan sedan nekar.

Anslutningen loggas i spårbarhetsloggen både hos den nya organisationen och hos
den som utförde den.

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
| Beredskapssamordnare, region | helena.krantz@regionvastmark.se | vastmark2026 | Region Västmark |
| Säkerhetsskyddschef, region | camilla.wahl@regionvastmark.se | sakerhet2026 | Region Västmark |
| Förvaltningschef, hälso- och sjukvård | ingrid.falk@regionvastmark.se | sjukvard2026 | Region Västmark |
| Driftansvarig, leverantör | elsa.wikner@beredskapsnavet.se | leverantor2026 | Alla fyra, olika roll. Enda kontot med leverantörsflagga |

Fyra demos värda att köra: logga in som Jens Åkerlund, som är systemadministratör
i Ängsholm, och konstatera att modulen *Anslutna organisationer* varken syns i
menyn eller går att nå på direkt adress — rollen räcker inte, det krävs
leverantörsbehörighet.

De övriga tre: logga in som kommunledning för att visa att
ändringsmöjligheter försvinner; som Helena Krantz och sedan Marika Öhlund för
att se att kravlistan skiljer sig mellan region och kommun fast katalogen är
densamma; och som Elsa för att byta organisation i topbaren. Hon är systemadministratör i Nordmark och Vreta men bara
kommunledning i Ängsholm, så administrationsmodulen försvinner när hon byter.

## Vad som återstår före skarp drift

Demon är komplett som produktdemo men inte som driftsatt system. Följande
saknas medvetet:

1. **Federerad inloggning.** Behörighetsmodellen är på plats, men lösenorden är
   lokala. Skarp drift behöver inloggning mot kommunens katalogtjänst med
   flerfaktorsautentisering. Roller och behörighetsmatris kan vara kvar som de är.
   Lösenordsbyte, kontoskapande och återställning saknas helt, eftersom de
   funktionerna försvinner med federerad inloggning.
2. **Personuppgiftshantering: beslut återstår, inte funktion.** Rättslig grund
   är dokumenterad och gallringsrutinen finns, men fristerna måste beslutas av
   varje kommuns arkivmyndighet, och förteckningen granskas av
   dataskyddsombudet. Det är arbete hos kunden, inte i koden.
3. **Direktintegration mot personalsystemet.** Filimport finns, med nyckel,
   torrkörning och validering. Att hämta personallistan automatiskt kräver en
   motpart att integrera mot och avtalas per kund.
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
5. **Regionkraven behöver juridisk granskning.** Kraven `HSL-KATASTROF`,
   `HSL-UTLAND` och `OK-REGION` är avstämda mot källa, men `SMITTSKYDD` saknar
   verifierad paragrafhänvisning och är markerat som ej avstämt. Dessutom
   upphörde SOSFS 2013:22 om katastrofmedicinsk beredskap vid utgången av 2025
   genom HSLF-FS 2025:69, utan att någon motsvarande föreskrift för beredskap
   inom landet har kunnat bekräftas. Skyldigheten i 7 kap. 2 § HSL kvarstår,
   men föreskriftsläget måste stämmas av innan listan används vid tillsyn.

