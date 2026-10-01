/**
 * Host messages in the model-driven app's own notification bar
 * (Xrm.App global notifications), so a sighted planner sees what the
 * screen-reader live region announces. One Chrona notice shows at a
 * time: a new one replaces the last. Success and information clear
 * themselves; errors and warnings wait for the person to close them.
 * Without the app API (a custom page, a host outside a model-driven
 * app) nothing shows beyond the live region.
 */
export type NoticeLevel = "error" | "info" | "success" | "warning";

/** Xrm.App notification levels. */
const LEVELS: Record<NoticeLevel, number> = { error: 2, info: 4, success: 1, warning: 3 };
/** The app's message bar at the top of the page: the only notification type Xrm.App offers. */
const MESSAGE_BAR = 2;
export const AUTO_CLEAR_MS = 5000;

interface XrmAppLike {
  readonly addGlobalNotification?: (notification: object) => Promise<unknown>;
  readonly clearGlobalNotification?: (id: string) => Promise<unknown>;
}

export interface AppNotifier {
  /** Show a notice; false when the app API is not there. Never rejects. */
  readonly show: (level: NoticeLevel, message: string) => Promise<boolean>;
  /** Clear the current notice, for when the control goes away. */
  readonly dispose: () => void;
}

export function createAppNotifier(
  getApp: () => XrmAppLike | undefined = () =>
    (globalThis as { Xrm?: { App?: XrmAppLike } }).Xrm?.App,
  autoClearMs = AUTO_CLEAR_MS,
): AppNotifier {
  let current: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clear = async (): Promise<void> => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    const id = current;
    current = undefined;
    const app = getApp();
    if (id && app?.clearGlobalNotification) {
      try {
        // Called on its object: the platform method may need it.
        await app.clearGlobalNotification(id);
      } catch {
        // Already closed by the person; nothing to do.
      }
    }
  };

  const showNow = async (level: NoticeLevel, message: string): Promise<boolean> => {
    const app = getApp();
    if (!app?.addGlobalNotification || !message) {
      return false;
    }
    await clear();
    try {
      const id = await app.addGlobalNotification({
        level: LEVELS[level],
        message,
        showCloseButton: true,
        type: MESSAGE_BAR,
      });
      current = typeof id === "string" ? id : undefined;
    } catch {
      return false;
    }
    if (current && (level === "success" || level === "info")) {
      const shown = current;
      timer = setTimeout(() => {
        if (current === shown) {
          void clear();
        }
      }, autoClearMs);
    }
    return true;
  };

  // Shows run one after another, so a quick second message still
  // replaces the first rather than stacking beside it.
  let queue: Promise<unknown> = Promise.resolve();
  const show = (level: NoticeLevel, message: string): Promise<boolean> => {
    const next = queue.then(() => showNow(level, message));
    queue = next.catch(() => undefined);
    return next;
  };

  return {
    dispose: (): void => {
      void clear();
    },
    show,
  };
}
