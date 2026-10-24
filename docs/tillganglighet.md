# Tillgänglighet — underlag för kommunens redogörelse

## Vad det här dokumentet är, och inte är

Lagen om tillgänglighet till digital offentlig service kräver att offentliga
aktörers digitala tjänster följer WCAG 2.1 nivå AA, och att varje aktör
**publicerar en tillgänglighetsredogörelse** för sina tjänster.

Den skyldigheten är kommunens, inte leverantörens. Det här dokumentet är
därför **underlag** till kommunens egen redogörelse: det beskriver vad som är
granskat i produkten, med vilken metod och vad som inte är granskat. Kommunen
behöver komplettera med sin egen bedömning, sina kontaktvägar för att anmäla
brister och sitt datum.

Dokumentet är inte ett intyg, och ska inte användas som ett.

## Vad som är granskat

Samtliga 16 sidor i systemet är granskade maskinellt mot WCAG 2.1 nivå A och AA
med axe-core, inloggade som en roll som når alla moduler:

```
npm run demo              # i en terminal
npm run tillganglighet    # i en annan
```

Granskningen rapporterar noll maskinellt upptäckbara överträdelser. Skriptet
ligger i `scripts/tillganglighet.mjs` och ska köras före varje leverans.

Playwright och axe-core är med avsikt inte beroenden i projektet — de behövs
bara för granskningen och ska inte följa med in i driften. Skriptet säger hur
de installeras.

### Åtgärdade brister

Granskningen hittade tre allvarliga fel, som är rättade:

| Fel | Vad det innebar | Åtgärd |
| --- | --- | --- |
| `aria-progressbar-name` | 46 andelsmätare utan tillgängligt namn. En skärmläsare läste ”62 procent” utan att säga av vad. | `etikett` är nu ett **obligatoriskt** fält på komponenten, så att typkontrollen stoppar ett anrop som saknar den. |
| `color-contrast` | 51 fall av ljusgrå text med kontrast 2,63:1 mot vitt, mot kravets 4,5:1, och 3 fall på 4,34:1. | Textfärgerna höjda ett steg. Lägsta kontrast i gränssnittet är nu cirka 7:1. |
| `scrollable-region-focusable` | Vågrätt rullbara tabellområden gick inte att rulla med tangentbord, så högra kolumnerna var onåbara utan mus. | Områdena är fokuserbara. |

## Omflöde och förstoring (WCAG 1.4.10)

Kravet är att innehållet går att använda vid 320 pixlars bredd utan att man
behöver rulla i två riktningar. 320 pixlar motsvarar 400 procents förstoring på
en vanlig skärm — och förstoring är precis vad den som behöver den använder.

**Vid mätning tvingades varje sida minst 972 pixlar bred.** Det är ett fel på
nivå AA på hela produkten, och ett som axe-core inte upptäcker. Tre orsaker:

1. Sidomenyn hade fast bredd och kunde inte fällas. Den är nu fällbar under
   `lg` med en knapp som bär `aria-expanded`, och layouten staplar i stället
   för att ligga sida vid sida.
2. Rutnätsbarn saknade `min-w-0`. CSS-grid krymper inte ett barn under dess
   innehålls bredd utan det, så en bred tabell satte ett golv för hela sidan
   trots att tabellen själv låg i ett rullbart område.
3. Panelrubriker och åtgärdsrader wrappade inte, så en kontroll intill en
   rubrik satte ett eget breddgolv.

Efter åtgärderna klarar **samtliga 14 inloggade sidor 320 pixlar** utan
vågrät sidrullning, och likaså 640 pixlar (200 procent). Mätningen går att
göra om; skriptet finns i granskningen.

Datatabellerna rullar fortfarande i sidled inuti sina egna områden. Det är
tillåtet: WCAG 1.4.10 undantar innehåll som kräver tvådimensionell layout, och
en datatabell är standardexemplet. Områdena är fokuserbara, så rullningen går
att göra med tangentbord.

## Vad som INTE är granskat

Ett maskinellt verktyg hittar en del av WCAG, inte allt. Följande återstår och
kräver en människa:

1. **Granskning med skärmläsare.** Att läsordningen är begriplig, att
   tabellernas rubrikkopplingar fungerar i praktiken och att statusbudskap
   annonseras är inte prövat med NVDA, JAWS eller VoiceOver.
2. **Hela tangentbordsvägen.** Fokusmarkering finns och rullbara områden är
   fokuserbara, men att varje flöde — logga in, besluta en krigsplacering,
   ansluta en organisation — går att genomföra utan mus är inte systematiskt
   prövat.
3. **Begriplighet.** Språket är fackspråk av nödvändighet: lagrum,
   säkerhetsklass, kritikalitet. Om texterna är begripliga för målgruppen är en
   redaktionell fråga som inte går att mäta maskinellt.
4. **Utskriftsvyn.** Beredskapsrapporten är gjord för att skrivas ut. Hur den
   fungerar för någon som läser den digitalt med hjälpmedel är inte granskat.

## Kända begränsningar att redovisa

- **Breda tabeller.** Flera moduler visar tabeller som är bredare än skärmen och
  rullar i sidled inuti sitt eget område. Det är tillåtet och fokuserbart, men
  tungt att använda med förstoring eller skärmläsare. En alternativ
  presentation för smala vyer saknas.
- **Ingen formell granskning av tredje part.** Ingen oberoende
  tillgänglighetsgranskning är genomförd. Inför en upphandling där det är ett
  skallkrav bör en sådan beställas.

## Rekommenderad formulering till kommunen

> Tjänsten är delvis förenlig med lagen om tillgänglighet till digital
> offentlig service. De brister som är kända framgår nedan.

Att skriva *helt förenlig* vore felaktigt så länge punkterna ovan inte är
granskade.

## Att anmäla en brist

Brister i produktens tillgänglighet rapporteras till leverantören, som rättar
dem i produkten. Brister i kommunens egen användning av tjänsten hanteras av
kommunen enligt dess redogörelse.

Kommunen ska i sin redogörelse ange egna kontaktvägar och upplysa om
möjligheten att anmäla bristande tillgänglighet till tillsynsmyndigheten.
