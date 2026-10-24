"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { FormSvar } from "@/lib/formsvar";
import { Notis } from "@/components/ui";

/**
 * Formulär som visar vad serveråtgärden svarade.
 *
 * Utan det här får användaren ingen text när en validering slår till, eftersom
 * Next.js döljer serverfel i produktionsläge. Se formsvar.ts.
 */
export function Formular({
  action,
  knapp,
  avbryt,
  className,
  behallInmatning = false,
  children,
}: {
  action: (data: FormData) => Promise<FormSvar>;
  knapp: string;
  avbryt?: string;
  className?: string;
  /**
   * Behåll inmatningen även när åtgärden lyckades.
   *
   * Sätts för formulär där svaret är ett underlag för nästa steg, som en
   * torrkörning inför en import: töms fältet där måste filen klistras in på
   * nytt för att köras skarpt, och poängen med torrkörningen går förlorad.
   * Lämnas av för formulär där en lyckad åtgärd betyder att fälten ska tömmas,
   * som när ett nytt krav lagts till.
   */
  behallInmatning?: boolean;
  children: ReactNode;
}) {
  const formular = useRef<HTMLFormElement>(null);
  const senasteInmatning = useRef<[string, string][]>([]);

  const [svar, skicka, pagar] = useActionState<FormSvar, FormData>(
    async (_forra, data) => {
      senasteInmatning.current = [...data.entries()].filter(
        (post): post is [string, string] => typeof post[1] === "string",
      );
      return action(data);
    },
    {},
  );

  // React 19 nollställer ett okontrollerat formulär när åtgärden är klar. Vid
  // ett valideringsfel innebär det att användaren förlorar allt hen skrivit —
  // en lång beskrivning försvinner för att motiveringen var för kort. Därför
  // återställs inmatningen när åtgärden svarade med ett fel, och även efter ett
  // lyckat svar när formuläret bett om det.
  useEffect(() => {
    const aterstall = svar.fel || (behallInmatning && svar.klart);
    if (!aterstall || !formular.current) return;
    for (const [namn, varde] of senasteInmatning.current) {
      const falt = formular.current.elements.namedItem(namn);
      if (falt instanceof HTMLInputElement
        || falt instanceof HTMLTextAreaElement
        || falt instanceof HTMLSelectElement) {
        falt.value = varde;
      }
    }
  }, [svar, behallInmatning]);

  return (
    <form ref={formular} action={skicka} className={className}>
      {children}

      {svar.fel && (
        <div role="alert" className="sm:col-span-2">
          <Notis ton="allvarlig">{svar.fel}</Notis>
        </div>
      )}
      {svar.klart && !svar.fel && (
        <div role="status" className="sm:col-span-2">
          <Notis ton="ok">{svar.klart}</Notis>
        </div>
      )}
      {svar.rader && svar.rader.length > 0 && (
        <div className="sm:col-span-2 rounded-md bg-slate-50 ring-1 ring-inset ring-slate-200 p-3">
          <ul className="space-y-0.5 text-xs text-slate-700 font-mono leading-relaxed">
            {svar.rader.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="sm:col-span-2 flex items-center gap-3">
        <button type="submit" disabled={pagar} className="knapp-primar disabled:opacity-60">
          {pagar ? "Sparar …" : knapp}
        </button>
        {avbryt && (
          <a href={avbryt} className="knapp-sekundar">
            Avbryt
          </a>
        )}
      </div>
    </form>
  );
}
