import { useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { download } from '@/services/download.util';
import { toMergedJson, toReportMarkdown } from '@/services/export.service';
import { useBuild } from './useBuild';

export function useExport() {
  const bundle = useAppStore((s) => s.bundle);
  const variant = useAppStore((s) => s.variant);
  const hideNoise = useAppStore((s) => s.hideNoise);
  const build = useBuild();

  const exportMerged = useCallback(() => {
    if (!build) return;
    download('afra-merged.' + variant + '.json', toMergedJson(build));
  }, [build, variant]);

  const exportReport = useCallback(() => {
    if (!build || !bundle) return;
    const md = toReportMarkdown(
      bundle.name,
      variant,
      build,
      bundle.steps,
      hideNoise,
    );
    download('afra-report.md', md, 'text/markdown');
  }, [build, bundle, variant, hideNoise]);

  return { exportMerged, exportReport };
}
