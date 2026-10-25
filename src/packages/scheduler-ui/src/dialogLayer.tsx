import { Portal } from "@fluentui/react-components";
import * as React from "react";

import { FullScreenProvider, useFullScreen } from "./fullScreen";

/*
 * The board's dialogs open over the whole window (F156, Matt 2026-10-25). A dialog inside the board
 * was only as large as the board: on a Power Apps form at a small screen the Add people dialog was
 * squashed. The board is its own stacking layer (isolation in styles.css), so a dialog inside it
 * could not rise above the host's bars either.
 *
 * So a dialog mounts as Fluent's own dialogs do: through Fluent's Portal, in a node on the page
 * body that carries the Fluent theme of the board's provider, in Fluent's layer (z-index 1000000)
 * above the host's bars. While the board is full screen the page body is hidden, so the dialog
 * mounts in the board. The layer carries the board's look (its theme variables and language), so
 * a dialog looks as it did inside the board.
 *
 * The dialog is modal, as Fluent 2 asks: the scrim covers the window, Tab stays inside the dialog,
 * Escape closes it, and focus goes back to what opened it.
 */

/** What a dialog takes from its board, now that it opens outside it. */
export interface BoardLook {
  /** The board's language: the browser hyphenates a dialog's words as that language does. */
  readonly lang?: string;
  /** The board's theme variables. */
  readonly style?: React.CSSProperties;
  /** The board's root: a dialog finds this board's own controls through it (a form can hold two boards). */
  readonly root?: React.RefObject<HTMLElement | null>;
}

const BoardLookContext = React.createContext<BoardLook>({});

export const BoardLookProvider = BoardLookContext.Provider;

/** The board a dialog belongs to: its root element, once drawn. */
export function useBoardRoot(): HTMLElement | null {
  return React.useContext(BoardLookContext).root?.current ?? null;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function focusables(within: HTMLElement): HTMLElement[] {
  return Array.from(within.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.getClientRects().length > 0);
}

/**
 * Keeps Tab inside a dialog: from the last control it goes back to the first, and Shift+Tab from
 * the first goes to the last.
 */
export function keepTabInside(event: React.KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Tab" || event.defaultPrevented) {
    return;
  }
  const items = focusables(event.currentTarget);
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) {
    return;
  }
  const active = event.currentTarget.ownerDocument.activeElement;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * What opened the dialog. An item of a menu goes with its menu, so the menu's button stands in for
 * it: the button next to the menu that says it opens one.
 */
function openerOf(active: Element | null): HTMLElement | null {
  const menu = active?.closest('[role="menu"]');
  const trigger = menu?.parentElement
    ? Array.from(menu.parentElement.children).find((sibling) => sibling !== menu && sibling.getAttribute("aria-haspopup") === "menu")
    : undefined;
  return (trigger ?? active) as HTMLElement | null;
}

/** The layers open now, the last on top: only the top one answers keys that reach no dialog. */
const openLayers: HTMLElement[] = [];

/** Whether the element can take focus and keep it. */
function canFocus(element: HTMLElement | null | undefined, doc: Document): element is HTMLElement {
  return (
    !!element &&
    element.isConnected &&
    element !== doc.body &&
    !(element as HTMLButtonElement).disabled &&
    element.getClientRects().length > 0 &&
    element.closest("[inert]") === null
  );
}

function focusOn(element: HTMLElement | null | undefined, doc: Document): boolean {
  if (!canFocus(element, doc)) {
    return false;
  }
  element.focus({ preventScroll: true });
  return doc.activeElement === element;
}

/** No control holds focus: the one that held it has gone, with its dialog or its menu. */
function focusLost(doc: Document): boolean {
  const active = doc.activeElement;
  return !active || active === doc.body || !active.isConnected;
}

/*
 * The page stays still behind the scrim, as behind Fluent's dialog (useDisableBodyScroll in
 * @fluentui/react-dialog): only where the page itself scrolls, and back as it was when the last
 * dialog closes.
 */
let scrollLocks = 0;
let scrollKept: { readonly html: string; readonly body: string } | undefined;

function lockScroll(doc: Document): () => void {
  if (scrollLocks === 0 && Math.floor(doc.body.getBoundingClientRect().height) > (doc.defaultView?.innerHeight ?? 0)) {
    scrollKept = { body: doc.body.style.overflowY, html: doc.documentElement.style.overflowY };
    doc.documentElement.style.overflowY = "hidden";
    doc.body.style.overflowY = "hidden";
  }
  scrollLocks += 1;
  return () => {
    scrollLocks -= 1;
    if (scrollLocks === 0 && scrollKept) {
      doc.documentElement.style.overflowY = scrollKept.html;
      doc.body.style.overflowY = scrollKept.body;
      scrollKept = undefined;
    }
  };
}

export interface DialogLayerProps {
  readonly children: React.ReactNode;
  /** A click on the scrim, where the dialog closes on one (never an alert dialog, as in Fluent). */
  readonly onClick?: React.MouseEventHandler<HTMLDivElement>;
  /** Escape, where the dialog does not answer it itself. */
  readonly onEscape?: () => void;
  readonly role?: React.AriaRole;
}

/** A board dialog's scrim over the whole window; the dialog is its child. */
export function DialogLayer(props: DialogLayerProps): JSX.Element {
  const look = React.useContext(BoardLookContext);
  const fullScreen = useFullScreen();
  const layer = React.useRef<HTMLDivElement | null>(null);
  // Fluent pop-ups opened from the dialog mount inside its layer while the board is full screen.
  const [popups, setPopups] = React.useState<HTMLDivElement | null>(null);
  // What opened the dialog, as it renders: still in the page then, a menu item too.
  const [opener] = React.useState(() => (typeof document === "undefined" ? null : openerOf(document.activeElement)));
  // A dialog that follows another (a confirm from a dialog, back from it) keeps the scrim as it is: no flash to
  // bright and back, as Fluent's backdrop does not flash between two dialogs.
  const [follows] = React.useState(() => openLayers.length > 0);
  const onEscape = React.useRef(props.onEscape);
  onEscape.current = props.onEscape;
  React.useEffect(() => {
    const element = layer.current;
    const doc = element?.ownerDocument;
    if (!element || !doc) {
      return undefined;
    }
    // Where focus is as the dialog opens: its opener, or where a dialog that closed for this one handed it back.
    const before = doc.activeElement as HTMLElement | null;
    const board = look.root?.current ?? null;
    openLayers.push(element);
    const unlock = lockScroll(doc);
    // Focus starts in the dialog; a dialog that picks its own first field moves it there after this.
    if (!element.contains(doc.activeElement)) {
      focusables(element)[0]?.focus({ preventScroll: true });
    }
    // Focus lost inside the dialog (its control went): Tab comes back into the dialog, and Escape still closes it.
    const onLostKey = (keyEvent: KeyboardEvent): void => {
      if (openLayers[openLayers.length - 1] !== element || !focusLost(doc)) {
        return;
      }
      if (keyEvent.key === "Tab") {
        keyEvent.preventDefault();
        const items = focusables(element);
        (keyEvent.shiftKey ? items[items.length - 1] : items[0])?.focus();
      } else if (keyEvent.key === "Escape") {
        onEscape.current?.();
      }
    };
    doc.addEventListener("keydown", onLostKey);
    return () => {
      doc.removeEventListener("keydown", onLostKey);
      openLayers.splice(openLayers.indexOf(element), 1);
      unlock();
      // The dialog sent focus on itself as it closed.
      if (!focusLost(doc) && !element.contains(doc.activeElement)) {
        return;
      }
      if (focusOn(opener, doc) || focusOn(before, doc)) {
        return;
      }
      // The opener went (a deleted shift, a dialog's own button): the dialog still open below, else the board.
      const below = openLayers[openLayers.length - 1];
      const fallback = below
        ? focusables(below)[0]
        : (board?.querySelector<HTMLElement>('[role="grid"] button') ?? (board ? focusables(board)[0] : undefined));
      fallback?.focus({ preventScroll: true });
    };
    // The layer's element, its opener and its board stay the same while it is open.
  }, []);
  const inner = React.useMemo(
    () => (fullScreen?.active ? { ...fullScreen, mountNode: popups ?? fullScreen.mountNode } : fullScreen),
    [fullScreen, popups],
  );
  const onKeyDown = (keyEvent: React.KeyboardEvent<HTMLDivElement>): void => {
    // Only this layer's own keys: a Fluent pop-up from the dialog (a list, a calendar) answers its own.
    if (!keyEvent.currentTarget.contains(keyEvent.target as Node)) {
      return;
    }
    if (keyEvent.key === "Escape" && props.onEscape && !keyEvent.defaultPrevented) {
      // Escape in an open list closes the list, not the dialog.
      if ((keyEvent.target as HTMLElement).getAttribute("aria-expanded") === "true") {
        return;
      }
      keyEvent.stopPropagation();
      props.onEscape();
      return;
    }
    keepTabInside(keyEvent);
  };
  return (
    <Portal mountNode={fullScreen?.board}>
      <div
        className={`chrona-sched chrona-sched__dialog-layer${follows ? " chrona-sched__dialog-layer--follows" : ""}`}
        lang={look.lang}
        onKeyDown={onKeyDown}
        ref={layer}
        style={look.style}
      >
        <FullScreenProvider value={inner}>
          <div className="chrona-sched__dialog-backdrop" onClick={props.onClick} role={props.role}>
            {props.children}
          </div>
        </FullScreenProvider>
        {fullScreen?.active ? <div className="chrona-sched__portals" ref={setPopups} /> : null}
      </div>
    </Portal>
  );
}
