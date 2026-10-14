// Keyboard → intents. Keys are matched on event.code, the physical key, so
// WASD sits in the same place on any keyboard layout.

const BINDINGS = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowRight: 'right',
  KeyD: 'right',
  KeyP: 'pause',
  Escape: 'pause',
  KeyR: 'restart',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Space: 'start',
};

const DIRECTIONS = new Set(['up', 'left', 'down', 'right']);

/**
 * handlers: onSteer(dir), onPause(), onRestart(), onConfirm(), onStart().
 * A direction is a request that Pac-Man keeps until he can take it, so a single
 * press is enough and OS key repeat changes nothing.
 */
export function attachKeyboard(handlers) {
  function handleKeydown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const action = BINDINGS[event.code];
    if (!action) return;
    // Otherwise the arrows and Space scroll the page, and a focused control
    // would take them too.
    event.preventDefault();
    if (DIRECTIONS.has(action)) {
      handlers.onSteer(action);
      return;
    }
    if (event.repeat) return;
    if (action === 'pause') handlers.onPause();
    else if (action === 'restart') handlers.onRestart();
    else if (action === 'confirm') handlers.onConfirm();
    else if (action === 'start') handlers.onStart();
  }

  window.addEventListener('keydown', handleKeydown);
  return {
    detach() {
      window.removeEventListener('keydown', handleKeydown);
    },
  };
}
