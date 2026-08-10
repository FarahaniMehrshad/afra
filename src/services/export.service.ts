import type { BuildResult, HistoryEvent } from '@/types/ir';
import type { JourneyStep, Variant } from '@/types/journey';

/**
 * Exporters — pure functions that turn a build into a downloadable
 * artefact. Kept side-effect free so tests can just eyeball the string.
 */

export function toMergedJson(build: BuildResult): string {
  return build.mergedLines.map((l) => l.text + l.tail).join('\n');
}

export function toReportMarkdown(
  folderName: string,
  variant: Variant,
  build: BuildResult,
  steps: JourneyStep[],
  hideNoise: boolean,
): string {
  const per = steps.map(() => ({
    add: [] as { p: string; ev: HistoryEvent }[],
    remove: [] as { p: string; ev: HistoryEvent }[],
    modify: [] as { p: string; ev: HistoryEvent }[],
  }));

  for (const [p, evs] of build.hist) {
    for (const ev of evs) {
      if (hideNoise && ev.noise) continue;
      per[ev.i][ev.st].push({ p, ev });
    }
  }

  let md =
    '# AFRA diff report\n\n' +
    '**Folder:** ' +
    folderName +
    '  \n' +
    '**Variant:** ' +
    variant +
    '  \n' +
    '**Steps:** ' +
    steps.length +
    '\n\n';

  steps.forEach((s, i) => {
    md +=
      '## ' +
      String(s.ordinal).padStart(2, '0') +
      ' ' +
      s.label +
      '\n\n' +
      s.operation +
      '\n\n';
    const g = per[i];
    (['add', 'modify', 'remove'] as const).forEach((kind) => {
      const list = g[kind];
      if (!list.length) return;
      md += '**' + kind + '** (' + list.length + ')\n\n';
      list.slice(0, 200).forEach((x) => {
        const v =
          kind === 'modify'
            ? '`' + x.ev.from + '` → `' + x.ev.to + '`'
            : '`' + (x.ev.to ?? x.ev.from ?? '') + '`';
        md += '- `' + (x.p || '/') + '` ' + v + '\n';
      });
      if (list.length > 200) md += '- …' + (list.length - 200) + ' more\n';
      md += '\n';
    });
  });

  return md;
}
