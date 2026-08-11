/**
 * Compiles and runs the converter shown in the code panel.
 *
 * The code is evaluated as written, which is the whole point — you are meant
 * to change it and watch the output move. That is only reasonable because
 * this is a local inspector and the code being run is the code on screen.
 */

export interface ConverterRun {
  yaml: string;
  error: string | null;
}

interface ConvertOptions {
  emptyArrays: boolean;
}

type ConvertFn = (config: unknown, options: ConvertOptions) => unknown;

export function runConverter(
  code: string,
  config: unknown,
  options: ConvertOptions,
): ConverterRun {
  let convert: ConvertFn;
  try {
    const factory = new Function(
      code + '\n;return typeof convert === "function" ? convert : null;',
    ) as () => ConvertFn | null;
    const fn = factory();
    if (!fn) {
      return {
        yaml: '',
        error: 'The code has to declare a function named convert(config, options).',
      };
    }
    convert = fn;
  } catch (e) {
    return { yaml: '', error: 'Could not compile: ' + message(e) };
  }

  try {
    const out = convert(config, options);
    if (typeof out !== 'string') {
      return { yaml: '', error: 'convert() returned ' + describe(out) + ', not a string.' };
    }
    return { yaml: out, error: null };
  } catch (e) {
    return { yaml: '', error: 'Threw while converting: ' + message(e) };
  }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'an array';
  return 'a ' + typeof v;
}
