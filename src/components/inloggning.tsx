"use client";

import { useActionState } from "react";
import { loggaIn } from "@/lib/auth-actions";

export function InloggningsFormular() {
  const [fel, action, pagar] = useActionState(loggaIn, null);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="etikett" htmlFor="epost">
          E-postadress
        </label>
        <input
          id="epost"
          name="epost"
          type="email"
          autoComplete="username"
          required
          className="falt"
          placeholder="fornamn.efternamn@angsholm.se"
        />
      </div>
      <div>
        <label className="etikett" htmlFor="losenord">
          Lösenord
        </label>
        <input
          id="losenord"
          name="losenord"
          type="password"
          autoComplete="current-password"
          required
          className="falt"
        />
      </div>

      {fel && (
        <p role="alert" className="rounded-md bg-allv-bg px-3 py-2 text-sm text-allv-text ring-1 ring-inset ring-allv-ring">
          {fel}
        </p>
      )}

      <button type="submit" disabled={pagar} className="knapp-primar w-full">
        {pagar ? "Loggar in…" : "Logga in"}
      </button>
    </form>
  );
}
