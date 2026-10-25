import * as React from "react";

import type { HourFormat } from "./timeAxis";

/**
 * The user's locale for numbers on the board (hours, counts, money):
 * the culture of the user's Power Apps language, which the host reads
 * from `context.userSettings.languageId` at the boundary, as it reads the
 * strings for that language. Absent = the browser's own.
 */
const LANGUAGE_LOCALES: Readonly<Record<number, string>> = {
  1031: "de-DE",
  1033: "en-US",
  1036: "fr-FR",
  1040: "it-IT",
  1043: "nl-NL",
  1046: "pt-BR",
  2070: "pt-PT",
  3082: "es-ES",
};

/** The locale of a Power Apps language id the board ships; undefined for any other. */
export function localeForLanguage(languageId: number | undefined): string | undefined {
  return languageId === undefined ? undefined : LANGUAGE_LOCALES[languageId];
}

const BoardLocaleContext = React.createContext<string | undefined>(undefined);
const BoardHourFormatContext = React.createContext<HourFormat>("24");

export function BoardLocaleProvider(props: {
  readonly children?: React.ReactNode;
  /** The user's hour format, as the host reads it; absent = 24-hour. */
  readonly hourFormat?: HourFormat;
  readonly locale?: string;
}): JSX.Element {
  return (
    <BoardLocaleContext.Provider value={props.locale}>
      <BoardHourFormatContext.Provider value={props.hourFormat ?? "24"}>
        {props.children}
      </BoardHourFormatContext.Provider>
    </BoardLocaleContext.Provider>
  );
}

/** The board's number locale; undefined formats in the browser's. */
export function useBoardLocale(): string | undefined {
  return React.useContext(BoardLocaleContext);
}

/** The board's hour format for every time it writes: 24-hour, or 12-hour for the user who reads it so. */
export function useBoardHourFormat(): HourFormat {
  return React.useContext(BoardHourFormatContext);
}
