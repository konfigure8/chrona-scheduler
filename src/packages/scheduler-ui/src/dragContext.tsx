import * as React from "react";

import type { DragSession } from "./interactions";

export type SessionUpHandler = (
  upEvent: PointerEvent,
  session: DragSession,
) => void;

export interface DragController {
  readonly begin: (session: DragSession) => void;
  readonly end: () => void;
  /**
   * The view owning drop geometry registers its pointer-up processor here
   * (re-registered every render so the closure stays fresh).
   */
  readonly registerUpHandler: (handler: SessionUpHandler) => void;
  readonly session: DragSession | undefined;
}

const noopController: DragController = {
  begin: () => undefined,
  end: () => undefined,
  registerUpHandler: () => undefined,
  session: undefined,
};

export const DragContext = React.createContext<DragController>(noopController);

export function useDragController(): DragController {
  return React.useContext(DragContext);
}

export function DragProvider(props: {
  readonly children: React.ReactNode;
}): JSX.Element {
  const [session, setSession] = React.useState<DragSession | undefined>();
  const sessionRef = React.useRef<DragSession | undefined>(undefined);
  const upHandlerRef = React.useRef<SessionUpHandler | undefined>(undefined);

  const controller = React.useMemo<DragController>(
    () => ({
      begin: (nextSession) => {
        sessionRef.current = nextSession;
        setSession(nextSession);
        /*
         * Attach the pointer-up listener synchronously so a click released
         * in the same frame (before React effects run) still completes the
         * session instead of leaving it stuck active.
         */
        const handleUp = (upEvent: PointerEvent): void => {
          if (sessionRef.current !== nextSession) {
            return;
          }
          sessionRef.current = undefined;
          setSession(undefined);
          upHandlerRef.current?.(upEvent, nextSession);
        };
        document.addEventListener("pointerup", handleUp, { once: true });
      },
      end: () => {
        sessionRef.current = undefined;
        setSession(undefined);
      },
      registerUpHandler: (handler) => {
        upHandlerRef.current = handler;
      },
      session,
    }),
    [session],
  );

  return (
    <DragContext.Provider value={controller}>
      {props.children}
    </DragContext.Provider>
  );
}
