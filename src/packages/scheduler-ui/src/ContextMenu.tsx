import * as React from "react";

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

/** Fluent-styled context menu positioned at the pointer, closed by outside
 * click or escape. Items come from the host so scenarios can extend it. */
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

  React.useEffect(() => {
    menuRef.current?.querySelector("button")?.focus();
  }, []);

  return (
    <div
      className="chrona-sched__menu"
      ref={menuRef}
      role="menu"
      style={{ left: x, top: y }}
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
            data-item-id={item.id}
            disabled={item.disabled}
            onClick={() => {
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
