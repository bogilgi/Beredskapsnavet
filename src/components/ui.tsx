import type { ReactNode } from "react";
import { TON_KLASS, type Ton, def } from "@/lib/domain";
import { procent, tal } from "@/lib/format";

export function Pill({ ton = "neutral", children }: { ton?: Ton; children: ReactNode }) {
  return <span className={`pill ${TON_KLASS[ton]}`}>{children}</span>;
}

/** Statusmärke som hämtar etikett och färg ur domänkartan. */
export function Status({
  karta,
  nyckel,
}: {
  karta: Record<string, { etikett: string; ton: Ton }>;
  nyckel: string;
}) {
  const d = def(karta, nyckel);
  return <Pill ton={d.ton}>{d.etikett}</Pill>;
}

export function Panel({
  rubrik,
  beskrivning,
  atgard,
  children,
  className = "",
  padding = true,
}: {
  rubrik?: string;
  beskrivning?: string;
  atgard?: ReactNode;
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <section className={`kort ${className}`}>
      {rubrik && (
        <div className="kort-rubrik">
          <div>
            <h2>{rubrik}</h2>
            {beskrivning && <p className="text-xs text-slate-500 mt-0.5">{beskrivning}</p>}
          </div>
          {atgard && <div className="shrink-0">{atgard}</div>}
        </div>
      )}
      <div className={padding ? "p-4" : "overflow-x-auto"}>{children}</div>
    </section>
  );
}

const TON_SOLID: Record<Ton, string> = {
  ok: "bg-ok-solid",
  varning: "bg-varn-solid",
  allvarlig: "bg-allv-solid",
  neutral: "bg-slate-400",
  info: "bg-brand-500",
};

export function Matare({
  del,
  helhet,
  ton,
  visaText = true,
}: {
  del: number;
  helhet: number;
  ton?: Ton;
  visaText?: boolean;
}) {
  const p = procent(del, helhet);
  const auto: Ton = p >= 90 ? "ok" : p >= 70 ? "varning" : "allvarlig";
  const t = ton ?? auto;
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2 flex-1 min-w-16 rounded-full bg-slate-200 overflow-hidden"
        role="progressbar"
        aria-valuenow={p}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full rounded-full ${TON_SOLID[t]}`} style={{ width: `${p}%` }} />
      </div>
      {visaText && (
        <span className="text-xs tabular-nums text-slate-600 w-9 text-right">{p}%</span>
      )}
    </div>
  );
}

export function Stat({
  etikett,
  varde,
  enhet,
  hint,
  ton,
  href,
}: {
  etikett: string;
  varde: string | number;
  enhet?: string;
  hint?: string;
  ton?: Ton;
  href?: string;
}) {
  const kant =
    ton === "allvarlig"
      ? "border-l-allv-solid"
      : ton === "varning"
        ? "border-l-varn-solid"
        : ton === "ok"
          ? "border-l-ok-solid"
          : "border-l-brand-500";
  const inner = (
    <>
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{etikett}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-slate-900 tabular-nums">
          {typeof varde === "number" ? tal(varde) : varde}
        </span>
        {enhet && <span className="text-sm text-slate-500">{enhet}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500 leading-snug">{hint}</div>}
    </>
  );
  const klass = `kort border-l-4 ${kant} px-4 py-3 block`;
  return href ? (
    <a href={href} className={`${klass} hover:bg-slate-50 transition-colors`}>
      {inner}
    </a>
  ) : (
    <div className={klass}>{inner}</div>
  );
}

export function Sidrubrik({
  rubrik,
  lagrum,
  beskrivning,
  atgard,
}: {
  rubrik: string;
  lagrum?: string;
  beskrivning?: string;
  atgard?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">{rubrik}</h1>
        {lagrum && (
          <p className="mt-1 text-xs font-medium text-brand-700">{lagrum}</p>
        )}
        {beskrivning && (
          <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{beskrivning}</p>
        )}
      </div>
      {atgard && <div className="ej-utskrift shrink-0">{atgard}</div>}
    </header>
  );
}

export function Tomt({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-500 italic p-4">{children}</p>;
}

export function Notis({ ton = "varning", children }: { ton?: Ton; children: ReactNode }) {
  return (
    <div className={`rounded-md px-3 py-2 text-sm ring-1 ring-inset ${TON_KLASS[ton]}`}>
      {children}
    </div>
  );
}
