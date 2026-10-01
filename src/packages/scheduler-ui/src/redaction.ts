/**
 * F23 Payload redaction (ruled 2026-09-01): no personal data leaves
 * the browser. Every v2 problem is redacted at the contract boundary
 * before it becomes a wire request - resources re-keyed p-1..p-n and
 * work items w-1..w-n in given order, names and titles dropped to
 * their pseudonyms (re-keying also scrubs name-derived ids like
 * "r-alex") - and the id-maps stay HERE so solutions can be mapped
 * back locally. Skills stay plain tags and cost/contract facts stay
 * in the payload (both ruled; the conversion ledger discloses them).
 * The solver never needed names, so nothing functional changes.
 */
import type {
  ScheduleProblemV2,
  ScheduleSolutionV2,
} from "./schedulingContract";

/** F38: how a request keyed its resources. Absent means per-run keys. */
export type ResourceKeyScheme = "hmac-sha256-v1";

/** F38: the tenant's key for stable resource placeholders, from the solve session. */
export interface ResourcePlaceholderKey {
  /** base64url */
  readonly key: string;
  readonly scheme: string;
}

export interface RedactedProblem {
  /** The redacted problem - the ONLY form that may reach a wire. */
  readonly problem: ScheduleProblemV2;
  /** F38: set when resources carry stable placeholders. */
  readonly resourceKeyScheme?: ResourceKeyScheme;
  readonly toRealResourceId: ReadonlyMap<string, string>;
  readonly toRealShiftId: ReadonlyMap<string, string>;
}

/**
 * Redact a v2 problem with per-run resource keys (p-1..p-n); keep the
 * returned maps local. Solves use redactProblemForTenant, which keys
 * resources stably when the session carries the tenant's key.
 */
export function redactProblem(problem: ScheduleProblemV2): RedactedProblem {
  return redactWith(
    problem,
    new Map(problem.resources.map((resource, index) => [resource.id, `p-${index + 1}`])),
  );
}

/**
 * F38 Charging path: redact with stable resource placeholders. Each
 * resource's record id becomes a keyed one-way hash under the tenant's
 * key, so the same record gets the same placeholder in every run, view
 * and environment copy, and the meter counts it once. Record ids never
 * leave the browser. Without a usable key it falls back to per-run keys.
 */
export async function redactProblemForTenant(
  problem: ScheduleProblemV2,
  placeholderKey: ResourcePlaceholderKey | undefined,
): Promise<RedactedProblem> {
  const subtle = globalThis.crypto?.subtle;
  if (!placeholderKey || placeholderKey.scheme !== "hmac-sha256-v1" || !subtle) {
    return redactProblem(problem);
  }
  const cryptoKey = await subtle.importKey(
    "raw",
    base64UrlToBytes(placeholderKey.key),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const encoder = new TextEncoder();
  const pseudonyms = new Map<string, string>();
  for (const resource of problem.resources) {
    if (!pseudonyms.has(resource.id)) {
      const signature = await subtle.sign("HMAC", cryptoKey, encoder.encode(normalizeRecordId(resource.id)));
      pseudonyms.set(resource.id, `r-${bytesToBase64Url(new Uint8Array(signature).slice(0, 16))}`);
    }
  }
  return { ...redactWith(problem, pseudonyms), resourceKeyScheme: "hmac-sha256-v1" };
}

/** One record, one placeholder: Dataverse ids differ only by case and braces between sources. */
function normalizeRecordId(id: string): string {
  return id.trim().replace(/^\{|\}$/g, "").toLowerCase();
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function redactWith(
  problem: ScheduleProblemV2,
  resourcePseudonyms: ReadonlyMap<string, string>,
): RedactedProblem {
  const toRealResourceId = new Map<string, string>();
  resourcePseudonyms.forEach((pseudonym, realId) => toRealResourceId.set(pseudonym, realId));
  const toRealShiftId = new Map<string, string>();
  const pseudoResource = (realId: string): string =>
    resourcePseudonyms.get(realId) ?? realId;
  return {
    problem: {
      contractVersion: "2",
      resources: problem.resources.map((resource) => ({
        ...(resource.contract ? { contract: resource.contract } : {}),
        ...(resource.costCentsPerHour !== undefined
          ? { costCentsPerHour: resource.costCentsPerHour }
          : {}),
        id: pseudoResource(resource.id),
        name: pseudoResource(resource.id),
        skills: resource.skills,
      })),
      shifts: problem.shifts.map((shift, index) => {
        const pseudonym = `w-${index + 1}`;
        toRealShiftId.set(pseudonym, shift.id);
        return {
          ...(shift.assignment
            ? {
                assignment: {
                  pinned: shift.assignment.pinned,
                  resourceId: pseudoResource(shift.assignment.resourceId),
                },
              }
            : {}),
          end: shift.end,
          id: pseudonym,
          requiredSkills: shift.requiredSkills,
          start: shift.start,
          title: pseudonym,
        };
      }),
      unavailability: problem.unavailability.map((band) => ({
        end: band.end,
        resourceId: pseudoResource(band.resourceId),
        start: band.start,
      })),
      window: problem.window,
    },
    toRealResourceId,
    toRealShiftId,
  };
}

/**
 * Map a solution's pseudonymous ids back to the real schedule.
 * Unknown ids pass through untouched - that keeps recorded solver
 * exchanges (which predate redaction) and defensive paths working.
 */
export function unredactSolution(
  solution: ScheduleSolutionV2,
  redaction: RedactedProblem,
): ScheduleSolutionV2 {
  return {
    ...solution,
    assignments: solution.assignments.map((assignment) => ({
      resourceId:
        assignment.resourceId === null
          ? null
          : (redaction.toRealResourceId.get(assignment.resourceId) ??
            assignment.resourceId),
      shiftId:
        redaction.toRealShiftId.get(assignment.shiftId) ?? assignment.shiftId,
    })),
  };
}
