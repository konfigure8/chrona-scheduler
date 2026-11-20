/** The table that holds each board's maker settings, one row per native view. */
export const VIEW_SETTINGS_TABLE = "chr_chronaschedulerview";

/** Dataverse privilege codes (PCF PropertyHelper.Types): Write, at the Basic depth. */
const WRITE_PRIVILEGE = 3;
const BASIC_DEPTH = 0;

interface PrivilegeReader {
  readonly hasEntityPrivilege?: (
    entityTypeName: string,
    privilegeType: ComponentFramework.PropertyHelper.Types.PrivilegeType,
    privilegeDepth: ComponentFramework.PropertyHelper.Types.PrivilegeDepth,
  ) => boolean;
}

/** Only users who can change a board's settings see the button; Dataverse still enforces the rest. */
export function canChangeViewSettings(utils: PrivilegeReader | undefined): boolean {
  try {
    return utils?.hasEntityPrivilege?.(VIEW_SETTINGS_TABLE, WRITE_PRIVILEGE, BASIC_DEPTH) === true;
  } catch {
    return false;
  }
}

/**
 * On a cold page the privilege answer can be no: the platform loads a
 * table's privileges with its metadata, and nothing has asked for the
 * settings table yet. Ask for the metadata, then check again; a short
 * re-check on an interval covers a slow load. Calls onAllowed once, when
 * the answer turns to yes. Returns the stop function.
 */
export function recheckPrivilege(
  check: () => boolean,
  loadMetadata: () => unknown,
  onAllowed: () => void,
  intervalMs = 2000,
  maxTries = 15,
): () => void {
  let stopped = false;
  let tries = 0;
  const recheck = (): boolean => {
    if (stopped || !check()) {
      return false;
    }
    stopped = true;
    onAllowed();
    return true;
  };
  const timer = setInterval(() => {
    tries += 1;
    if (recheck() || tries >= maxTries) {
      clearInterval(timer);
    }
  }, intervalMs);
  void Promise.resolve()
    .then(loadMetadata)
    .then(() => {
      if (recheck()) {
        clearInterval(timer);
      }
      return null;
    })
    .catch(() => undefined);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

interface XrmLike {
  readonly Navigation?: {
    readonly navigateTo?: (pageInput: object, navigationOptions: object) => Promise<unknown>;
  };
}

/** The side dialog's width: room for the form, with the board still in view beside it. */
export const SIDE_DIALOG_WIDTH_PX = 480;

/**
 * Open a record's main form in the model-driven app's own side dialog,
 * on the right beside the board, and resolve when the maker closes it.
 * The call keeps Xrm.Navigation as its object: called detached, the
 * platform method can fail before any dialog opens. Without the dialog
 * API (a host outside a model-driven app) the form opens the ordinary way.
 */
export async function openRecordInDialog(
  entityName: string,
  entityId: string,
  openForm: (options: ComponentFramework.NavigationApi.EntityFormOptions) => Promise<unknown>,
): Promise<void> {
  const navigation = (globalThis as { Xrm?: XrmLike }).Xrm?.Navigation;
  if (!navigation?.navigateTo) {
    await openForm({ entityId, entityName });
    return;
  }
  await navigation.navigateTo(
    { entityId, entityName, pageType: "entityrecord" },
    { position: 2, target: 2, width: { unit: "px", value: SIDE_DIALOG_WIDTH_PX } },
  );
}

/** The view row's answer: its row, no row for the view (the zero-config board), or a read that failed. */
export type ViewRowRead =
  | { readonly kind: "row"; readonly row: ComponentFramework.WebApi.Entity }
  | { readonly kind: "none" }
  | { readonly kind: "failed"; readonly error: unknown };

/**
 * Read a board's view row by its native view id. Only an answer with no row is "none"; a refused or failed read,
 * thrown or rejected, is "failed", never a board with no settings (AGENTS.md 0.1).
 */
export async function readViewRow(
  webApi: Pick<ComponentFramework.WebApi, "retrieveMultipleRecords">,
  viewId: string,
  select: readonly string[],
): Promise<ViewRowRead> {
  try {
    const result = await webApi.retrieveMultipleRecords(
      VIEW_SETTINGS_TABLE,
      `?$select=${select.join(",")}&$filter=chr_viewid eq '${viewId}'&$top=1`,
    );
    const row = result.entities[0];
    return row ? { kind: "row", row } : { kind: "none" };
  } catch (error) {
    return { error, kind: "failed" };
  }
}

/**
 * What decides whether Connect may write: the calendar the control binds itself, whether the view row's read failed,
 * and whether the scheduler's own row could not be read.
 */
export interface ConnectGate {
  /** The bound calendar that names a row; empty when none is bound or the bound one names none. */
  readonly boundCalendarId: string;
  /** The scheduler's row could not be read (HostConfig.readFailed "calendar"): it may exist. */
  readonly calendarUnread?: boolean;
  readonly viewRowFailed: boolean;
}

/**
 * Whether the board offers Connect. A board without a bound calendar finds its scheduler through the view row; while
 * that read has failed the board may already have one, so it offers no Connect (AGENTS.md 0.1). Nor while the
 * scheduler's own row could not be read: the board may already have it.
 */
export function connectOffered(gate: ConnectGate): boolean {
  return !gate.calendarUnread && (gate.boundCalendarId !== "" || !gate.viewRowFailed);
}

/**
 * Connect's writes (a new scheduler, and this view's row linked to it) run only while Connect is offered: after a
 * failed read of the view row or of the scheduler's row they are refused with `refusal` before anything is written, so Connect never makes a
 * second scheduler or re-links the view row away from the one it has.
 */
export async function connectWrites<T>(gate: ConnectGate, refusal: string, write: () => Promise<T>): Promise<T> {
  if (!connectOffered(gate)) {
    throw new Error(refusal);
  }
  return write();
}

/**
 * Read a version token for some rows: their modifiedon stamps, joined. A
 * Save moves the token, so a watcher can tell a saved change from a quiet
 * form. A row without an id reads as empty.
 */
export async function readRowsVersion(
  webApi: Pick<ComponentFramework.WebApi, "retrieveRecord">,
  rows: readonly { readonly entity: string; readonly id: string | undefined }[],
): Promise<string> {
  const stamps = await Promise.all(
    rows.map(async (row) => {
      if (!row.id) {
        return "";
      }
      const record = await webApi.retrieveRecord(row.entity, row.id, "?$select=modifiedon");
      const stamp = (record as { modifiedon?: unknown }).modifiedon;
      return typeof stamp === "string" ? stamp : "";
    }),
  );
  return stamps.join("|");
}

/**
 * While a settings dialog is open, read the version every interval and
 * call onChange when it moves, so each Save shows on the board without
 * waiting for the close. The first read is the baseline. A failed read
 * waits for the next one. Returns the stop function.
 */
export function watchWhileOpen(
  readVersion: () => Promise<string>,
  onChange: () => void,
  intervalMs = 2000,
): () => void {
  let stopped = false;
  let reading = false;
  let baseline: string | undefined;
  const tick = async (): Promise<void> => {
    if (reading) {
      return;
    }
    reading = true;
    try {
      const version = await readVersion();
      if (stopped) {
        return;
      }
      if (baseline !== undefined && version !== baseline) {
        onChange();
      }
      baseline = version;
    } catch {
      // The next read tries again.
    } finally {
      reading = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/**
 * The time zone a scheduler Connect creates takes: the browser's, when the browser runs at the Power Apps user's
 * offset now. Otherwise none, and Connect creates no scheduler: a scheduler always has a zone (Matt 2026-11-17, "a
 * time zone on every new calendar: simplest -> make it mandatory and part of creating a new scheduler record").
 */
export function newSchedulerZone(
  browserZone: string | undefined,
  zoneOffsetNow: (zone: string) => number,
  userOffsetNow: number,
): string | undefined {
  return browserZone && zoneOffsetNow(browserZone) === userOffsetNow ? browserZone : undefined;
}
