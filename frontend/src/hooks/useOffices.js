import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

// Loads the office list for super admins (they can switch between offices) and
// gives every user a name lookup. Non-super users only ever see their own office,
// whose name comes from the login session.
export default function useOffices() {
  const { apiFetch, isSuperAdmin, officeId, session } = useAuth();
  const [offices, setOffices] = useState([]);

  useEffect(() => {
    if (!isSuperAdmin) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/offices');
        if (res.ok && !cancelled) setOffices(await res.json());
      } catch {
        /* leave the list empty; pages fall back to "Office <id>" */
      }
    })();
    return () => { cancelled = true; };
  }, [apiFetch, isSuperAdmin]);

  const sessionOfficeName = session?.officeName;
  const officeName = useCallback(
    (id) => {
      if (id == null || id === '') return 'Unassigned';
      const found = offices.find((o) => String(o.id) === String(id));
      if (found) return found.name;
      if (String(id) === String(officeId) && sessionOfficeName) return sessionOfficeName;
      return `Office ${id}`;
    },
    [offices, officeId, sessionOfficeName]
  );

  return { offices, officeName };
}