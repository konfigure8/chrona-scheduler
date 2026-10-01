/** F38: the Workforce package's model-driven app, by unique name, lower-cased. */
export const WORKFORCE_APP_UNIQUE_NAME = "chr_chronaworkforce";

interface XrmLike {
  readonly Utility?: {
    readonly getGlobalContext?: () => {
      readonly getCurrentAppProperties?: () => Promise<{ readonly uniqueName?: string }>;
    };
  };
}

/** The model-driven app the control runs in, by unique name; undefined outside one. */
export async function currentAppUniqueName(): Promise<string | undefined> {
  const xrm = (globalThis as { Xrm?: XrmLike }).Xrm;
  try {
    const properties = await xrm?.Utility?.getGlobalContext?.().getCurrentAppProperties?.();
    return properties?.uniqueName;
  } catch {
    return undefined;
  }
}
