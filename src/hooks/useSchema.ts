import { useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import { useLlmStore } from '@/store/llmStore';
import { getBuild } from './useBuild';
import {
  buildSchema,
  collectSampleValues,
  longestStepIndex,
  type SampleOverrides,
} from '@/services/schema.service';
import { emitYaml } from '@/services/yaml.service';
import { toIR } from '@/services/ir.service';
import type { Variant } from '@/types/journey';
import type { BuildResult, Primitive } from '@/types/ir';
import type { SchemaResult, YamlLine } from '@/types/schema';

/**
 * The JSON-to-YML page's whole data layer: the distilled schema plus both
 * rendered YAML documents. Memoised on the verdict map identity, which
 * `llmStore` replaces wholesale on every update, so this recomputes exactly
 * when the classification changes and never otherwise.
 */
export interface SchemaView {
  schema: SchemaResult | null;
  empty: YamlLine[];
  sample: YamlLine[];
  /** Whichever of the two the user is currently looking at. */
  lines: YamlLine[];
}

export function useSchema(): SchemaView {
  const bundle = useAppStore((s) => s.bundle);
  const yamlMode = useAppStore((s) => s.yamlMode);
  const verdicts = useLlmStore((s) => s.verdicts);

  const built = useMemo(() => {
    if (!bundle) return null;
    const wpfBuild = getBuild(bundle, 'wpf');
    const exeBuild = getBuild(bundle, 'exe');

    // Sample values come from the LONGEST individual step per variant, not
    // from the merged view. The merged view is a synthetic union — its values
    // never appeared together in any real export — so it's a bad source for
    // "here's what a real snapshot looks like". The longest step is the
    // closest thing to "the most populated real config the operator produced
    // during the run".
    const samples: SampleOverrides = {
      wpf: sampleMapFor(wpfBuild),
      exe: sampleMapFor(exeBuild),
    };

    const schema = buildSchema({ wpf: wpfBuild, exe: exeBuild }, verdicts, samples);
    return {
      schema,
      empty: emitYaml(schema.root, 'empty'),
      sample: emitYaml(schema.root, 'sample'),
    };
  }, [bundle, verdicts]);

  if (!built) return { schema: null, empty: [], sample: [], lines: [] };
  return { ...built, lines: yamlMode === 'empty' ? built.empty : built.sample };
}

/**
 * Flatten the longest step of a build into a `canonicalPath -> primitive`
 * map. Returns `undefined` when the variant has no readable step so the
 * schema falls back to the merged-IR value instead of pretending "not seen".
 */
function sampleMapFor(build: BuildResult | null): ReadonlyMap<string, Primitive> | undefined {
  const idx = longestStepIndex(build);
  if (idx < 0) return undefined;
  const doc = build!.docs[idx];
  if (!doc || !doc.obj) return undefined;
  return collectSampleValues(toIR(doc.obj));
}

// A tiny re-export so component code that only wants the number can pull it
// without reaching into the service module — used by the schema page footer
// to show "sampled from step 07 (33 kB)".
export function sampleStepInfo(
  bundle: ReturnType<typeof useAppStore.getState>['bundle'],
  variant: Variant,
): { stepIdx: number; bytes: number } | null {
  if (!bundle) return null;
  const b = getBuild(bundle, variant);
  const i = longestStepIndex(b);
  if (i < 0) return null;
  return { stepIdx: i, bytes: b.docs[i]?.text.length ?? 0 };
}
