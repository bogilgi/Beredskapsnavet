"use client";

export function UtskriftsKnapp() {
  return (
    <button type="button" className="knapp-primar" onClick={() => window.print()}>
      Skriv ut eller spara som PDF
    </button>
  );
}
