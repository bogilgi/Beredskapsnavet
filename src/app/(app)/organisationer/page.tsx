import { kravLeverantor } from "@/lib/session";
import { Panel, Sidrubrik, Stat, Pill, Notis, Tomt } from "@/components/ui";
import { laggUppOrganisation } from "@/lib/admin-actions";
import { hamtaKravantalPerTyp, hamtaRegister } from "@/lib/queries";
import { datum, tal } from "@/lib/format";

// Registret läses ur databasen vid varje begäran och får inte cachas.
export const dynamic = "force-dynamic";

const TYPNAMN: Record<string, string> = {
  kommun: "Kommun",
  region: "Region",
  kommun_region: "Kommun och region",
};

export default async function Organisationssida({
  searchParams,
}: {
  searchParams: Promise<{ sok?: string; lan?: string; typ?: string; anslut?: string }>;
}) {
  // Sidan visar vilka andra kommuner som är kunder och får därför inte nås av
  // en administratör i en enskild kommun. Spärren kräver leverantörsbehörighet.
  const anvandare = await kravLeverantor("organisationer");
  const { sok = "", lan = "", typ = "", anslut } = await searchParams;

  const register = hamtaRegister();
  const kravantal = Object.fromEntries(hamtaKravantalPerTyp().map((r) => [r.typ, r.antal]));
  const lanLista = [...new Set(register.map((r) => r.lan))].sort((a, b) => a.localeCompare(b, "sv"));

  const sokt = sok.trim().toLowerCase();
  const traffar = register.filter(
    (r) =>
      (!sokt || r.namn.toLowerCase().includes(sokt) || r.kod.startsWith(sokt)) &&
      (!lan || r.lan === lan) &&
      // Gotland är både kommun och region och ska synas under båda filtren.
      (!typ || r.typ === typ || r.typ === "kommun_region"),
  );

  const anslutna = register.filter((r) => r.org_id !== null);
  const valdForAnslutning = anslut
    ? register.find((r) => String(r.id) === anslut && r.org_id === null)
    : undefined;

  // Kommunerna räknas inklusive Gotland, som är en av de 290, och regionerna
  // likaså. Summan av de två är därför 311 medan antalet juridiska personer
  // är 310, vilket är hela poängen med typen kommun_region.
  const arKommun = (t: string) => t === "kommun" || t === "kommun_region";
  const arRegion = (t: string) => t === "region" || t === "kommun_region";

  return (
    <>
      <Sidrubrik
        rubrik="Anslutna organisationer"
        beskrivning={`Samtliga kommuner och regioner i landet, med uppgift om vilka som är anslutna till installationen. Att ansluta en organisation hämtar namn, län, huvudmannatyp och tillsynsmyndighet ur registret, och skapar kravlistan ur den delade katalogen efter huvudmannatyp.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <Stat
          etikett="Organisationer i landet"
          varde={register.length}
          ton="info"
          hint="290 kommuner och 21 regioner, men 310 juridiska personer: Gotlands kommun fullgör både kommunens och regionens uppgifter."
        />
        <Stat etikett="Anslutna" varde={anslutna.length} enhet={`av ${register.length}`} ton="ok" />
        <Stat
          etikett="Anslutna kommuner"
          varde={anslutna.filter((r) => arKommun(r.typ)).length}
          enhet={`av ${register.filter((r) => arKommun(r.typ)).length}`}
          ton="neutral"
        />
        <Stat
          etikett="Anslutna regioner"
          varde={anslutna.filter((r) => arRegion(r.typ)).length}
          enhet={`av ${register.filter((r) => arRegion(r.typ)).length}`}
          ton="neutral"
        />
      </div>

      {valdForAnslutning && (
        <Panel
          rubrik={`Anslut ${valdForAnslutning.namn}`}
          beskrivning={`${TYPNAMN[valdForAnslutning.typ]} i ${valdForAnslutning.lan}, kommunkod ${valdForAnslutning.kod}. Får ${kravantal[valdForAnslutning.typ] ?? 0} krav ur katalogen. Tillsynsmyndighet enligt cybersäkerhetsförordningen: ${valdForAnslutning.tillsyn_cyber}.`}
        >
          <form action={laggUppOrganisation} className="grid gap-4 sm:grid-cols-2 max-w-3xl">
            <input type="hidden" name="registry_id" value={valdForAnslutning.id} />
            <Falt
              namn="samordnare"
              etikett="Beredskapssamordnare"
              krav
              hjalp="Blir standardansvarig på samtliga krav."
            />
            <Falt namn="samordnare_epost" etikett="E-post till samordnaren" typ="email" krav />
            <Falt namn="tib_telefon" etikett="Telefon, tjänsteperson i beredskap" />
            <Falt
              namn="mandatperiod"
              etikett="Mandatperiod"
              standard="2027-2030"
              hjalp="Styr förfallodatum för de krav som följer mandatperioden."
            />
            <Falt
              namn="invanare"
              etikett="Antal invånare"
              hjalp="Frivilligt. Styr ingen bedömning: storlekstestet i cybersäkerhetslagen utgår från antal anställda."
            />
            <div className="sm:col-span-2 flex items-center gap-3 pt-1">
              <button type="submit" className="knapp-primar">
                Anslut organisationen
              </button>
              <a href="/organisationer" className="knapp-sekundar">
                Avbryt
              </a>
            </div>
          </form>
        </Panel>
      )}

      <Panel
        rubrik="Registret"
        beskrivning={`Källa: SCB:s läns- och kommunkoder samt cybersäkerhetsförordningen (2025:1507). ${traffar.length} av ${register.length} visas.`}
      >
        <form method="get" className="flex flex-wrap items-end gap-3 mb-4">
          <label className="text-xs text-slate-600">
            <span className="block mb-1 font-medium text-slate-700">Sök namn eller kod</span>
            <input
              type="search"
              name="sok"
              defaultValue={sok}
              placeholder="Örebro, 1880 …"
              className="falt w-52"
            />
          </label>
          <label className="text-xs text-slate-600">
            <span className="block mb-1 font-medium text-slate-700">Län</span>
            <select name="lan" defaultValue={lan} className="falt w-52">
              <option value="">Alla län</option>
              {lanLista.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            <span className="block mb-1 font-medium text-slate-700">Huvudman</span>
            <select name="typ" defaultValue={typ} className="falt w-40">
              <option value="">Alla</option>
              <option value="kommun">Kommun</option>
              <option value="region">Region</option>
            </select>
          </label>
          <button type="submit" className="knapp-sekundar">
            Filtrera
          </button>
          {(sok || lan || typ) && (
            <a href="/organisationer" className="text-xs font-medium text-brand-700 hover:underline">
              Rensa
            </a>
          )}
        </form>

        {traffar.length === 0 ? (
          <Tomt>Ingen organisation matchar filtret.</Tomt>
        ) : (
          <div className="max-h-[32rem] overflow-y-auto border border-slate-200 rounded-md">
            <table className="tabell">
              <thead>
                <tr>
                  <th className="w-20">Kod</th>
                  <th>Organisation</th>
                  <th className="w-44">Huvudman</th>
                  <th className="w-48">Län</th>
                  <th className="w-36">Status</th>
                  <th className="w-28 ej-utskrift">Åtgärd</th>
                </tr>
              </thead>
              <tbody>
                {traffar.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="font-mono text-xs text-slate-500">{r.kod}</span>
                    </td>
                    <td className="font-medium text-slate-900">{r.namn}</td>
                    <td className="text-xs text-slate-600">
                      {TYPNAMN[r.typ]}
                      {r.typ === "kommun_region" && (
                        <span className="block text-slate-500">
                          Får båda kravuppsättningarna
                        </span>
                      )}
                    </td>
                    <td className="text-xs text-slate-600">{r.lan}</td>
                    <td className="text-xs">
                      {r.org_id === null ? (
                        <span className="text-slate-500">Ej ansluten</span>
                      ) : (
                        <>
                          <Pill ton="ok">Ansluten</Pill>
                          <span className="block text-slate-500 mt-0.5">{datum(r.ansluten)}</span>
                        </>
                      )}
                    </td>
                    <td className="ej-utskrift">
                      {r.org_id === null && (
                        <a
                          href={`/organisationer?anslut=${r.id}`}
                          className="text-xs font-medium text-brand-700 hover:underline"
                        >
                          Anslut →
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="mt-4 max-w-3xl">
        <Notis ton="info">
          Registret är referensdata och inte kunddata: det filtreras inte på organisation, och
          visar därför vilka andra kommuner som är kunder. Därför krävs leverantörsbehörighet,
          inte bara rollen administratör. Du är inloggad som {anvandare.namn}. Anslutning loggas i
          spårbarhetsloggen både hos den nya organisationen och hos den du arbetar i.
        </Notis>
      </div>
    </>
  );
}

function Falt({
  namn,
  etikett,
  typ = "text",
  krav = false,
  standard,
  hjalp,
}: {
  namn: string;
  etikett: string;
  typ?: string;
  krav?: boolean;
  standard?: string;
  hjalp?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="block mb-1 font-medium text-slate-700">
        {etikett}
        {krav && <span className="text-allv-text"> *</span>}
      </span>
      <input type={typ} name={namn} required={krav} defaultValue={standard} className="falt w-full" />
      {hjalp && <span className="block mt-1 text-xs text-slate-500 leading-relaxed">{hjalp}</span>}
    </label>
  );
}
