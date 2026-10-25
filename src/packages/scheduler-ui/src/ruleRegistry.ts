/**
 * A scenario package's own rules (AGENTS.md section 12: the free board
 * carries no Workforce code): the names, the Must rows and the words of
 * rules the board does not know. The package registers them once when it
 * loads. They are static product facts, the same for every board on the
 * page; a board with none registered knows only its own rules.
 *
 * The types open the same way: a package adds its names to the
 * interfaces below by module augmentation (each key a name, its value
 * `true`).
 */
import type { SchedulerStrings } from "./stringResources";

/** A package's own Must rows; each is also a Must rule's name and a key of MustBreachCounts. */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ExtensionMustRows {}
/** A package's own Should rules' names. */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ExtensionShouldRules {}
/** A package's own agreement rule kinds, sent to the solver. */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ExtensionAgreementRuleKinds {}
/** Which of a package's own rule kinds a match names (ScheduleRuleMatch.kind). */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ExtensionMatchKinds {}

/** A Must row of a package's own. */
export interface ExtensionMustRow {
  /** The board's row it follows. */
  readonly after: string;
  readonly label: (strings: SchedulerStrings) => string;
  /** Shown only while a roster breaks it, or when the roster's rules name it. */
  readonly optional?: boolean;
  readonly row: string;
}

export interface BoardRules {
  /** Agreement rule kinds the solver checks, beside the board's. */
  readonly agreementRuleKinds?: readonly string[];
  /** The kinds a match of each rule may name, by rule. */
  readonly matchKinds?: Readonly<Record<string, readonly string[]>>;
  readonly mustRows?: readonly ExtensionMustRow[];
  readonly shouldRules?: readonly { readonly label: (strings: SchedulerStrings) => string; readonly rule: string }[];
}

let registered: BoardRules = {};

/** Adds a package's rules to the board's; a name registered twice keeps its first entry. */
export function registerBoardRules(rules: BoardRules): void {
  const known = (list: readonly { readonly row?: string; readonly rule?: string }[] | undefined, name: string): boolean =>
    (list ?? []).some((entry) => (entry.row ?? entry.rule) === name);
  registered = {
    agreementRuleKinds: [...new Set([...(registered.agreementRuleKinds ?? []), ...(rules.agreementRuleKinds ?? [])])],
    matchKinds: { ...rules.matchKinds, ...registered.matchKinds },
    mustRows: [...(registered.mustRows ?? []), ...(rules.mustRows ?? []).filter((row) => !known(registered.mustRows, row.row))],
    shouldRules: [
      ...(registered.shouldRules ?? []),
      ...(rules.shouldRules ?? []).filter((rule) => !known(registered.shouldRules, rule.rule)),
    ],
  };
}

/** The rules registered so far. */
export function boardRules(): BoardRules {
  return registered;
}

/** A registered Must row, if `row` is one. */
export function extensionMustRow(row: string): ExtensionMustRow | undefined {
  return registered.mustRows?.find((entry) => entry.row === row);
}
