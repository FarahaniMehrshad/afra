import { useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import { useLlmStore } from '@/store/llmStore';
import { getBuild } from './useBuild';
import { buildSchema } from '@/services/schema.service';
import { emitYaml } from '@/services/yaml.service';
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
    const schema = buildSchema(
      { wpf: getBuild(bundle, 'wpf'), exe: getBuild(bundle, 'exe') },
      verdicts,
    );
    return {
      schema,
      empty: emitYaml(schema.root, 'empty'),
      sample: emitYaml(schema.root, 'sample'),
    };
  }, [bundle, verdicts]);

  if (!built) return { schema: null, empty: [], sample: [], lines: [] };
  return { ...built, lines: yamlMode === 'empty' ? built.empty : built.sample };
}
