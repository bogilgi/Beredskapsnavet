import { kravLas } from "@/lib/session";
import { farSkriva } from "@/lib/behorighet";
import { Panel, Sidrubrik, Stat, Pill, Notis, Tomt } from "@/components/ui";
import { Formular } from "@/components/formular";
import { AtgardsKnapp } from "@/components/kontroller";
import { satGallringsfrist, gallraPerson } from "@/lib/gallring-actions";
import { hamtaGallringsbara, hamtaGallringsregler, hamtaOrganisation } from "@/lib/queries";
import { PERSONUPPGIFTER } from "@/lib/personuppgifter";
import { datum, idag } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Lägger till månader på ett datum, för att räkna ut när fristen löper ut. */
function franDatum(d: string, antalManader: number): string {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCMonth(t.getUTCMonth() + antalManader);
  return t.toISOString().slice(0, 10);
}

export default async function Personuppgiftssida() {
  const anvandare = await kravLas("personuppgifter");
  const skriv = farSkriva(anvandare.roll, "personuppgifter");
  const orgId = anvandare.org_id;

  const org = hamtaOrganisation(orgId);
  const regler = Object.fromEntries(hamtaGallringsregler(orgId).map((r) => [r.kategori, r]));
  const avslutade = hamtaGallringsbara(orgId);

  const obeslutade = PERSONUPPGIFTER.filter((k) => regler[k.nyckel]?.frist_manader == null);
  const fristKrigsplacering = regler["krigsplacering"]?.frist_manader ?? null;

  // Fristen tillämpas här och inte i frågan, eftersom den kan saknas. En lista
  // som tyst utelämnade personer för att fristen inte är satt vore värre än en
  // som visar dem som obedömda.
  const bedomda = avslutade.map((p) => {
    const forfaller =
      fristKrigsplacering === null
        ? null
        : franDatum(p.anstallning_upphorde, fristKrigsplacering);
    return { ...p, forfaller, mogen: forfaller !== null && forfaller <= idag() };
  });
  const attGallra = bedomda.filter((p) => p.mogen && p.oppna_placeringar === 0);

  return (
    <>
      <Sidrubrik
        rubrik="Personuppgifter och gallring"
        lagrum="Dataskyddsförordningen artiklarna 5.1 e och 30, samt arkivlagen (1990:782)"
        beskrivning={`Registerförteckning över de personuppgifter ${org.namn} behandlar i systemet, och när de ska gallras. Förteckningen är ett arbetsunderlag och ersätter inte kommunens eget dataskyddsarbete — den ska granskas av dataskyddsombudet.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <Stat etikett="Kategorier av uppgifter" varde={PERSONUPPGIFTER.length} ton="info" />
        <Stat
          etikett="Frister ej beslutade"
          varde={obeslutade.length}
          ton={obeslutade.length > 0 ? "allvarlig" : "ok"}
          hint="En gallringsfrist är ett arkivrättsligt beslut. Utan beslut går gallringen inte att försvara vid tillsyn."
        />
        <Stat
          etikett="Avslutad personal"
          varde={avslutade.length}
          hint="Personer vars anställning upphört och som därför omfattas av gallring."
        />
        <Stat
          etikett="Mogna för gallring"
          varde={attGallra.length}
          ton={attGallra.length > 0 ? "varning" : "ok"}
          hint="Fristen har löpt ut och inga öppna placeringar återstår."
        />
      </div>

      {obeslutade.length > 0 && (
        <div className="mb-5 max-w-4xl">
          <Notis ton="allvarlig">
            <span className="font-medium">
              {obeslutade.length === 1
                ? "En kategori saknar beslutad gallringsfrist"
                : `${obeslutade.length} kategorier saknar beslutad gallringsfrist`}
              :
            </span>{" "}
            {obeslutade.map((k) => k.namn).join(", ")}. Systemet sätter med avsikt ingen frist
            själv. Gallring styrs av arkivlagen och kommunens dokumenthanteringsplan, beslutad av
            arkivmyndigheten — en frist inbyggd i ett system vore en gissning som ser ut som ett
            lagkrav.
          </Notis>
        </div>
      )}

      <Panel
        className="mb-5"
        rubrik="Registerförteckning"
        beskrivning="Ändamål, rättslig grund och vad som utlöser gallringen, per kategori. Förteckningen ligger i koden och versionshanteras, eftersom den är en policy som ska kunna granskas."
      >
        <div className="space-y-5">
          {PERSONUPPGIFTER.map((k) => {
            const regel = regler[k.nyckel];
            return (
              <div key={k.nyckel} className="pb-5 border-b border-slate-200 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">{k.namn}</h3>
                  {k.kanslig && <Pill ton="varning">Kräver särskild försiktighet</Pill>}
                  {regel?.frist_manader != null ? (
                    <Pill ton="ok">Frist {regel.frist_manader} mån</Pill>
                  ) : (
                    <Pill ton="allvarlig">Frist ej beslutad</Pill>
                  )}
                </div>

                <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2 text-xs leading-relaxed">
                  <Rad etikett="Ändamål">{k.andamal}</Rad>
                  <Rad etikett="Uppgifter">{k.uppgifter}</Rad>
                  <Rad etikett="Rättslig grund">{k.rattslig_grund}</Rad>
                  <Rad etikett="Förpliktelse">{k.forpliktelse}</Rad>
                  <Rad etikett="Gallringen utlöses av">{k.gallringsutlosare}</Rad>
                  <Rad etikett="Mottagare">{k.mottagare}</Rad>
                  {regel?.frist_manader != null && (
                    <Rad etikett="Beslut">
                      {regel.beslutad_av}
                      {regel.beslutsdatum ? `, ${datum(regel.beslutsdatum)}` : ""}
                      {regel.anmarkning ? `. ${regel.anmarkning}` : ""}
                    </Rad>
                  )}
                </dl>

                {skriv && (
                  <details className="mt-3">
                    <summary className="text-xs font-medium text-brand-700 cursor-pointer hover:underline">
                      {regel?.frist_manader != null ? "Ändra fristen" : "Besluta fristen"}
                    </summary>
                    <div className="mt-3">
                      <Formular
                        action={satGallringsfrist}
                        knapp="Spara beslutet"
                        className="grid gap-3 sm:grid-cols-2 max-w-2xl"
                      >
                        <input type="hidden" name="kategori" value={k.nyckel} />
                        <Falt
                          namn="frist_manader"
                          etikett="Frist i månader"
                          standard={regel?.frist_manader ?? ""}
                          hjalp="Räknat från att uppgiften blivit inaktuell. Lämna tomt för ej beslutad."
                        />
                        <Falt
                          namn="beslutad_av"
                          etikett="Beslutad av"
                          standard={regel?.beslutad_av ?? ""}
                          hjalp="Till exempel arkivmyndigheten eller kommunstyrelsen, med diarienummer."
                        />
                        <Falt
                          namn="beslutsdatum"
                          etikett="Beslutsdatum"
                          standard={regel?.beslutsdatum ?? ""}
                          hjalp="Lämna tomt för dagens datum."
                        />
                        <Falt
                          namn="anmarkning"
                          etikett="Anmärkning"
                          standard={regel?.anmarkning ?? ""}
                        />
                      </Formular>
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel
        rubrik="Avslutad personal"
        beskrivning={
          fristKrigsplacering === null
            ? "Fristen för krigsplacering är inte beslutad, så ingen av raderna kan bedömas. Besluta fristen ovan."
            : `Fristen är ${fristKrigsplacering} månader från att anställningen upphörde. Gallring tas bort raden helt; befattningen personen var placerad på blir vakant, vilket är riktigt — befattningen finns kvar, personen gör det inte.`
        }
        padding={false}
      >
        {bedomda.length === 0 ? (
          <div className="p-4">
            <Tomt>Ingen i personalregistret är registrerad med avslutad anställning.</Tomt>
          </div>
        ) : (
          <table className="tabell">
            <thead>
              <tr>
                <th>Person</th>
                <th className="w-48">Verksamhet</th>
                <th className="w-36">Anställning upphörde</th>
                <th className="w-40">Fristen löper ut</th>
                <th className="w-44">Hinder</th>
                {skriv && <th className="w-28 ej-utskrift">Åtgärd</th>}
              </tr>
            </thead>
            <tbody>
              {bedomda.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="font-medium text-slate-900">{p.namn}</div>
                    <div className="text-xs text-slate-500">{p.befattning_fred}</div>
                  </td>
                  <td className="text-xs text-slate-600">{p.unit}</td>
                  <td className="text-xs text-slate-600">{datum(p.anstallning_upphorde)}</td>
                  <td className="text-xs">
                    {p.forfaller === null ? (
                      <span className="text-slate-500">Frist ej beslutad</span>
                    ) : p.mogen ? (
                      <span className="text-varn-text font-medium">{datum(p.forfaller)}</span>
                    ) : (
                      <span className="text-slate-600">{datum(p.forfaller)}</span>
                    )}
                  </td>
                  <td className="text-xs">
                    {p.oppna_placeringar > 0 ? (
                      <span className="text-allv-text">
                        {p.oppna_placeringar} placering{p.oppna_placeringar > 1 ? "ar" : ""} ej
                        avslutad
                      </span>
                    ) : p.sakerhetsklass !== "ingen" ? (
                      <span className="text-slate-600">
                        Säkerhetsklass {p.sakerhetsklass}, kontroll: {p.registerkontroll}
                      </span>
                    ) : (
                      <span className="text-slate-600">–</span>
                    )}
                  </td>
                  {skriv && (
                    <td className="ej-utskrift">
                      {p.mogen && p.oppna_placeringar === 0 && (
                        <AtgardsKnapp
                          id={p.id}
                          action={gallraPerson}
                          variant="diskret"
                          bekraftelse={`Gallra samtliga personuppgifter om ${p.namn}? Åtgärden går inte att ångra. Loggen noterar att gallring skett, men inte vem den gällde.`}
                        >
                          Gallra
                        </AtgardsKnapp>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <div className="mt-4 max-w-3xl">
        <Notis ton="info">
          Spårbarhetsloggen noterar att gallring skett, med kategori, verksamhet och tillämpad
          frist — men varken namn eller personnummer. Att skriva in den gallrade personens namn i
          loggen skulle göra gallringen meningslös. Det som ska gå att visa vid tillsyn är att
          gallring skett enligt beslutad frist, inte vem den gällde.
        </Notis>
      </div>
    </>
  );
}

function Rad({ etikett, children }: { etikett: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-slate-700">{etikett}</dt>
      <dd className="text-slate-600">{children}</dd>
    </div>
  );
}

function Falt({
  namn, etikett, standard, hjalp,
}: {
  namn: string; etikett: string; standard?: string | number | null; hjalp?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="block mb-1 font-medium text-slate-700">{etikett}</span>
      <input type="text" name={namn} defaultValue={standard ?? ""} className="falt w-full" />
      {hjalp && <span className="block mt-1 text-xs text-slate-500 leading-relaxed">{hjalp}</span>}
    </label>
  );
}
