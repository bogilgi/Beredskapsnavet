-- Beredskapsnavet – datamodell
-- Målgrupp: beredskapssamordnare i kommun/region.
-- All data lagras lokalt i SQLite. Inga personuppgifter lämnar driftmiljön.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE organisations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  kortnamn          TEXT    NOT NULL UNIQUE,      -- används i sökvägar och loggar
  namn              TEXT    NOT NULL,
  typ               TEXT    NOT NULL,             -- kommun | region
  lan               TEXT    NOT NULL,
  invanare          INTEGER NOT NULL,
  mandatperiod      TEXT    NOT NULL,             -- t.ex. "2027-2030"
  beredskapsniva    TEXT    NOT NULL,             -- fredstida | beredskapslarm | hojd_beredskap
  samordnare        TEXT    NOT NULL,
  samordnare_epost  TEXT    NOT NULL,
  tib_telefon       TEXT    NOT NULL,
  uppdaterad        TEXT    NOT NULL,
  ansluten          TEXT    NOT NULL,             -- när kommunen började använda systemet
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

-- Lagkrav och överenskommelser med status
CREATE TABLE requirements (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  kod               TEXT    NOT NULL,
  rubrik            TEXT    NOT NULL,
  lagrum            TEXT    NOT NULL,
  beskrivning       TEXT    NOT NULL DEFAULT '',
  intervall         TEXT    NOT NULL,             -- mandatperiod | arligen | lopande | engang
  status            TEXT    NOT NULL,             -- uppfylld | pagaende | brist | ej_paborjad
  senast_genomfort  TEXT,
  nasta_forfallo    TEXT,
  ansvarig          TEXT    NOT NULL DEFAULT '',
  evidens           TEXT    NOT NULL DEFAULT '',
  modul             TEXT    NOT NULL DEFAULT '',  -- vilken modul som styrker kravet
  -- Källhänvisning till författningstexten, så att varje krav går att granska.
  kalla_url         TEXT    NOT NULL DEFAULT '',
  -- gallande | upphor | foreslagen. Lagstiftningen på området ändras, och
  -- ett krav som är på väg att ersättas måste synas som sådant.
  giltighet         TEXT    NOT NULL DEFAULT 'gallande',
  giltighet_not     TEXT    NOT NULL DEFAULT '',
  UNIQUE (org_id, kod)
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
CREATE INDEX idx_requirements_org  ON requirements(org_id);
CREATE INDEX idx_audit_org         ON audit_log(org_id, tidpunkt);
CREATE INDEX idx_user_orgs_org     ON user_orgs(org_id);
CREATE INDEX idx_positions_unit    ON positions(unit_id);
CREATE INDEX idx_people_unit       ON people(unit_id);
CREATE INDEX idx_placements_pos    ON placements(position_id);
CREATE INDEX idx_placements_person ON placements(person_id);
CREATE INDEX idx_dependencies_fn   ON dependencies(function_id);
CREATE INDEX idx_actions_status    ON actions(status);
CREATE INDEX idx_actions_forfallo  ON actions(forfallodatum);
