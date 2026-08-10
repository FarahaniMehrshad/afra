import { useCallback, useEffect, useState } from 'react';
import {
  forgetRecent,
  listRecents,
  RecentFolder,
} from '@/services/recents.service';

export function useRecents() {
  const [recents, setRecents] = useState<RecentFolder[]>([]);

  const refresh = useCallback(async () => {
    setRecents(await listRecents());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const forget = useCallback(
    async (name: string) => {
      await forgetRecent(name);
      await refresh();
    },
    [refresh],
  );

  return { recents, refresh, forget };
}
