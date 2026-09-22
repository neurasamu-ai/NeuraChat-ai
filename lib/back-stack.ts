// Centralized back-button handler stack (LIFO).
//
// Purpose: Android hardware back and in-app back must first close
// the topmost open modal/sheet/overlay before navigating or minimizing.
//
// Modals are React state, not routes, so Next.js router.back() has nothing
// to pop. Each open modal registers a handler here; the back handler tries
// them in LIFO order before falling back to navigation.

type Handler = () => boolean; // return true if the back was consumed

const handlers: Handler[] = [];

export function pushBackHandler(handler: Handler): () => void {
  handlers.push(handler);
  return () => {
    const idx = handlers.indexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
  };
}

export function tryHandleBack(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    try {
      if (handlers[i]()) return true;
    } catch {
      // ignore and continue
    }
  }
  return false;
}

export function hasBackHandlers(): boolean {
  return handlers.length > 0;
}
