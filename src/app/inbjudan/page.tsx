import Link from "next/link";
import { Formular } from "@/components/formular";
import { accepteraInbjudan } from "@/lib/inbjudan-actions";
import { lasInbjudan } from "@/lib/inbjudan";
import { ROLLBESKRIVNING, ROLLNAMN, type Roll } from "@/lib/behorighet";

export const dynamic = "force-dynamic";

export default async function Inbjudanssida({
  searchParams,
}: {
  searchParams: Promise<{ i?: string; t?: string }>;
}) {
  const { i = "", t = "" } = await searchParams;
  const inbjudan = lasInbjudan(Number(i), t);

  return (
    <div className="min-h-screen bg-brand-800 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-2 text-white mb-5">
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

        <div className="rounded-lg bg-white p-6 shadow-lg">
          {!inbjudan ? (
            // Samma besked oavsett om inbjudan saknas, är besvarad, har gått ut
            // eller koden är fel. Sidan ska inte gå att använda för att ta reda
            // på vilka adresser som är inbjudna.
            <>
              <h1 className="text-lg font-semibold text-slate-900">Inbjudan går inte att öppna</h1>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Länken är ogiltig, redan besvarad eller har gått ut. Inbjudningar gäller i sju
                dygn. Be den som bjöd in dig att skapa en ny.
              </p>
              <Link href="/logga-in" className="knapp-sekundar mt-5 inline-block">
                Till inloggningen
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-slate-900">
                Behörighet till {inbjudan.org_namn}
              </h1>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Du är inbjuden som{" "}
                <span className="font-medium text-slate-900">
                  {ROLLNAMN[inbjudan.roll as Roll] ?? inbjudan.roll}
                </span>{" "}
                med adressen{" "}
                <span className="font-medium text-slate-900">{inbjudan.epost}</span>.
              </p>
              <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                {ROLLBESKRIVNING[inbjudan.roll as Roll]}
              </p>

              <div className="mt-5 pt-5 border-t border-slate-200">
                <Formular
                  action={accepteraInbjudan}
                  knapp={inbjudan.har_konto ? "Lägg till behörigheten" : "Skapa kontot"}
                  className="grid gap-4"
                >
                  <input type="hidden" name="i" value={i} />
                  <input type="hidden" name="t" value={t} />

                  {inbjudan.har_konto ? (
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Du har redan ett konto med den här adressen. Behörigheten till{" "}
                      {inbjudan.org_namn} läggs till, och ditt lösenord ändras inte.
                    </p>
                  ) : (
                    <>
                      <label className="block text-sm">
                        <span className="block mb-1 font-medium text-slate-700">
                          Ditt namn<span className="text-allv-text"> *</span>
                        </span>
                        <input type="text" name="namn" required className="falt w-full" />
                      </label>
                      <label className="block text-sm">
                        <span className="block mb-1 font-medium text-slate-700">
                          Lösenord<span className="text-allv-text"> *</span>
                        </span>
                        <input
                          type="password"
                          name="losenord"
                          required
                          minLength={12}
                          autoComplete="new-password"
                          className="falt w-full"
                        />
                        <span className="block mt-1 text-xs text-slate-500 leading-relaxed">
                          Minst 12 tecken. Systemet innehåller personuppgifter och uppgifter om
                          säkerhetsprövning.
                        </span>
                      </label>
                      <label className="block text-sm">
                        <span className="block mb-1 font-medium text-slate-700">
                          Upprepa lösenordet<span className="text-allv-text"> *</span>
                        </span>
                        <input
                          type="password"
                          name="losenord_igen"
                          required
                          autoComplete="new-password"
                          className="falt w-full"
                        />
                      </label>
                    </>
                  )}
                </Formular>

                <p className="mt-4 text-xs text-slate-500 leading-relaxed">
                  Är du klar? <Link href="/logga-in" className="font-medium text-brand-700 hover:underline">Logga in här</Link>.
                </p>
              </div>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-brand-200/80 leading-relaxed">
          Lokala lösenord är en tillfällig lösning. I skarp drift sker inloggningen mot
          kommunens katalogtjänst med flerfaktorsautentisering.
        </p>
      </div>
    </div>
  );
}
