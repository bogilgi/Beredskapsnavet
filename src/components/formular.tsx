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
  children,
}: {
  action: (data: FormData) => Promise<FormSvar>;
  knapp: string;
  avbryt?: string;
  className?: string;
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
  // återställs inmatningen när åtgärden svarade med ett fel.
  useEffect(() => {
    if (!svar.fel || !formular.current) return;
    for (const [namn, varde] of senasteInmatning.current) {
      const falt = formular.current.elements.namedItem(namn);
      if (falt instanceof HTMLInputElement
        || falt instanceof HTMLTextAreaElement
        || falt instanceof HTMLSelectElement) {
        falt.value = varde;
      }
    }
  }, [svar]);

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
