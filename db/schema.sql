-- Beredskapsnavet – datamodell
-- Målgrupp: beredskapssamordnare i kommun/region.
-- All data lagras lokalt i SQLite. Inga personuppgifter lämnar driftmiljön.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Nationellt register över samtliga kommuner och regioner.
--
-- Referensdata, inte kunddata: här finns en rad för varje organisation i
-- landet, oavsett om den är kund. Att lägga upp en ny kund är ett val ur
-- registret, inte ett formulär där någon skriver in länet för hand.
--
-- Gotland förekommer en gång, som typen kommun_region. Kommunen är en enda
-- juridisk person som fullgör både kommunens och regionens uppgifter, och ska
-- därför ha båda kravuppsättningarna. Antalet juridiska personer i landet är
-- alltså 310, inte 290 + 21.
CREATE TABLE org_registry (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  -- SCB:s kommunkod (fyra siffror) för kommun, länskod (två) för region.
  kod           TEXT    NOT NULL UNIQUE,
  namn          TEXT    NOT NULL UNIQUE,
  kortnamn      TEXT    NOT NULL UNIQUE,
  typ           TEXT    NOT NULL,            -- kommun | region | kommun_region
  lan           TEXT    NOT NULL,
  -- Följer av länet, och för region även av att regionen är vårdgivare.
  tillsyn_cyber TEXT    NOT NULL
);

CREATE INDEX idx_registry_typ ON org_registry(typ);
CREATE INDEX idx_registry_lan ON org_registry(lan);

CREATE TABLE organisations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  kortnamn          TEXT    NOT NULL UNIQUE,      -- används i sökvägar och loggar
  namn              TEXT    NOT NULL,
  -- Vilken rad i det nationella registret kunden svarar mot. Null bara för
  -- organisationer som lagts upp innan registret fanns.
  registry_id       INTEGER REFERENCES org_registry(id),
  typ               TEXT    NOT NULL,             -- kommun | region | kommun_region
  lan               TEXT    NOT NULL,
  -- Null tills uppgiften är ifylld. Antalet invånare styr ingen bedömning i
  -- systemet: storlekstestet i cybersäkerhetslagen utgår från anställda.
  invanare          INTEGER,
  mandatperiod      TEXT    NOT NULL,             -- t.ex. "2027-2030"
  beredskapsniva    TEXT    NOT NULL,             -- fredstida | beredskapslarm | hojd_beredskap
  samordnare        TEXT    NOT NULL,
  samordnare_epost  TEXT    NOT NULL,
  tib_telefon       TEXT    NOT NULL,
  uppdaterad        TEXT    NOT NULL,
  ansluten          TEXT    NOT NULL,             -- när kommunen började använda systemet
  -- Tillsynsmyndighet enligt cybersäkerhetsförordningen (2025:1507). Följer av
  -- länet, och för en region dessutom av att regionen är vårdgivare. Sätts när
  -- organisationen läggs upp, eftersom den inte får härledas i varje fråga.
  tillsyn_cyber     TEXT    NOT NULL DEFAULT '',
  aktiv             INTEGER NOT NULL DEFAULT 1
);

-- Förvaltningar, bolag och andra verksamheter
CREATE TABLE units (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  namn          TEXT    NOT NULL,
  kortnamn      TEXT    NOT NULL,
  typ           TEXT    NOT NULL,                 -- forvaltning | bolag | gemensam
  chef          TEXT    NOT NULL,
  samhallsviktig INTEGER NOT NULL DEFAULT 0,
  anstallda     INTEGER NOT NULL DEFAULT 0
);

-- Krigsorganisationens befattningar
CREATE TABLE positions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  unit_id       INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  titel         TEXT    NOT NULL,
  niva          TEXT    NOT NULL,                 -- ledning | stab | operativ
  kritikalitet  TEXT    NOT NULL,                 -- A | B | C
  platser       INTEGER NOT NULL DEFAULT 1,
  sakerhetsklass TEXT   NOT NULL DEFAULT 'ingen', -- ingen | 3 | 2 | 1
  uppgift       TEXT    NOT NULL DEFAULT ''
);

-- Personal som kan krigsplaceras
CREATE TABLE people (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  -- Nyckeln i kommunens personalsystem, normalt anställningsnumret. Den behövs
  -- för att en import ska kunna uppdatera rätt person. Maskerat personnummer
  -- duger inte: fyra siffror är bortmaskerade, och två personer födda samma
  -- dag skulle slås ihop. Null för rader som matats in för hand.
  extern_id         TEXT,
  namn              TEXT    NOT NULL,
  pnr_maskerat      TEXT    NOT NULL,             -- ÅÅÅÅMMDD-XXXX, fyra sista maskeras
  unit_id           INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  befattning_fred   TEXT    NOT NULL,
  epost             TEXT    NOT NULL DEFAULT '',
  telefon           TEXT    NOT NULL DEFAULT '',
  anstallningsform  TEXT    NOT NULL DEFAULT 'tillsvidare',
  -- Spärrar: en person som redan är krigsplacerad i Försvarsmakten eller
  -- har annan plikt kan inte krigsplaceras av kommunen utan samråd.
  fm_krigsplacerad  INTEGER NOT NULL DEFAULT 0,
  annan_plikt       TEXT    NOT NULL DEFAULT '',
  sakerhetsklass    TEXT    NOT NULL DEFAULT 'ingen',
  registerkontroll  TEXT    NOT NULL DEFAULT 'ej_aktuell', -- ej_aktuell | begard | klar | utgangen
  bortrest_risk     INTEGER NOT NULL DEFAULT 0,
  -- När anställningen upphörde. Startpunkt för gallringsfristen: en person som
  -- slutat ska inte ligga kvar i krigsorganisationen, och uppgifterna om
  -- säkerhetsprövning ska inte sparas längre än kommunen beslutat.
  anstallning_upphorde TEXT,
  noteringar        TEXT    NOT NULL DEFAULT ''
);

-- Krigsplaceringar: koppling person -> befattning
CREATE TABLE placements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  position_id   INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  person_id     INTEGER REFERENCES people(id) ON DELETE SET NULL,
  status        TEXT    NOT NULL,                 -- foreslagen | beslutad | underrattad | avslutad
  beslutsdatum  TEXT,
  beslut_av     TEXT    NOT NULL DEFAULT '',
  underrattad   INTEGER NOT NULL DEFAULT 0,
  anmarkning    TEXT    NOT NULL DEFAULT '',
  UNIQUE (org_id, position_id, person_id)
);

-- Risk- och sårbarhetsanalys
CREATE TABLE risks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  namn          TEXT    NOT NULL,
  kategori      TEXT    NOT NULL,                 -- naturhandelse | teknisk | antagonistisk | halsa | forsorjning
  beskrivning   TEXT    NOT NULL DEFAULT '',
  sannolikhet   INTEGER NOT NULL CHECK (sannolikhet BETWEEN 1 AND 5),
  konsekvens    INTEGER NOT NULL CHECK (konsekvens BETWEEN 1 AND 5),
  agare         TEXT    NOT NULL DEFAULT '',
  unit_id       INTEGER REFERENCES units(id) ON DELETE SET NULL,
  status        TEXT    NOT NULL DEFAULT 'bedomd', -- identifierad | bedomd | atgardas | accepterad
  senast_bedomd TEXT    NOT NULL,
  hojd_beredskap INTEGER NOT NULL DEFAULT 0       -- bedöms även i scenariot höjd beredskap
);

-- Samhällsviktig verksamhet / kontinuitetshantering
CREATE TABLE critical_functions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  unit_id         INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  namn            TEXT    NOT NULL,
  beskrivning     TEXT    NOT NULL DEFAULT '',
  prioritet       INTEGER NOT NULL CHECK (prioritet BETWEEN 1 AND 3),
  mtpd_timmar     INTEGER NOT NULL,               -- max tolerabel avbrottstid
  faktisk_timmar  INTEGER NOT NULL,               -- bedömd faktisk återställningstid
  plan_status     TEXT    NOT NULL,               -- saknas | utkast | faststalld | utgangen
  plan_datum      TEXT,
  berorda_brukare INTEGER NOT NULL DEFAULT 0
);

-- Beroenden per kritisk funktion
CREATE TABLE dependencies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  function_id   INTEGER NOT NULL REFERENCES critical_functions(id) ON DELETE CASCADE,
  typ           TEXT    NOT NULL,                 -- el | vatten | varme | it | personal | transport | livsmedel | drivmedel | leverantor
  beskrivning   TEXT    NOT NULL,
  reservlosning TEXT    NOT NULL DEFAULT '',
  sarbarhet     INTEGER NOT NULL CHECK (sarbarhet BETWEEN 1 AND 5)
);

-- Resurser, reservkraft och förnödenheter
CREATE TABLE resources (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  kategori      TEXT    NOT NULL,                 -- reservkraft | drivmedel | vatten | samband | sjukvard | varme | livsmedel | fordon
  benamning     TEXT    NOT NULL,
  kapacitet     TEXT    NOT NULL DEFAULT '',
  antal         REAL    NOT NULL DEFAULT 1,
  enhet         TEXT    NOT NULL DEFAULT 'st',
  placering     TEXT    NOT NULL DEFAULT '',
  unit_id       INTEGER REFERENCES units(id) ON DELETE SET NULL,
  status        TEXT    NOT NULL,                 -- driftklar | service | ur_drift | okand
  sista_kontroll TEXT,
  nasta_kontroll TEXT,
  ansvarig      TEXT    NOT NULL DEFAULT '',
  noteringar    TEXT    NOT NULL DEFAULT ''
);

-- Övningar och utbildning
CREATE TABLE exercises (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  namn          TEXT    NOT NULL,
  typ           TEXT    NOT NULL,                 -- seminarium | simulering | faltovning | larmovning | utbildning
  datum         TEXT    NOT NULL,
  status        TEXT    NOT NULL,                 -- planerad | genomford | utvarderad | installd
  malgrupp      TEXT    NOT NULL DEFAULT '',
  deltagare     INTEGER NOT NULL DEFAULT 0,
  scenario      TEXT    NOT NULL DEFAULT '',
  forankrad_lagkrav TEXT NOT NULL DEFAULT '',     -- requirement.kod
  erfarenheter  TEXT    NOT NULL DEFAULT ''
);

-- Gemensamt åtgärdsregister – allt som ska göras samlas här
CREATE TABLE actions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  titel         TEXT    NOT NULL,
  beskrivning   TEXT    NOT NULL DEFAULT '',
  kalla         TEXT    NOT NULL,                 -- rsa | kontinuitet | ovning | tillsyn | resurs | krigsorg | annan
  kalla_ref     TEXT    NOT NULL DEFAULT '',
  ansvarig      TEXT    NOT NULL DEFAULT '',
  unit_id       INTEGER REFERENCES units(id) ON DELETE SET NULL,
  prioritet     TEXT    NOT NULL DEFAULT 'normal', -- hog | normal | lag
  status        TEXT    NOT NULL DEFAULT 'ej_paborjad', -- ej_paborjad | pagaende | klar | avbruten
  forfallodatum TEXT,
  klar_datum    TEXT,
  skapad        TEXT    NOT NULL
);

-- Lagkrav och överenskommelser.
--
-- Katalogen är GEMENSAM för alla organisationer. Lagen är densamma för alla
-- kommuner och för alla regioner, så kravtexten får bara finnas på ett ställe:
-- en rättad lagrumshänvisning ska slå igenom hos samtliga kunder samtidigt.
-- Det som skiljer en organisation från en annan är status, ansvarig, underlag
-- och förfallodatum, och det ligger i requirement_status.
CREATE TABLE requirement_catalog (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kod           TEXT    NOT NULL UNIQUE,
  rubrik        TEXT    NOT NULL,
  lagrum        TEXT    NOT NULL,
  beskrivning   TEXT    NOT NULL DEFAULT '',
  -- Vissa krav betyder olika saker beroende på organisationens storlek och län
  -- (storleken avgör om en verksamhetsutövare är väsentlig eller viktig, länet
  -- avgör tillsynsmyndighet). Sådan text får inte skrivas in i den delade
  -- beskrivningen. Den ligger här som en mall med platshållare och fylls med
  -- organisationens egna uppgifter vid läsning, av fyllKontext() i queries.ts.
  kontextmall   TEXT    NOT NULL DEFAULT '',
  intervall     TEXT    NOT NULL,             -- mandatperiod | arligen | lopande | engang
  modul         TEXT    NOT NULL DEFAULT '',  -- vilken modul som styrker kravet
  kalla_url     TEXT    NOT NULL DEFAULT '',
  -- gallande | upphor | foreslagen. Ett krav som är på väg att ersättas måste
  -- synas som sådant, eftersom listan används som tillsynsunderlag.
  giltighet     TEXT    NOT NULL DEFAULT 'gallande',
  giltighet_not TEXT    NOT NULL DEFAULT '',
  -- Vilken typ av huvudman kravet gäller: kommun | region | bada.
  -- Regioner är inte stora kommuner. De bär katastrofmedicinsk beredskap och
  -- smittskydd, medan kommunerna bär räddningstjänst och vattenförsörjning.
  galler_for    TEXT    NOT NULL DEFAULT 'bada',
  standard_forfallo TEXT,                     -- katalogens förfallodatum, kan åsidosättas per org
  -- Proveniens. Katalogen säljs som underlag vid tillsyn, och varje rad måste
  -- därför gå att granska: mot vilken källa den stämdes av, när och av vem.
  -- Ett krav som inte stämts av mot författningstext ska synas som sådant.
  kontrollerad      TEXT NOT NULL DEFAULT '',
  kontrollerad_av   TEXT NOT NULL DEFAULT '',
  katalogversion    INTEGER NOT NULL DEFAULT 1
);

-- Ändringshistorik för den delade katalogen.
--
-- Katalogen är gemensam, så en rättelse slår igenom hos samtliga kunder
-- samtidigt. Det är produktens poäng, men det gör också varje ändring
-- riskabel: skriver redaktionen fel lagrum får 310 organisationer fel
-- tillsynsunderlag. Varje ändring loggas därför med fält, före- och
-- eftervärde, vem som gjorde den och varför.
CREATE TABLE catalog_revisions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  krav_id       INTEGER NOT NULL REFERENCES requirement_catalog(id) ON DELETE CASCADE,
  tidpunkt      TEXT    NOT NULL,
  anvandare     TEXT    NOT NULL,
  falt          TEXT    NOT NULL,            -- vilket fält som ändrades
  fran          TEXT    NOT NULL DEFAULT '',
  till          TEXT    NOT NULL DEFAULT '',
  motivering    TEXT    NOT NULL DEFAULT '',
  -- Hur många organisationer ändringen slog igenom hos vid tillfället.
  berorda       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_revisions_krav ON catalog_revisions(krav_id, tidpunkt);

-- Organisationens status på ett krav i katalogen. En rad per (org, krav) som
-- gäller organisationen, skapad när organisationen läggs upp.
CREATE TABLE requirement_status (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id            INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  krav_id           INTEGER NOT NULL REFERENCES requirement_catalog(id) ON DELETE CASCADE,
  status            TEXT    NOT NULL DEFAULT 'ej_paborjad', -- uppfylld | pagaende | brist | ej_paborjad
  senast_genomfort  TEXT,
  nasta_forfallo    TEXT,
  ansvarig          TEXT    NOT NULL DEFAULT '',
  evidens           TEXT    NOT NULL DEFAULT '',
  -- Organisationens egen anteckning. Till skillnad från katalogtexten är den
  -- lokal, och den följer aldrig med till en annan kommun.
  lokal_not         TEXT    NOT NULL DEFAULT '',
  UNIQUE (org_id, krav_id)
);

-- Användare. I skarp drift ersätts lösenord av federerad inloggning, men
-- rollen och kopplingen till verksamhet stannar i den här tabellen.
CREATE TABLE users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  namn              TEXT    NOT NULL,
  epost             TEXT    NOT NULL UNIQUE,
  losenord_hash     TEXT    NOT NULL,
  losenord_salt     TEXT    NOT NULL,
  aktiv             INTEGER NOT NULL DEFAULT 1,
  -- Driftpersonal hos leverantören. Att lägga upp en NY organisation är till
  -- sin natur en operation över organisationsgränsen, och får därför inte
  -- följa av att någon är administratör i sin egen kommun. Rollen styr vad en
  -- användare får göra inom en organisation; den här flaggan styr vad som får
  -- göras utanför alla.
  leverantor        INTEGER NOT NULL DEFAULT 0,
  senaste_inloggning TEXT,
  skapad            TEXT    NOT NULL
);

-- Medlemskap. En användare kan ha åtkomst till flera organisationer, med olika
-- roll i var och en. Driftpersonal hos leverantören får på så sätt åtkomst till
-- de kommuner de ansvarar för, utan att ett konto kan nå alla.
CREATE TABLE user_orgs (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id    INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  roll      TEXT    NOT NULL,
  unit_id   INTEGER REFERENCES units(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, org_id)
);

-- Inbjudan till en organisation.
--
-- Medvetet enkel och medvetet tillfällig. När inloggningen går mot kommunens
-- katalogtjänst blir inbjudan en fråga om att koppla en grupp, inte om att
-- skapa konton, och då försvinner tabellen.
CREATE TABLE invitations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  epost         TEXT    NOT NULL,
  roll          TEXT    NOT NULL,
  unit_id       INTEGER REFERENCES units(id) ON DELETE SET NULL,
  -- Själva koden lagras aldrig, bara hashen av den. Den som läser databasen
  -- ska inte kunna ta över en obesvarad inbjudan.
  token_hash    TEXT    NOT NULL,
  token_salt    TEXT    NOT NULL,
  skapad        TEXT    NOT NULL,
  gar_ut        TEXT    NOT NULL,
  inbjuden_av   TEXT    NOT NULL,
  accepterad    TEXT,
  -- En obesvarad inbjudan per adress och organisation. Samma person kan bjudas
  -- in till flera organisationer.
  UNIQUE (org_id, epost)
);

CREATE INDEX idx_invitations_org ON invitations(org_id, accepterad);

-- Sessioner lagras i databasen i stället för enbart i en cookie, så att en
-- session kan återkallas och så att aktiva inloggningar går att granska.
CREATE TABLE sessions (
  id          TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Vilken organisation sessionen arbetar i just nu. Byte kräver medlemskap.
  org_id      INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  skapad      TEXT    NOT NULL,
  gar_ut      TEXT    NOT NULL,
  senast_aktiv TEXT   NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Gallringsfrister per kategori av personuppgifter.
--
-- Fristen är INTE en teknisk inställning utan ett arkivrättsligt beslut.
-- Kommunens gallring styrs av arkivlagen (1990:782) och kommunens egen
-- dokumenthanteringsplan, beslutad av arkivmyndigheten. Systemet får därför
-- inte ha en inbyggd frist som utger sig för att vara lag: raden finns med
-- frist NULL tills kommunen beslutat, och visas till dess som obeslutad.
CREATE TABLE gallringsregler (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id          INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  kategori        TEXT    NOT NULL,          -- nyckel i PERSONUPPGIFTER, se personuppgifter.ts
  -- Antal månader efter att uppgiften blivit inaktuell. NULL = ej beslutad.
  frist_manader   INTEGER,
  beslutad_av     TEXT    NOT NULL DEFAULT '',
  beslutsdatum    TEXT,
  anmarkning      TEXT    NOT NULL DEFAULT '',
  UNIQUE (org_id, kategori)
);

CREATE INDEX idx_gallring_org ON gallringsregler(org_id);

-- Spårbarhet: varje ändring loggas (krav vid tillsyn och säkerhetsskyddsanalys)
CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        INTEGER REFERENCES organisations(id) ON DELETE CASCADE,
  tidpunkt      TEXT    NOT NULL,
  anvandare     TEXT    NOT NULL,
  handelse      TEXT    NOT NULL,
  objekt        TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX idx_units_org         ON units(org_id);
CREATE INDEX idx_positions_org     ON positions(org_id);
CREATE INDEX idx_people_org        ON people(org_id);
CREATE INDEX idx_placements_org    ON placements(org_id);
CREATE INDEX idx_risks_org         ON risks(org_id);
CREATE INDEX idx_functions_org     ON critical_functions(org_id);
CREATE INDEX idx_dependencies_org  ON dependencies(org_id);
CREATE INDEX idx_resources_org     ON resources(org_id);
CREATE INDEX idx_exercises_org     ON exercises(org_id);
CREATE INDEX idx_actions_org       ON actions(org_id);
CREATE INDEX idx_reqstatus_org     ON requirement_status(org_id);
CREATE INDEX idx_reqstatus_krav    ON requirement_status(krav_id);
CREATE INDEX idx_catalog_galler    ON requirement_catalog(galler_for);
CREATE INDEX idx_audit_org         ON audit_log(org_id, tidpunkt);
CREATE INDEX idx_user_orgs_org     ON user_orgs(org_id);
CREATE INDEX idx_positions_unit    ON positions(unit_id);
CREATE INDEX idx_people_unit       ON people(unit_id);
-- Nyckeln är unik inom organisationen, inte globalt: två kommuner numrerar
-- sin personal oberoende av varandra.
CREATE UNIQUE INDEX idx_people_extern ON people(org_id, extern_id) WHERE extern_id IS NOT NULL;
CREATE INDEX idx_placements_pos    ON placements(position_id);
CREATE INDEX idx_placements_person ON placements(person_id);
CREATE INDEX idx_dependencies_fn   ON dependencies(function_id);
CREATE INDEX idx_actions_status    ON actions(status);
CREATE INDEX idx_actions_forfallo  ON actions(forfallodatum);
