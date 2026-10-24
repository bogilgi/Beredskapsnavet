import { redirect } from "next/navigation";
import { InloggningsFormular } from "@/components/inloggning";
import { hamtaAnvandare } from "@/lib/session";
import { startsida } from "@/lib/behorighet";
import { hamtaOrganisationer } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Demoinstallationens konton. I skarp drift sker inloggningen mot kommunens
// katalogtjänst och den här rutan finns inte.
const DEMOKONTON = [
  ["Beredskapssamordnare", "marika.ohlund@angsholm.se", "beredskap2026", "Ängsholm · full åtkomst utom behörigheter"],
  ["HR och personalförsörjning", "sara.molin@angsholm.se", "personal2026", "Ängsholm · endast krigsplacering"],
  ["Kommunledning", "henrik.lindgren@angsholm.se", "ledning2026", "Ängsholm · läser allt, ändrar inget"],
  ["Systemadministratör", "jens.akerlund@angsholm.se", "drift2026", "Ängsholm · allt, inklusive behörigheter"],
  ["Beredskapssamordnare", "tove.bergqvist@nordmark.se", "nordmark2026", "Nordmark · ser inga andra kommuner"],
  ["Beredskapssamordnare", "johan.stenmark@vreta.se", "vreta2026", "Vreta · nyansluten kommun, nästan tom"],
  ["Beredskapssamordnare, region", "helena.krantz@regionvastmark.se", "vastmark2026", "Region Västmark · andra lagkrav än en kommun"],
  ["Driftansvarig hos leverantören", "elsa.wikner@beredskapsnavet.se", "leverantor2026", "Alla fyra · registret och kravkatalogen"],
];

export default async function Inloggningssida({
  searchParams,
}: {
  searchParams: Promise<{ valkommen?: string }>;
}) {
  const { valkommen } = await searchParams;
  const anvandare = await hamtaAnvandare();
  if (anvandare) redirect(startsida(anvandare.roll));
  const organisationer = hamtaOrganisationer();

  return (
    <div className="min-h-screen bg-brand-800 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2 text-white self-center">
          <div className="flex items-center gap-2">
            <svg width="26" height="26" viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M10 1.5 3 4.3v5.2c0 4 2.9 7.6 7 9 4.1-1.4 7-5 7-9V4.3L10 1.5Z"
                fill="none"
                stroke="#9fc0e6"
                strokeWidth="1.6"
              />
              <path d="M10 6.2v7.6M6.4 10h7.2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="text-xl font-semibold tracking-tight">Beredskapsnavet</span>
          </div>
          <p className="mt-3 text-sm text-brand-100 leading-relaxed">
            Samlat stöd för krisberedskap och civilt försvar.
          </p>
          <p className="mt-3 text-xs text-brand-200/80 leading-relaxed">
            Installationen betjänar {organisationer.length} kommuner:{" "}
            {organisationer.map((o) => o.namn).join(", ")}. Du kommer åt de kommuner
            ditt konto har behörighet till.
          </p>
          <p className="mt-4 text-xs text-brand-200/80 leading-relaxed">
            Systemet innehåller personuppgifter och uppgifter om säkerhetsprövning. Åtkomsten är
            begränsad till den som behöver uppgifterna i sitt arbete, och varje inloggning och
            ändring loggas.
          </p>
        </div>

        <div className="lg:col-span-3 space-y-4">
          {/* Besked till den som just besvarat en inbjudan. Länken är förbrukad
              i det läget, så bekräftelsen hör hemma här och inte där. */}
          {valkommen && (
            <div role="status" className="kort p-4 border-l-4 border-ok-solid">
              <p className="text-sm text-slate-800 leading-relaxed">
                <span className="font-medium">Kontot är klart.</span> Du har nu behörighet till{" "}
                {valkommen}. Logga in med din e-postadress och det lösenord du valde.
              </p>
            </div>
          )}

          <div className="kort p-6">
            <h1 className="text-lg font-semibold text-slate-900 mb-4">Logga in</h1>
            <InloggningsFormular />
          </div>

          <div className="kort p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Demoinstallation – konton att prova
            </h2>
            <table className="tabell">
              <tbody>
                {DEMOKONTON.map(([roll, epost, losenord, atkomst]) => (
                  <tr key={epost}>
                    <td className="py-1.5">
                      <div className="text-sm font-medium text-slate-800">{roll}</div>
                      <div className="text-xs text-slate-500">{atkomst}</div>
                    </td>
                    <td className="py-1.5 text-xs font-mono text-slate-600 whitespace-nowrap">
                      {epost}
                      <br />
                      {losenord}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
              Logga in som kommunledning för att se att ändringsmöjligheter försvinner, som
              Tove för att se en kommun som bara kommer åt sin egen data, eller som Elsa för att
              byta mellan kommuner i topbaren. Spärrarna sitter på servern, inte i gränssnittet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
