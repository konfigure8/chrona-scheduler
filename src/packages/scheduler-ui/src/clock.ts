import type { HourFormat } from "./timeAxis";

/**
 * A time of day in the board's hour format (the user's, from the host):
 * "07:30" and "18:00", or "7:30am" and "6pm", as the time axis writes its
 * hours.
 */
export function formatClock(date: Date, format: HourFormat = "24"): string {
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  if (format === "24") {
    return `${hours.toString().padStart(2, "0")}:${minutes}`;
  }
  const twelveHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelveHour}${minutes === "00" ? "" : `:${minutes}`}${hours < 12 ? "am" : "pm"}`;
}

/** A shift's times in the board's hour format: "18:00-23:00", or "6pm-11pm". */
export function formatClockRange(start: Date, end: Date, format: HourFormat = "24", separator = "-"): string {
  return `${formatClock(start, format)}${separator}${formatClock(end, format)}`;
}
