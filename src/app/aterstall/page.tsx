import Link from "next/link";
import { Formular } from "@/components/formular";
import { satNyttLosenord } from "@/lib/losenord-actions";
import { lasAterstallning } from "@/lib/losenord";

export const dynamic = "force-dynamic";

export default async function Aterstallningssida({
  searchParams,
}: {
  searchParams: Promise<{ i?: string; t?: string }>;
}) {
  const { i = "", t = "" } = await searchParams;
  const rad = lasAterstallning(Number(i), t);

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
          {!rad ? (
            // Samma besked oavsett om länken saknas, är använd, har gått ut
            // eller koden är fel.
            <>
              <h1 className="text-lg font-semibold text-slate-900">Länken går inte att öppna</h1>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Återställningslänken är ogiltig, redan använd eller har gått ut. Länkar gäller i
                ett dygn. Be organisationens administratör skapa en ny.
              </p>
              <Link href="/logga-in" className="knapp-sekundar mt-5 inline-block">
                Till inloggningen
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-slate-900">Välj ett nytt lösenord</h1>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                För <span className="font-medium text-slate-900">{rad.epost}</span>. När du sparat
                avslutas alla pågående sessioner på kontot.
              </p>

              {rad.federerad && (
                <p className="mt-3 text-xs text-varn-text leading-relaxed">
                  Din organisation använder inloggning mot katalogtjänsten. Ett lokalt lösenord
                  behövs normalt inte — kontrollera med din administratör om du verkligen ska
                  sätta ett.
                </p>
              )}

              <div className="mt-5 pt-5 border-t border-slate-200">
                <Formular action={satNyttLosenord} knapp="Spara lösenordet" className="grid gap-4">
                  <input type="hidden" name="i" value={i} />
                  <input type="hidden" name="t" value={t} />
                  <label className="block text-sm">
                    <span className="block mb-1 font-medium text-slate-700">
                      Nytt lösenord<span className="text-allv-text"> *</span>
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
                      Minst 12 tecken.
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
                </Formular>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
