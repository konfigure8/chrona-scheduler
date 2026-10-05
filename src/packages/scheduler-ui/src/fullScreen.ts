import * as React from "react";

/**
 * Full screen (Matt 2026-09-30: the browser's own, not the platform's
 * dialog, which reloads the board): the board fills the screen and
 * stays the same board, so nothing it holds is lost. Fluent draws its
 * pop-ups on the page body, which a full-screen board hides, so while
 * the board is full screen they mount inside it.
 */
export interface FullScreenControl {
  readonly active: boolean;
  /** Where Fluent pop-ups mount: the board while full screen, else the page. */
  readonly mountNode: HTMLElement | undefined;
  /** Leaves full screen, before the host opens a page or dialog of its own. */
  readonly exit: () => void;
  readonly toggle: () => void;
}

const FullScreenContext = React.createContext<FullScreenControl | undefined>(
  undefined,
);

export const FullScreenProvider = FullScreenContext.Provider;

/** The board's full screen; undefined where the page cannot give one. */
export function useFullScreen(): FullScreenControl | undefined {
  return React.useContext(FullScreenContext);
}

const ignore = (): undefined => undefined;

/**
 * Full screen for the board's root element, following the browser's
 * state; pop-ups mount in the portals node inside it meanwhile.
 */
export function useFullScreenRoot(
  rootRef: React.RefObject<HTMLElement>,
  portalsRef: React.RefObject<HTMLElement>,
): FullScreenControl | undefined {
  const supported =
    typeof document !== "undefined" && document.fullscreenEnabled === true;
  const [active, setActive] = React.useState(false);
  React.useEffect(() => {
    if (!supported) {
      return undefined;
    }
    // Escape and the browser's own exit end it too; the button follows.
    const onChange = (): void => {
      setActive(
        rootRef.current !== null && document.fullscreenElement === rootRef.current,
      );
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [rootRef, supported]);
  const exit = React.useCallback((): void => {
    if (rootRef.current && document.fullscreenElement === rootRef.current) {
      Promise.resolve(document.exitFullscreen()).catch(ignore);
    }
  }, [rootRef]);
  const toggle = React.useCallback((): void => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    if (document.fullscreenElement === root) {
      Promise.resolve(document.exitFullscreen()).catch(ignore);
    } else {
      Promise.resolve(root.requestFullscreen()).catch(ignore);
    }
  }, [rootRef]);
  return React.useMemo(
    () =>
      supported
        ? {
            active,
            exit,
            mountNode: active ? (portalsRef.current ?? undefined) : undefined,
            toggle,
          }
        : undefined,
    [active, exit, portalsRef, supported, toggle],
  );
}
