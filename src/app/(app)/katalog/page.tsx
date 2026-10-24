import { kravLeverantor } from "@/lib/session";
import { Panel, Sidrubrik, Stat, Status, Pill, Notis, Tomt } from "@/components/ui";
import { Formular } from "@/components/formular";
import { andraKrav, laggTillKrav, stamAvKrav } from "@/lib/katalog-actions";
import { hamtaKatalog, hamtaRevisioner } from "@/lib/queries";
import { INTERVALL, GILTIGHET } from "@/lib/domain";
import { datum, datumTid, tal } from "@/lib/format";

// Katalogen läses ur databasen vid varje begäran och får inte cachas.
export const dynamic = "force-dynamic";

const HUVUDMAN: Record<string, string> = {
  kommun: "Endast kommuner",
  region: "Endast regioner",
  bada: "Kommuner och regioner",
};

const MODULVAL = [
  ["", "Ingen modul styrker kravet"],
  ["rsa", "Risk- och sårbarhetsanalys"],
  ["kontinuitet", "Kontinuitetshantering"],
  ["krigsorganisation", "Krigsorganisation"],
  ["krigsplacering", "Krigsplacering"],
  ["resurser", "Resurser"],
  ["ovningar", "Övning och utbildning"],
];

export default async function Katalogsida({
  searchParams,
}: {
  searchParams: Promise<{ krav?: string; nytt?: string }>;
}) {
  // Katalogen delas av alla kunder. En ändring här är inte en åtgärd inom en
  // organisation utan över samtliga, och kräver därför leverantörsbehörighet.
  const anvandare = await kravLeverantor("katalog");
  const { krav: valdId, nytt } = await searchParams;

  const katalog = hamtaKatalog();
  const revisioner = hamtaRevisioner(25);
  const vald = valdId ? katalog.find((k) => String(k.id) === valdId) : undefined;

  const ejAvstamda = katalog.filter((k) => !k.kontrollerad);
  const genomslag = katalog.reduce((s, k) => s + k.berorda, 0);

  return (
    <>
      <Sidrubrik
        rubrik="Kravkatalogen"
        beskrivning="Den gemensamma kravtexten. En rättelse här når samtliga anslutna organisationer samtidigt, vilket är hela skälet till att katalogen är delad. Av samma skäl loggas varje ändring med före- och eftervärde, vem som gjorde den och varför."
        atgard={
          <a href={nytt ? "/katalog" : "/katalog?nytt=1"} className="knapp-sekundar">
            {nytt ? "Stäng formuläret" : "Nytt krav"}
          </a>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <Stat etikett="Krav i katalogen" varde={katalog.length} ton="info" />
        <Stat
          etikett="Ej avstämda mot källa"
          varde={ejAvstamda.length}
          ton={ejAvstamda.length > 0 ? "varning" : "ok"}
          hint="Rader vars lagrum ingen kontrollerat mot författningstext. De visas som okontrollerade även hos kunderna."
        />
        <Stat
          etikett="Under omarbetning"
          varde={katalog.filter((k) => k.giltighet !== "gallande").length}
          ton="info"
          hint="Krav som upphör eller bygger på ett förslag som ännu inte är beslutat."
        />
        <Stat
          etikett="Samlat genomslag"
          varde={tal(genomslag)}
          enhet="kravrader hos kunder"
          ton="neutral"
          hint="Summan av alla kunders kravlistor. Det är så många rader en katalogändring kan påverka."
        />
      </div>

      {nytt && (
        <Panel
          rubrik="Nytt krav i katalogen"
          beskrivning="Kravet läggs till hos varje ansluten organisation av rätt huvudmannatyp. Det läggs in som ej avstämt: att skriva in ett lagrum är inte detsamma som att ha kontrollerat det."
        >
          <Formular action={laggTillKrav} knapp="Lägg till i katalogen" className="grid gap-4 sm:grid-cols-2 max-w-4xl">
            <Falt namn="kod" etikett="Kod" krav hjalp="Versaler, siffror och bindestreck. Till exempel LKRB-SAMLING." />
            <Falt namn="rubrik" etikett="Rubrik" krav />
            <div className="sm:col-span-2">
              <Falt namn="lagrum" etikett="Lagrum" krav hjalp="Fullständig hänvisning, till exempel Lag (2006:544) 2 kap. 1 §." />
            </div>
            <div className="sm:col-span-2">
              <Textfalt namn="beskrivning" etikett="Beskrivning" rader={3} />
            </div>
            <Val namn="galler_for" etikett="Gäller huvudman" alternativ={Object.entries(HUVUDMAN)} standard="bada" />
            <Val
              namn="intervall"
              etikett="Intervall"
              alternativ={Object.entries(INTERVALL).map(([v, e]) => [v, String(e)])}
              standard="lopande"
            />
            <Val
              namn="giltighet"
              etikett="Rättslig status"
              alternativ={[["gallande", "Gällande"], ["upphor", "Upphör"], ["foreslagen", "Föreslagen"]]}
              standard="gallande"
            />
            <Val namn="modul" etikett="Styrks av modul" alternativ={MODULVAL} />
            <Falt namn="kalla_url" etikett="Källa (webbadress)" typ="url" />
            <Falt namn="standard_forfallo" etikett="Förfallodatum" hjalp="Lämna tomt för krav utan datum." />
            <div className="sm:col-span-2">
              <Falt namn="motivering" etikett="Varför läggs kravet till?" hjalp="Sparas i katalogens historik." />
            </div>
          </Formular>
        </Panel>
      )}

      {vald && (
        <Panel
          rubrik={`${vald.kod} · ${vald.rubrik}`}
          beskrivning={`Version ${vald.katalogversion}. Finns i ${tal(vald.berorda)} organisationers kravlistor, varav ${tal(vald.paborjade)} har redovisat arbete. En ändring av texten kräver ingen skrivning hos kunderna — den är delad.`}
        >
          <Formular action={andraKrav} knapp="Spara ändringen" avbryt="/katalog" className="grid gap-4 sm:grid-cols-2 max-w-4xl">
            <input type="hidden" name="id" value={vald.id} />
            <Falt namn="rubrik" etikett="Rubrik" krav standard={vald.rubrik} />
            <Falt namn="kalla_url" etikett="Källa (webbadress)" typ="url" standard={vald.kalla_url} />
            <div className="sm:col-span-2">
              <Falt namn="lagrum" etikett="Lagrum" krav standard={vald.lagrum} />
            </div>
            <div className="sm:col-span-2">
              <Textfalt namn="beskrivning" etikett="Beskrivning" rader={3} standard={vald.beskrivning} />
            </div>
            <div className="sm:col-span-2">
              <Textfalt
                namn="kontextmall"
                etikett="Kontextmall"
                rader={2}
                standard={vald.kontextmall}
                hjalp="Text som fylls med organisationens egna uppgifter vid läsning. Platshållare: {namn} {typ} {lan} {invanare} {anstallda} {storlek} {storleksgrund} {tillsyn}."
              />
            </div>
            <Val
              namn="galler_for"
              etikett="Gäller huvudman"
              alternativ={Object.entries(HUVUDMAN)}
              standard={vald.galler_for}
              hjalp="Ändras den här läggs kravet till eller tas bort ur kundernas listor."
            />
            <Val
              namn="intervall"
              etikett="Intervall"
              alternativ={Object.entries(INTERVALL).map(([v, e]) => [v, String(e)])}
              standard={vald.intervall}
            />
            <Val
              namn="giltighet"
              etikett="Rättslig status"
              alternativ={[["gallande", "Gällande"], ["upphor", "Upphör"], ["foreslagen", "Föreslagen"]]}
              standard={vald.giltighet}
            />
            <Val namn="modul" etikett="Styrks av modul" alternativ={MODULVAL} standard={vald.modul} />
            <div className="sm:col-span-2">
              <Textfalt
                namn="giltighet_not"
                etikett="Anmärkning om rättsläget"
                rader={2}
                standard={vald.giltighet_not}
              />
            </div>
            <div className="sm:col-span-2">
              <Falt
                namn="motivering"
                etikett="Varför ändras kravet?"
                krav
                hjalp="Minst fem tecken. Sparas i historiken tillsammans med före- och eftervärde."
              />
            </div>
          </Formular>

          <div className="mt-6 pt-5 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Avstämning mot källa</h3>
            <p className="text-xs text-slate-600 mb-3 max-w-2xl leading-relaxed">
              {vald.kontrollerad
                ? `Senast avstämd ${datum(vald.kontrollerad)}${vald.kontrollerad_av ? ` av ${vald.kontrollerad_av}` : ""}. Stäm av på nytt när författningstexten ändrats.`
                : "Kravet är inte avstämt mot författningstext och visas som okontrollerat hos samtliga kunder."}
            </p>
            <Formular action={stamAvKrav} knapp="Markera som avstämd" className="grid gap-3 sm:grid-cols-2 max-w-3xl">
              <input type="hidden" name="id" value={vald.id} />
              <Falt namn="kontrollerad" etikett="Datum" hjalp="Lämna tomt för idag." />
              <Falt namn="kalla_url" etikett="Källa" typ="url" standard={vald.kalla_url} />
              <Falt namn="motivering" etikett="Anteckning" />
            </Formular>
          </div>
        </Panel>
      )}

      <Panel rubrik="Katalogen" padding={false}>
        <table className="tabell">
          <thead>
            <tr>
              <th className="w-28">Kod</th>
              <th>Krav</th>
              <th className="w-48">Gäller</th>
              <th className="w-32">Rättslig status</th>
              <th className="w-36">Genomslag</th>
              <th className="w-40">Avstämd</th>
              <th className="w-24 ej-utskrift">Ändra</th>
            </tr>
          </thead>
          <tbody>
            {katalog.map((k) => (
              <tr key={k.id}>
                <td>
                  <span className="font-mono text-xs font-medium text-brand-700">{k.kod}</span>
                  <span className="block text-[11px] text-slate-600">v{k.katalogversion}</span>
                </td>
                <td className="max-w-xl">
                  <div className="font-medium text-slate-900">{k.rubrik}</div>
                  <div className="text-xs text-brand-700 mt-0.5">{k.lagrum}</div>
                  {k.giltighet_not && (
                    <p className="text-xs text-varn-text mt-1 leading-relaxed">{k.giltighet_not}</p>
                  )}
                </td>
                <td className="text-xs text-slate-600">
                  {HUVUDMAN[k.galler_for]}
                  <span className="block text-slate-500">{INTERVALL[k.intervall]}</span>
                </td>
                <td>
                  <Status karta={GILTIGHET} nyckel={k.giltighet} />
                </td>
                <td className="text-xs">
                  <span className="font-medium text-slate-900">{tal(k.berorda)}</span>
                  <span className="text-slate-500"> organisationer</span>
                  <span className="block text-slate-500">
                    {tal(k.paborjade)} har redovisat arbete
                  </span>
                </td>
                <td className="text-xs">
                  {k.kontrollerad ? (
                    <>
                      <span className="text-slate-600">{datum(k.kontrollerad)}</span>
                      <span className="block text-slate-500">{k.kontrollerad_av}</span>
                    </>
                  ) : (
                    <Pill ton="varning">Ej avstämd</Pill>
                  )}
                </td>
                <td className="ej-utskrift">
                  <a
                    href={`/katalog?krav=${k.id}`}
                    className="text-xs font-medium text-brand-700 hover:underline"
                  >
                    Öppna →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="mt-5">
        <Panel
          rubrik="Ändringshistorik"
          beskrivning="Varje ändring i katalogen med före- och eftervärde. Historiken är underlaget när en kund frågar varför ett lagrum i deras lista ser annorlunda ut än förra kvartalet."
          padding={false}
        >
          {revisioner.length === 0 ? (
            <div className="p-4">
              <Tomt>Katalogen har inte ändrats sedan den lades upp.</Tomt>
            </div>
          ) : (
            <table className="tabell">
              <thead>
                <tr>
                  <th className="w-40">Tidpunkt</th>
                  <th className="w-28">Krav</th>
                  <th className="w-32">Fält</th>
                  <th>Ändring</th>
                  <th className="w-36">Av</th>
                  <th className="w-28">Nådde</th>
                </tr>
              </thead>
              <tbody>
                {revisioner.map((v) => (
                  <tr key={v.id}>
                    <td className="text-xs text-slate-600">{datumTid(v.tidpunkt)}</td>
                    <td>
                      <span className="font-mono text-xs text-brand-700">{v.kod}</span>
                    </td>
                    <td className="text-xs text-slate-600">{v.falt}</td>
                    <td className="text-xs max-w-xl">
                      {v.fran && (
                        <span className="block text-slate-500 line-through">{kort(v.fran)}</span>
                      )}
                      <span className="block text-slate-900">{kort(v.till)}</span>
                      {v.motivering && (
                        <span className="block text-slate-500 mt-0.5">{v.motivering}</span>
                      )}
                    </td>
                    <td className="text-xs text-slate-700">{v.anvandare}</td>
                    <td className="text-xs text-slate-600">{tal(v.berorda)} org.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <div className="mt-4 max-w-3xl">
        <Notis ton="info">
          Du är inloggad som {anvandare.namn}. Ett krav som begränsas till färre huvudmän tas bort
          ur de kundernas listor, och det stoppas om någon av dem redovisat arbete på kravet —
          markera det som upphört i stället, så behåller kunderna sin redovisning.
        </Notis>
      </div>
    </>
  );
}

function kort(t: string) {
  return t.length > 180 ? t.slice(0, 180) + " …" : t || "(tomt)";
}

function Falt({
  namn, etikett, typ = "text", krav = false, standard, hjalp,
}: {
  namn: string; etikett: string; typ?: string; krav?: boolean;
  standard?: string | number | null; hjalp?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="block mb-1 font-medium text-slate-700">
        {etikett}
        {krav && <span className="text-allv-text"> *</span>}
      </span>
      <input
        type={typ}
        name={namn}
        required={krav}
        defaultValue={standard ?? ""}
        className="falt w-full"
      />
      {hjalp && <span className="block mt-1 text-xs text-slate-500 leading-relaxed">{hjalp}</span>}
    </label>
  );
}

function Textfalt({
  namn, etikett, rader = 3, standard, hjalp,
}: {
  namn: string; etikett: string; rader?: number; standard?: string | null; hjalp?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="block mb-1 font-medium text-slate-700">{etikett}</span>
      <textarea name={namn} rows={rader} defaultValue={standard ?? ""} className="falt w-full" />
      {hjalp && <span className="block mt-1 text-xs text-slate-500 leading-relaxed">{hjalp}</span>}
    </label>
  );
}

function Val({
  namn, etikett, alternativ, standard, hjalp,
}: {
  namn: string; etikett: string; alternativ: [string, string][] | string[][];
  standard?: string | null; hjalp?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="block mb-1 font-medium text-slate-700">{etikett}</span>
      <select name={namn} defaultValue={standard ?? ""} className="falt w-full">
        {alternativ.map(([v, e]) => (
          <option key={v} value={v}>
            {e}
          </option>
        ))}
      </select>
      {hjalp && <span className="block mt-1 text-xs text-slate-500 leading-relaxed">{hjalp}</span>}
    </label>
  );
}
