import Link from "next/link";
import { kravLas } from "@/lib/session";
import { farSkriva } from "@/lib/behorighet";
import { Panel, Sidrubrik, Stat, Status, Pill, Notis, Tomt } from "@/components/ui";
import { Vaxlare, GlobalKnapp } from "@/components/kontroller";
import { satPlaceringsStatus, beslutaAllaUtanKonflikt } from "@/lib/actions";
import {
  hamtaPlaceringar, hamtaKonflikter, hamtaPersonal, hamtaPositioner,
} from "@/lib/queries";
import { PLACERINGSSTATUS, REGISTERKONTROLL, SAKERHETSKLASS } from "@/lib/domain";
import { datum, procent, tal } from "@/lib/format";

// Innehållet läses ur databasen vid varje begäran. Sidan får inte
// cachas som statisk HTML, då flera användare delar samma data.
export const dynamic = "force-dynamic";

const KONFLIKTRUBRIK: Record<string, string> = {
  fm: "Redan krigsplacerad i Försvarsmakten",
  plikt: "Har annan plikt",
  dubbel: "Dubbelplacerad i krigsorganisationen",
  registerkontroll: "Saknar godkänd registerkontroll",
  vakans: "Vakans på oumbärlig befattning",
};

export default async function Krigsplaceringssida() {
  const anvandare = await kravLas("krigsplacering");
  const skriv = farSkriva(anvandare.roll, "krigsplacering");
  const orgId = anvandare.org_id;
  const placeringar = hamtaPlaceringar(orgId);
  const konflikter = hamtaKonflikter(orgId);
  const personal = hamtaPersonal(orgId);
  const positioner = hamtaPositioner(orgId);

  const platser = positioner.reduce((s, p) => s + p.platser, 0);
  const beslutade = placeringar.filter((p) => ["beslutad", "underrattad"].includes(p.status));
  const underrattade = placeringar.filter((p) => p.status === "underrattad");
  const foreslagna = placeringar.filter((p) => p.status === "foreslagen");

  const utanKonflikt = foreslagna.filter(
    (p) =>
      p.fm_krigsplacerad === 0 &&
      !p.annan_plikt &&
      (p.sakerhetsklass === "ingen" || p.registerkontroll === "klar"),
  );

  const grupperade = Object.entries(
    konflikter.reduce<Record<string, typeof konflikter>>((acc, k) => {
      (acc[k.typ] ||= []).push(k);
      return acc;
    }, {}),
  );

  const ejPlacerade = personal.filter((p) => p.antal_placeringar === 0);

  return (
    <>
      <Sidrubrik
        rubrik="Krigsplacering"
        lagrum="Lag (1994:1809) om totalförsvarsplikt samt förordning (2015:1053) om totalförsvar och höjd beredskap"
        beskrivning="Koppling mellan person och befattning i krigsorganisationen, med beslut och underrättelse. Systemet kontrollerar automatiskt samrådsplikt, dubbelplaceringar och säkerhetsprövning innan en placering kan beslutas."
        atgard={
          skriv ? (
          <div className="flex items-center gap-2">
          <Link href="/krigsplacering/import" className="knapp-sekundar">
            Importera personal
          </Link>
          <GlobalKnapp
            action={beslutaAllaUtanKonflikt}
            variant="primar"
            bekraftelse={`Besluta ${utanKonflikt.length} krigsplaceringar som saknar öppna avvikelser?`}
          >
            Besluta {utanKonflikt.length} utan avvikelse
          </GlobalKnapp>
          </div>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <Stat
          etikett="Beslutade placeringar"
          varde={beslutade.length}
          enhet={`av ${tal(platser)} platser`}
          ton={procent(beslutade.length, platser) >= 90 ? "ok" : "varning"}
          hint={`${procent(beslutade.length, platser)}% av krigsorganisationen är bemannad.`}
        />
        <Stat
          etikett="Underrättade"
          varde={underrattade.length}
          hint="Den enskilde ska underrättas om sin krigsplacering."
          ton={underrattade.length < beslutade.length ? "varning" : "ok"}
        />
        <Stat
          etikett="Föreslagna, väntar på beslut"
          varde={foreslagna.length}
          ton={foreslagna.length > 0 ? "varning" : "ok"}
          hint={`${utanKonflikt.length} av dem saknar öppna avvikelser och kan beslutas direkt.`}
        />
        <Stat
          etikett="Avvikelser att hantera"
          varde={konflikter.length}
          ton={konflikter.filter((k) => k.allvarlig).length > 0 ? "allvarlig" : "varning"}
          hint={`${konflikter.filter((k) => k.allvarlig).length} bedöms som allvarliga.`}
        />
      </div>

      <Panel
        className="mb-5"
        rubrik="Automatiska kontroller"
        beskrivning="Kontrollerna körs mot personalregistret och krigsorganisationen vid varje ändring."
        padding={false}
      >
        {grupperade.length === 0 ? (
          <Tomt>Inga avvikelser.</Tomt>
        ) : (
          <div className="divide-y divide-slate-100">
            {grupperade.map(([typ, poster]) => (
              <div key={typ} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Pill ton={poster[0].allvarlig ? "allvarlig" : "varning"}>
                    {poster.length}
                  </Pill>
                  <h3 className="text-sm font-semibold text-slate-900">{KONFLIKTRUBRIK[typ]}</h3>
                </div>
                <ul className="space-y-1.5">
                  {poster.map((k, i) => (
                    <li key={i} className="text-sm flex flex-wrap gap-x-2 gap-y-0.5">
                      {k.person !== "—" && (
                        <span className="font-medium text-slate-800">{k.person}</span>
                      )}
                      <span className="text-slate-500">{k.befattning}</span>
                      <span className="text-slate-600">— {k.detalj}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        rubrik="Placeringar"
        beskrivning="Status ändras direkt i listan. Varje ändring loggas med tidpunkt och användare."
        padding={false}
        className="mb-5"
      >
        <table className="tabell">
          <thead>
            <tr>
              <th>Befattning</th>
              <th className="w-20">Enhet</th>
              <th>Person</th>
              <th className="w-32">Säkerhet</th>
              <th className="w-36">Beslut</th>
              <th className="w-32">Status</th>
              {skriv && <th className="w-36 ej-utskrift">Ändra</th>}
            </tr>
          </thead>
          <tbody>
            {placeringar.map((p) => {
              const avvikelse =
                p.fm_krigsplacerad === 1 ||
                !!p.annan_plikt ||
                (p.sakerhetsklass !== "ingen" && p.registerkontroll !== "klar");
              return (
                <tr key={p.id}>
                  <td>
                    <div className="font-medium text-slate-900">{p.titel}</div>
                    {p.kritikalitet === "A" && (
                      <span className="text-[10px] uppercase tracking-wide text-allv-text">
                        oumbärlig
                      </span>
                    )}
                  </td>
                  <td className="text-xs text-slate-600">{p.kortnamn}</td>
                  <td>
                    <div className="text-slate-800">{p.person ?? "Vakant"}</div>
                    <div className="text-xs text-slate-500">
                      {p.befattning_fred} · {p.pnr_maskerat}
                    </div>
                    {p.anmarkning && (
                      <div className="text-xs text-varn-text mt-0.5">{p.anmarkning}</div>
                    )}
                  </td>
                  <td className="text-xs">
                    {p.sakerhetsklass !== "ingen" && (
                      <div className="mb-1">
                        <Pill ton={p.registerkontroll === "klar" ? "ok" : "allvarlig"}>
                          {SAKERHETSKLASS[p.sakerhetsklass]}
                        </Pill>
                      </div>
                    )}
                    {p.sakerhetsklass !== "ingen" && (
                      <Status karta={REGISTERKONTROLL} nyckel={p.registerkontroll} />
                    )}
                    {p.fm_krigsplacerad === 1 && (
                      <div className="mt-1">
                        <Pill ton="allvarlig">Försvarsmakten</Pill>
                      </div>
                    )}
                    {p.annan_plikt && (
                      <div className="mt-1">
                        <Pill ton="varning">{p.annan_plikt}</Pill>
                      </div>
                    )}
                    {p.sakerhetsklass === "ingen" &&
                      p.fm_krigsplacerad === 0 &&
                      !p.annan_plikt && <span className="text-slate-600">–</span>}
                  </td>
                  <td className="text-xs text-slate-600">
                    {p.beslutsdatum ? datum(p.beslutsdatum) : "–"}
                  </td>
                  <td>
                    <Status karta={PLACERINGSSTATUS} nyckel={p.status} />
                  </td>
                  {skriv && (
                  <td className="ej-utskrift">
                    <Vaxlare
                      id={p.id}
                      varde={p.status}
                      etikett={`Status för ${p.person ?? "vakant"} på ${p.titel}`}
                      action={satPlaceringsStatus}
                      alternativ={[
                        { varde: "foreslagen", etikett: "Föreslagen" },
                        { varde: "beslutad", etikett: "Beslutad" },
                        { varde: "underrattad", etikett: "Underrättad" },
                        { varde: "avslutad", etikett: "Avslutad" },
                      ]}
                    />
                    {avvikelse && (
                      <div className="mt-1 text-[11px] text-allv-text">Avvikelse finns</div>
                    )}
                  </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Panel
        rubrik="Personal utan krigsplacering"
        beskrivning={`${ejPlacerade.length} av ${personal.length} registrerade medarbetare är inte placerade på någon befattning. Dessa utgör rekryteringsbas vid vakanser.`}
        padding={false}
      >
        <table className="tabell">
          <thead>
            <tr>
              <th>Namn</th>
              <th className="w-20">Enhet</th>
              <th>Befattning i fred</th>
              <th className="w-44">Noteringar</th>
            </tr>
          </thead>
          <tbody>
            {ejPlacerade.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="text-slate-800">{p.namn}</div>
                  <div className="text-xs text-slate-500">{p.pnr_maskerat}</div>
                </td>
                <td className="text-xs text-slate-600">{p.kortnamn}</td>
                <td className="text-sm text-slate-700">{p.befattning_fred}</td>
                <td className="text-xs text-slate-600">
                  {p.fm_krigsplacerad === 1 && <Pill ton="allvarlig">Försvarsmakten</Pill>}
                  {p.annan_plikt && <Pill ton="varning">{p.annan_plikt}</Pill>}
                  {p.noteringar}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="mt-4 max-w-3xl">
        <Notis ton="info">
          Personuppgifter visas maskerade. I skarp drift hämtas personalregistret från kommunens
          HR-system och lagras i egen driftmiljö. Krigsplacering är en behandling av personuppgifter
          som kräver rättslig grund, gallringsrutin och dokumenterad behörighetsstyrning.
        </Notis>
      </div>
    </>
  );
}
