/** Dagens datum enligt systemet, som ISO-datum. */
export function idag(): string {
  return new Date().toISOString().slice(0, 10);
}

export function datum(d: string | null | undefined): string {
  if (!d) return "–";
  return d.slice(0, 10);
}

export function datumTid(d: string | null | undefined): string {
  if (!d) return "–";
  return d.slice(0, 10) + " " + d.slice(11, 16);
}

/** Antal dagar från idag till datumet. Negativt = passerat. */
export function dagarKvar(d: string | null | undefined): number | null {
  if (!d) return null;
  const diff = Date.parse(d + "T00:00:00") - Date.parse(idag() + "T00:00:00");
  return Math.round(diff / 86400000);
}

export function forfalloText(d: string | null | undefined): string {
  const n = dagarKvar(d);
  if (n === null) return "Inget datum";
  if (n < 0) return `${Math.abs(n)} dagar försenad`;
  if (n === 0) return "Förfaller idag";
  if (n === 1) return "1 dag kvar";
  if (n <= 60) return `${n} dagar kvar`;
  return datum(d);
}

export function tal(n: number | null | undefined, decimaler = 0): string {
  // Invånarantalet är okänt tills någon fyllt i det, och ska då visas som
  // okänt i stället för som noll.
  if (n === null || n === undefined) return "–";
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: decimaler,
    maximumFractionDigits: decimaler,
  }).format(n);
}

export function procent(del: number, helhet: number): number {
  if (helhet === 0) return 0;
  return Math.round((del / helhet) * 100);
}

export function timmar(h: number): string {
  const d = h / 24;
  // Dygn först när det blir mer lättläst än timmar, annars timmar rakt av,
  // så att samma kolumn inte blandar enheter i onödan.
  return h >= 48 && Number.isInteger(d) ? `${d} dygn` : `${h} h`;
}
