# Säkerhet — vad som är granskat, vad som rättats och vad som återstår

## Vad det här dokumentet är

Underlag inför en upphandling eller en kundens egen granskning. Det beskriver
vilken granskning som är gjord, vad den hittade, vad som är rättat och hur
rättningen är kontrollerad — samt vad som **inte** är granskat.

Dokumentet är inte ett intyg och ska inte användas som ett. Ingen oberoende
tredje part har granskat produkten.

## Vad säkerheten vilar på

En installation betjänar flera kommuner och regioner. Hela
säkerhetsmodellen vilar därför på två gränser:

1. **Mellan kunder.** Varje tabell med kunddata bär `org_id`, och varje
   läsning och skrivning filtrerar på den organisation sessionen gäller.
   Sessionen bär både användare **och** aktiv organisation, så ett byte av
   organisation kräver ett medlemskap.
2. **Mot leverantörsnivå.** Det nationella registret och den delade
   kravkatalogen ligger utanför alla organisationer. Åtkomsten styrs av
   `users.leverantor`, en flagga på kontot — inte av rollen i en kommun. En
   administratör i sin egen kommun ska inte kunna nå dem.

Behörigheten i övrigt är en matris i kod: sex roller mot tretton moduler, i
tre nivåer. Den står i `src/lib/behorighet.ts` och är versionerad, så en
ändring syns i historiken.

## Granskningen

En oberoende säkerhetsgranskning av hela grenen gjordes i oktober 2026, med
särskild inriktning på isolering mellan organisationer, gränsen mot
leverantörsnivå, OIDC-flödet och om personuppgifter kan läcka.

Granskningen fann **inget fel i isoleringen mellan kunder**: varje skrivning
bär `org_id`, nollträffar ger fel i stället för tystnad, och främmande
nycklar kontrolleras mot den egna organisationen före insättning.

Den fann fyra fel i **kontonas livscykel**. Alla fyra har samma form, och den
formen är värd att förstå eftersom den lär känna igen nästa:

> Behörigheten kontrollerades per organisation, men det som ändrades — kontot
> och dess medlemskap — gäller hela installationen.

| Fel | Vad det gav | Rättning |
| --- | --- | --- |
| Lösenordsåterställning kontrollerade medlemskap i den egna organisationen, men satte lösenordet på det globala kontot. | En administratör i en kommun kunde ta över ett konto med leverantörsflagga och behörighet i tre andra organisationer: skrivrätt i den delade kravkatalogen, det nationella registret och andra kunders krigsplaceringar. | En återställning får bara göras av någon vars behörighet redan täcker kontots. Regeln i `src/lib/aterstallningsregel.ts`. |
| En inbjudan var bunden till en e-postadress, och koden lämnas till den som bjuder in. | En administratör kunde bjuda in en adress i en annan kommun, lösa in inbjudan själv och ge det kontot en roll i sin egen organisation utan att personen var inblandad. | Gäller inbjudan ett konto som redan finns läggs behörigheten bara till av den som är inloggad som kontot. |
| Federerad inloggning slog upp kontot på `email` i id-token, utan att binda kontot till utfärdaren. | Den som förfogar över **en** kunds katalogtjänst kunde intyga vilken adress som helst i installationen, leverantörens egen inkluderad. | Domänspärr per utfärdare (`org_idp.epost_domaner`, tom tillåter ingenting), bindning till `(issuer, sub)`, och leverantörskonton kan inte logga in federerat alls. |
| Rutan med demokonton på inloggningssidan visades vid varje begäran, och seedningen var enda vägen till en databas. | En driftsättning gjord enligt dokumentationen fick offentligt kända inloggningar — demokontonas lösenord står i `scripts/seed.mjs`. | Rutan visas bara när databasen innehåller demodata, och `npm run installera` skapar en installation utan demodata. |

Dessutom rättat: `loggaIn` hoppade över lösenordshashningen när adressen var
okänd. Feltexten var densamma för okänt konto och fel lösenord, men
svarstiden var inte det. Hashningen görs nu alltid.

## Hur rättningarna är kontrollerade

Tre nivåer, och den tredje är den som hittar fel de andra inte ser.

**Enhetstester** (`npm test`) prövar reglerna direkt, som rena funktioner —
återställningsregeln, domänspärren, tokenvalideringen. De visar att regeln är
riktig.

**Databastester** prövar reglerna med den SQL som åtgärderna faktiskt
frågar, mot en seedad databas. En riktig regel som aldrig får sina uppgifter
är lika trasig som ingen regel, och det syns bara här.

**Angreppsprov** (`npm run prov-behorighet`) utför angreppen genom
gränssnittet med en riktig session, och läser sedan databasen för att se om
något ändrades:

```
npm run demo              # i en terminal
npm run prov-behorighet   # i en annan
```

Fjorton kontroller. Provet är **muterat**: med spärrarna borta faller nio av
dem, och då står det 1 i `password_resets` för leverantörskontot, 1 i
`user_orgs` för det utomstående kontot, och den federerade begäran landar på
startsidan med en session för leverantörskontot. Angreppen är alltså mätta,
inte beskrivna.

## OIDC-flödet

Det som verifieras, och som är prövat med egna signerade tokens:

- Auktoriseringskod med PKCE (S256). Implicit flöde används inte: en id-token
  i adressfältet hamnar i webbserverloggar och i webbläsarhistoriken.
- Algoritmlistan är asymmetrisk. `none` och `HS*` avvisas, så en token går
  inte att signera med den publika nyckeln eller med ingenting.
- Nycklar hämtas från den konfigurerade utfärdarens `jwks_uri` med matchande
  `kid`. Discovery-dokumentets `issuer` måste vara den vi frågade.
- `iss`, `aud` (även som lista), `exp`, `iat` med tidsfönster, `nonce` och
  `sub` kontrolleras var för sig.
- `state`, `nonce` och `code_verifier` är engångs och ligger på servern.
  Raden tas bort i och med läsningen.
- Flerfaktor kontrolleras mot `amr` i id-token, inte antas. En organisation
  som kräver `mfa` får avslag när utfärdaren inte intygar det.
- Identiteten binds till `(issuer, sub)`, och utfärdaren får bara intyga
  adresser i sina konfigurerade domäner.

## Tokens och lösenord

Inbjudnings- och återställningskoder är 24 slumpade byte. De lagras bara som
scrypt-hash med eget salt per kod, jämförs med `timingSafeEqual`, gäller i sju
dygn respektive ett dygn, går bara att använda en gång, och en ny återställning
raderar tidigare obesvarade.

Både `/inbjudan` och `/aterstall` svarar med **ett och samma besked** oavsett
om koden saknas, är använd, har gått ut eller är fel. Sidorna går därför inte
att använda för att ta reda på vilka adresser som finns. `loggaIn` svarar
likaså lika för okänt konto och fel lösenord.

Lösenord lagras som scrypt-hash med salt. Ett konto som loggar in mot
katalogtjänsten har tomt lösenordsfält, och går inte att logga in på med
lösenord — jämförelsen faller på längden. Att **sätta** ett lösenord på ett
sådant konto är spärrat, eftersom det vore en inloggningsväg förbi
katalogtjänstens krav på autentiseringsmetod.

## Känt och medvetet

- **Återställningslänkar lämnas till den som begär dem.** Installationen
  skickar ingen e-post, och ska inte göra det: en kommun kör systemet i eget
  nät. Därför är en återställning i praktiken en övertagning av kontot, och
  därför får den bara göras av någon vars behörighet redan täcker kontots. En
  kund som vill ha återställning via e-post behöver en utgående e-postväg, och
  då bör länken gå till `users.epost` i stället.
- **`har_konto` i inbjudningslistan** säger om adressen har ett konto någonstans
  i installationen, inte bara i den egna organisationen. Det är avsiktligt —
  administratören behöver veta att den inbjudna måste logga in först — men det
  innebär att en administratör kan ta reda på om en känd adress har ett konto
  hos någon annan kund.
- **`redirect_uri` härleds ur begärans Host.** En utfärdare som följer
  standarden avvisar en `redirect_uri` som inte är registrerad, så värdet är
  inte fritt. Att låsa det till en konfigurerad bas vore ändå snävare, och bör
  göras innan systemet exponeras utanför ett kommunnät.
- **Ingen hastighetsbegränsning.** Inloggning och inlösen av koder går att
  försöka med obegränsat ofta. Koderna är långa nog att gissningar inte är
  vägen in, men en kund som exponerar systemet mot internet bör sätta
  begränsningen i sin omvända proxy.
- **`scripts/test-idp.mjs` lyssnar bara på localhost** och startas inte av
  appen. Den godkänner vem som helst och får aldrig köras i drift.

## Vad som INTE är granskat

1. **Ingen oberoende granskning av tredje part.** Granskningen ovan är gjord
   inom projektet. Inför en upphandling där penetrationstest är ett skallkrav
   behöver ett sådant beställas.
2. **Driftmiljön.** Härdning av servern, säkerhetskopiering, kryptering av
   disk, loggöverföring och nätsegmentering är kundens, och ingen del av
   produkten.
3. **Säkerhetsskyddsanalys.** Systemet innehåller uppgifter om krigsplacering
   och säkerhetsprövning. Om och i vilken omfattning säkerhetsskyddslagen
   (2018:585) ställer krav på systemet och dess drift är en bedömning varje
   kommun gör själv, och den kan leda till krav produkten i dag inte uppfyller.
4. **Beroenden.** Produkten har tre beroenden i drift — `next`, `react` och
   `react-dom` — och inga egna. Bevakning av sårbarheter i dem är inte
   automatiserad. Granskningsverktygen (Playwright, axe-core) är med avsikt
   inte beroenden och följer inte med in i driften.

## Att anmäla en brist

Brister i produktens säkerhet rapporteras till leverantören. Rapportera inte
en brist i ett offentligt ärende innan den är rättad.
