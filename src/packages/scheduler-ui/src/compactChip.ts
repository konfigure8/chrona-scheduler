/**
 * The Roster grid's compact chip (F31 Proposal review on the board,
 * rework batch 2): each shift shows only a short code and its start
 * time, so the view shows as much as possible; hovering or opening the
 * shift shows its title, times and rule notes.
 */
import type { HourFormat } from "./timeAxis";
import type { SchedulerUiEvent } from "./types";

const letterOrDigit = /[\p{L}\p{N}]/u;

/**
 * The code a compact chip shows: the Code binding when it carries text,
 * else the title's initials - the first letters of its first two words,
 * or a one-word title's first two letters - in upper case.
 */
export function chipCode(
  event: Pick<SchedulerUiEvent, "code" | "title">,
): string {
  const code = event.code?.trim();
  if (code) {
    return code;
  }
  const words = event.title
    .split(/\s+/)
    .map((word) => Array.from(word).filter((char) => letterOrDigit.test(char)))
    .filter((chars) => chars.length > 0);
  const [first, second] = words;
  if (!first) {
    return "";
  }
  const initials = second ? [first[0], second[0]] : first.slice(0, 2);
  return initials.join("").toLocaleUpperCase();
}

/** A compact chip's start time in the board's hour format: "07:00", or "7am" and "7:30am". */
export function chipStartTime(start: Date, format: HourFormat = "24"): string {
  const hours = start.getHours();
  const minutes = start.getMinutes().toString().padStart(2, "0");
  if (format === "24") {
    return `${hours.toString().padStart(2, "0")}:${minutes}`;
  }
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  const suffix = hours < 12 ? "am" : "pm";
  return minutes === "00" ? `${twelve}${suffix}` : `${twelve}:${minutes}${suffix}`;
}

/** Hours for display: whole hours plain, else one decimal. */
export function formatHours(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return hours.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
