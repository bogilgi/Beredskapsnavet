import { Panel, Sidrubrik, Stat, Pill, Notis } from "@/components/ui";
import { Vaxlare, AtgardsKnapp } from "@/components/kontroller";
import { satRoll, taBortMedlemskap, tvingaUtloggning } from "@/lib/admin-actions";
import { bjudInAnvandare, aterkallaInbjudan } from "@/lib/inbjudan-actions";
import { begarAterstallning } from "@/lib/losenord-actions";
import { Formular } from "@/components/formular";
import { kravLas } from "@/lib/session";
import { hamtaAnvandarlista, hamtaInbjudningar, hamtaLogg, hamtaUnits } from "@/lib/queries";
import {
  BEHORIGHET, MODULER, MODULNAMN, ROLLER, ROLLBESKRIVNING, ROLLNAMN,
  farSkriva, type Modul, type Roll,
} from "@/lib/behorighet";
import { datum, datumTid } from "@/lib/format";

export const dynamic = "force-dynamic";

const NIVATEXT: Record<string, { text: string; klass: string }> = {
  skriv: { text: "Ändra", klass: "bg-ok-bg text-ok-text" },
  las: { text: "Läsa", klass: "bg-blue-50 text-blue-800" },
  ingen: { text: "–", klass: "text-slate-300" },
};

export default async function Anvandarsida() {
  const anvandare = await kravLas("anvandare");
  const skriv = farSkriva(anvandare.roll, "anvandare");
  const orgId = anvandare.org_id;
  const lista = hamtaAnvandarlista(orgId);
  const logg = hamtaLogg(orgId, 25);
  const inbjudningar = hamtaInbjudningar(orgId);
  const enheter = hamtaUnits(orgId);

  const aktiva = lista.filter((a) => a.aktiv === 1);
  const inloggade = lista.filter((a) => a.aktiva_sessioner > 0);

  return (
    <>
      <Sidrubrik
        rubrik="Användare och behörighet"
        lagrum="Säkerhetsskyddslagen (2018:585) 2 kap. samt dataskyddsförordningen"
        beskrivning="Åtkomsten styrs per modul och roll. Systemet innehåller personuppgifter och uppgifter om säkerhetsprövning, och behörigheten ska därför vara begränsad till den som behöver uppgifterna i sitt arbete. Varje ändring av en behörighet loggas."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <Stat etikett="Aktiva konton" varde={aktiva.length} enhet={`av ${lista.length}`} ton="ok" />
        <Stat
          etikett="Inloggade just nu"
          varde={inloggade.length}
          hint="Konton med minst en giltig session."
        />
        <Stat
          etikett="Avaktiverade konton"
          varde={lista.length - aktiva.length}
          ton={lista.length - aktiva.length > 0 ? "varning" : "ok"}
        />
        <Stat etikett="Roller" varde={ROLLER.length} hint="Behörighetsmatrisen nedan gäller alla konton." />
      </div>

      <Panel
        className="mb-5"
        rubrik="Konton"
        beskrivning="En ändrad roll slår igenom direkt genom att användarens sessioner återkallas."
        padding={false}
      >
        <table className="tabell">
          <thead>
            <tr>
              <th>Användare</th>
              <th className="w-20">Enhet</th>
              <th className="w-56">Roll</th>
              <th className="w-36">Senaste inloggning</th>
              <th className="w-28">Sessioner</th>
              <th className="w-24">Status</th>
              {skriv && <th className="w-40 ej-utskrift">Åtgärd</th>}
            </tr>
          </thead>
          <tbody>
            {lista.map((a) => (
              <tr key={a.id} className={a.aktiv === 1 ? "" : "opacity-60"}>
                <td>
                  <div className="font-medium text-slate-900">{a.namn}</div>
                  <div className="text-xs text-slate-500">{a.epost}</div>
                  <div className="text-[11px] text-slate-400">Upplagd {datum(a.skapad)}</div>
                </td>
                <td className="text-xs text-slate-600">{a.kortnamn ?? "–"}</td>
                <td>
                  {skriv && a.id !== anvandare.id ? (
                    <Vaxlare
                      id={a.id}
                      varde={a.roll}
                      bredd="w-52"
                      etikett={`Roll för ${a.namn}`}
                      action={satRoll}
                      alternativ={ROLLER.map((r) => ({ varde: r, etikett: ROLLNAMN[r] }))}
                    />
                  ) : (
                    <span className="text-sm text-slate-700">
                      {ROLLNAMN[a.roll as Roll] ?? a.roll}
                    </span>
                  )}
                  {a.id === anvandare.id && (
                    <div className="text-[11px] text-slate-500 mt-0.5">Ditt eget konto</div>
                  )}
                </td>
                <td className="text-xs text-slate-600">{datumTid(a.senaste_inloggning)}</td>
                <td>
                  {a.aktiva_sessioner > 0 ? (
                    <Pill ton="info">{a.aktiva_sessioner} aktiva</Pill>
                  ) : (
                    <span className="text-xs text-slate-400">Ingen</span>
                  )}
                </td>
                <td>
                  <Pill ton={a.aktiv === 1 ? "ok" : "allvarlig"}>
                    {a.aktiv === 1 ? "Aktivt" : "Avaktiverat"}
                  </Pill>
                </td>
                {skriv && (
                  <td className="ej-utskrift">
                    <div className="flex flex-col gap-1.5">
                      {a.id !== anvandare.id && (
                        <AtgardsKnapp
                          id={a.id}
                          action={taBortMedlemskap}
                          variant="diskret"
                          bekraftelse={`Ta bort ${a.namn}s behörighet till denna organisation och logga ut hen direkt?`}
                        >
                          Ta bort behörighet
                        </AtgardsKnapp>
                      )}
                      {a.aktiva_sessioner > 0 && (
                        <AtgardsKnapp id={a.id} action={tvingaUtloggning} variant="diskret">
                          Logga ut
                        </AtgardsKnapp>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {skriv && (
        <Panel
          className="mb-5"
          rubrik="Bjud in en användare"
          beskrivning="Inbjudan gäller den här organisationen och ger den roll du väljer. Har personen redan ett konto, till exempel för att hen arbetar i en annan kommun, tillkommer bara behörigheten — lösenordet rörs inte."
        >
          <Formular
            action={bjudInAnvandare}
            knapp="Skapa inbjudan"
            className="grid gap-4 sm:grid-cols-2 max-w-3xl"
          >
            <label className="block text-sm">
              <span className="block mb-1 font-medium text-slate-700">
                E-postadress<span className="text-allv-text"> *</span>
              </span>
              <input type="email" name="epost" required className="falt w-full" />
            </label>
            <label className="block text-sm">
              <span className="block mb-1 font-medium text-slate-700">
                Roll<span className="text-allv-text"> *</span>
              </span>
              <select name="roll" required defaultValue="beredskapssamordnare" className="falt w-full">
                {ROLLER.map((r) => (
                  <option key={r} value={r}>
                    {ROLLNAMN[r]}
                  </option>
                ))}
              </select>
              <span className="block mt-1 text-xs text-slate-500 leading-relaxed">
                Rollen styr vilka moduler personen når. Se behörighetsmatrisen nedan.
              </span>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="block mb-1 font-medium text-slate-700">Verksamhet</span>
              <select name="unit_id" defaultValue="" className="falt w-full">
                <option value="">Ingen särskild verksamhet</option>
                {enheter.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.namn}
                  </option>
                ))}
              </select>
            </label>
          </Formular>
        </Panel>
      )}

      {skriv && (
        <Panel
          className="mb-5"
          rubrik="Återställ lösenord"
          beskrivning="Skapar en engångslänk som användaren sätter ett nytt lösenord med. Installationen skickar ingen e-post, så länken förmedlar du själv. Alla pågående sessioner på kontot avslutas när lösenordet byts. Konton som loggar in mot katalogtjänsten behöver normalt ingen återställning."
        >
          <Formular
            action={begarAterstallning}
            knapp="Skapa återställningslänk"
            className="grid gap-4 sm:grid-cols-2 max-w-3xl"
          >
            <label className="block text-sm sm:col-span-2">
              <span className="block mb-1 font-medium text-slate-700">Konto</span>
              <select name="user_id" required defaultValue="" className="falt w-full">
                <option value="" disabled>
                  Välj en användare
                </option>
                {lista
                  .filter((a) => a.aktiv === 1)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.namn} — {a.epost}
                    </option>
                  ))}
              </select>
            </label>
          </Formular>
        </Panel>
      )}

      {inbjudningar.length > 0 && (
        <Panel
          className="mb-5"
          rubrik="Obesvarade inbjudningar"
          beskrivning="Länken visas bara när inbjudan skapas och går inte att läsa igen. Behöver den skickas om, återkalla inbjudan och skapa en ny."
          padding={false}
        >
          <table className="tabell">
            <thead>
              <tr>
                <th>E-post</th>
                <th className="w-48">Roll</th>
                <th className="w-40">Skapad</th>
                <th className="w-32">Giltig till</th>
                <th className="w-36">Konto</th>
                {skriv && <th className="w-32 ej-utskrift">Åtgärd</th>}
              </tr>
            </thead>
            <tbody>
              {inbjudningar.map((i) => (
                <tr key={i.id}>
                  <td className="font-medium text-slate-900">{i.epost}</td>
                  <td className="text-xs text-slate-600">
                    {ROLLNAMN[i.roll as Roll] ?? i.roll}
                    {i.kortnamn && <span className="block text-slate-500">{i.kortnamn}</span>}
                  </td>
                  <td className="text-xs text-slate-600">
                    {datum(i.skapad)}
                    <span className="block text-slate-500">av {i.inbjuden_av}</span>
                  </td>
                  <td className="text-xs text-slate-600">{datum(i.gar_ut)}</td>
                  <td className="text-xs text-slate-600">
                    {i.har_konto > 0 ? "Finns redan" : "Skapas vid svar"}
                  </td>
                  {skriv && (
                    <td className="ej-utskrift">
                      <AtgardsKnapp
                        id={i.id}
                        action={aterkallaInbjudan}
                        variant="diskret"
                        bekraftelse={`Återkalla inbjudan till ${i.epost}? Länken slutar fungera.`}
                      >
                        Återkalla
                      </AtgardsKnapp>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Panel
        className="mb-5"
        rubrik="Behörighetsmatris"
        beskrivning="Vad varje roll får göra i varje modul. Matrisen ligger i koden och versionshanteras, eftersom den är en policy som ska kunna granskas."
        padding={false}
      >
        <table className="tabell">
          <thead>
            <tr>
              <th>Modul</th>
              {ROLLER.map((r) => (
                <th key={r} className="w-28 text-center">
                  {ROLLNAMN[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULER.map((m: Modul) => (
              <tr key={m}>
                <td className="font-medium text-slate-800">{MODULNAMN[m]}</td>
                {ROLLER.map((r) => {
                  const n = NIVATEXT[BEHORIGHET[r][m]];
                  return (
                    <td key={r} className="text-center">
                      <span className={`text-xs font-medium rounded px-1.5 py-0.5 ${n.klass}`}>
                        {n.text}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-4 border-t border-slate-200 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {ROLLER.map((r) => (
            <div key={r}>
              <div className="text-xs font-semibold text-slate-800">{ROLLNAMN[r]}</div>
              <p className="text-xs text-slate-600 leading-relaxed">{ROLLBESKRIVNING[r]}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel rubrik="Spårbarhetslogg" beskrivning="De 25 senaste händelserna." padding={false}>
        <table className="tabell">
          <thead>
            <tr>
              <th className="w-40">Tidpunkt</th>
              <th className="w-44">Användare</th>
              <th>Händelse</th>
              <th>Objekt</th>
            </tr>
          </thead>
          <tbody>
            {logg.map((l) => (
              <tr key={l.id}>
                <td className="text-xs text-slate-600 tabular-nums">{datumTid(l.tidpunkt)}</td>
                <td className="text-sm text-slate-800">{l.anvandare}</td>
                <td className="text-sm text-slate-700">{l.handelse}</td>
                <td className="text-xs text-slate-600">{l.objekt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="mt-4 max-w-3xl">
        <Notis ton="info">
          Demoinstallationen använder lokala lösenord, hashade med scrypt och unikt salt. I skarp
          drift ersätts inloggningen av kommunens katalogtjänst med flerfaktorsautentisering, medan
          roller och behörighetsmatris stannar i systemet. Sessioner lagras i databasen och kan
          återkallas, vilket krävs för att en avslutad anställning ska få omedelbart genomslag.
        </Notis>
      </div>
    </>
  );
}
