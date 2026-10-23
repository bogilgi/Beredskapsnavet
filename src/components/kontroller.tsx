"use client";

import { useTransition } from "react";

/**
 * Rullgardin som skriver direkt till servern vid ändring.
 * Serveråtgärden skickas in som prop från serverkomponenten.
 */
export function Vaxlare({
  id,
  varde,
  alternativ,
  action,
  etikett,
  bredd = "w-36",
}: {
  id: number;
  varde: string;
  alternativ: { varde: string; etikett: string }[];
  action: (id: number, varde: string) => Promise<void>;
  etikett: string;
  bredd?: string;
}) {
  const [pagar, start] = useTransition();
  return (
    <select
      aria-label={etikett}
      className={`falt ${bredd} text-xs py-1 ${pagar ? "opacity-50" : ""}`}
      value={varde}
      disabled={pagar}
      onChange={(e) => {
        const nytt = e.target.value;
        start(async () => {
          await action(id, nytt);
        });
      }}
    >
      {alternativ.map((a) => (
        <option key={a.varde} value={a.varde}>
          {a.etikett}
        </option>
      ))}
    </select>
  );
}

/** Knapp som utför en serveråtgärd på ett objekt. */
export function AtgardsKnapp({
  id,
  action,
  children,
  variant = "sekundar",
  bekraftelse,
}: {
  id: number;
  action: (id: number) => Promise<void>;
  children: React.ReactNode;
  variant?: "primar" | "sekundar" | "diskret";
  bekraftelse?: string;
}) {
  const [pagar, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pagar}
      className={`knapp-${variant} ${pagar ? "opacity-50" : ""}`}
      onClick={() => {
        if (bekraftelse && !window.confirm(bekraftelse)) return;
        start(async () => {
          await action(id);
        });
      }}
    >
      {pagar ? "Sparar…" : children}
    </button>
  );
}

/** Knapp utan objekt-id, för åtgärder som rör hela mängden. */
export function GlobalKnapp({
  action,
  children,
  variant = "sekundar",
  bekraftelse,
}: {
  action: () => Promise<void>;
  children: React.ReactNode;
  variant?: "primar" | "sekundar" | "diskret";
  bekraftelse?: string;
}) {
  const [pagar, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pagar}
      className={`knapp-${variant} ${pagar ? "opacity-50" : ""}`}
      onClick={() => {
        if (bekraftelse && !window.confirm(bekraftelse)) return;
        start(async () => {
          await action();
        });
      }}
    >
      {pagar ? "Arbetar…" : children}
    </button>
  );
}

/** Bedömningsväljare för risk: sannolikhet och konsekvens 1–5. */
export function RiskBedomning({
  id,
  sannolikhet,
  konsekvens,
  action,
}: {
  id: number;
  sannolikhet: number;
  konsekvens: number;
  action: (id: number, s: number, k: number) => Promise<void>;
}) {
  const [pagar, start] = useTransition();
  const sparaS = (s: number) => start(async () => { await action(id, s, konsekvens); });
  const sparaK = (k: number) => start(async () => { await action(id, sannolikhet, k); });
  const skala = [1, 2, 3, 4, 5];
  return (
    <div className={`flex items-center gap-2 ${pagar ? "opacity-50" : ""}`}>
      <label className="flex items-center gap-1 text-xs text-slate-500">
        S
        <select
          aria-label="Sannolikhet"
          className="falt w-12 py-0.5 text-xs"
          value={sannolikhet}
          disabled={pagar}
          onChange={(e) => sparaS(Number(e.target.value))}
        >
          {skala.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1 text-xs text-slate-500">
        K
        <select
          aria-label="Konsekvens"
          className="falt w-12 py-0.5 text-xs"
          value={konsekvens}
          disabled={pagar}
          onChange={(e) => sparaK(Number(e.target.value))}
        >
          {skala.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </div>
  );
}
