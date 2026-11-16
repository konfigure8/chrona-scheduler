import * as React from "react";

import { fitMenu, type MenuPlacement } from "./menuPlacement";

export interface ContextMenuItem {
  readonly danger?: boolean;
  readonly disabled?: boolean;
  /** A line before the item: it starts a new group of the menu's items. */
  readonly dividerBefore?: boolean;
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
}

export interface ContextMenuProps {
  readonly items: readonly ContextMenuItem[];
  readonly onClose: () => void;
  readonly x: number;
  readonly y: number;
}

/** Fluent-styled context menu positioned at the pointer and fitted inside the
 * board's visible area, closed by outside click or escape. Items come from the
 * host so scenarios can extend it. */
export function ContextMenu(props: ContextMenuProps): JSX.Element {
  const { items, onClose, x, y } = props;
  // What had focus when the menu opened: a shift, a person, or the board.
  const [opener] = React.useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  const restore = React.useCallback((): void => {
    if (opener?.isConnected && opener !== document.body) {
      opener.focus({ preventScroll: true });
    }
  }, [opener]);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const handlePointerDown = (downEvent: PointerEvent): void => {
      if (!menuRef.current?.contains(downEvent.target as Node)) {
        onClose();
      }
    };
    const handleKey = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === "Escape") {
        restore();
        onClose();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Fitted before the first paint: near the board's bottom or right edge the menu flips up or to
  // the left of the pointer, so every item shows. It is first measured hidden at its containing
  // block's corner, where nothing squeezes it, then placed; items that load later are measured where
  // it is. The area is the board's shell cut to the window, as a host page can scroll past the board.
  const key = `${x} ${y} ${items.map((item) => item.id).join(" ")}`;
  const [placement, setPlacement] = React.useState<MenuPlacement & { readonly key: string }>();
  React.useLayoutEffect(() => {
    const menu = menuRef.current;
    if (placement?.key === key || !menu) {
      return;
    }
    const shell = menu.closest(".chrona-sched__shell") ?? menu.offsetParent;
    if (!(shell instanceof HTMLElement)) {
      setPlacement({ key, left: x, top: y });
      return;
    }
    // The containing block's corner: the menu's own box less where it stands now.
    const own = menu.getBoundingClientRect();
    const corner = { left: own.left - (placement?.left ?? 0), top: own.top - (placement?.top ?? 0) };
    const box = shell.getBoundingClientRect();
    const view = shell.ownerDocument.defaultView;
    const fitted = fitMenu(
      { x, y },
      { height: menu.scrollHeight, width: menu.offsetWidth },
      {
        bottom: Math.min(box.top + shell.clientHeight, view?.innerHeight ?? Infinity) - corner.top,
        left: Math.max(box.left, 0) - corner.left,
        right: Math.min(box.left + shell.clientWidth, view?.innerWidth ?? Infinity) - corner.left,
        top: Math.max(box.top, 0) - corner.top,
      },
    );
    setPlacement({ ...fitted, key });
  }, [key, placement, x, y]);

  // Focus goes to the first item once the menu shows: a hidden menu cannot take it.
  const focused = React.useRef(false);
  React.useEffect(() => {
    if (placement && !focused.current) {
      focused.current = true;
      menuRef.current?.querySelector("button")?.focus();
    }
  }, [placement]);

  return (
    <div
      className="chrona-sched__menu"
      ref={menuRef}
      role="menu"
      style={
        placement
          ? {
              left: placement.left,
              maxHeight: placement.maxHeight,
              overflowY: placement.maxHeight ? "auto" : undefined,
              top: placement.top,
            }
          : { left: 0, top: 0, visibility: "hidden" }
      }
    >
      {items.map((item, index) => (
        <React.Fragment key={item.id}>
          {item.dividerBefore && index > 0 ? <div className="chrona-sched__menu-separator" role="separator" /> : null}
          <button
            className={
              item.danger
                ? "chrona-sched__menu-item chrona-sched__menu-item--danger"
                : "chrona-sched__menu-item"
            }
            // A disabled item stays focusable and is announced as disabled, as Fluent's MenuItem is; it runs nothing.
            aria-disabled={item.disabled ? true : undefined}
            data-item-id={item.id}
            onClick={() => {
              if (item.disabled) {
                return;
              }
              // Focus goes back to what opened the menu before the item acts, so a dialog it opens
              // hands focus back there when it closes.
              restore();
              onClose();
              item.onSelect();
            }}
            role="menuitem"
            type="button"
          >
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
