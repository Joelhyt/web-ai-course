// Keyboard → intents. Steering and thrust are held, so this keeps track of
// which of those keys are down; the rest are one-shot presses. Keys are matched
// on event.code, the physical key, so WASD sits in the same place on any layout.

const HELD = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'thrust',
  KeyW: 'thrust',
  Space: 'thrust',
};

const PRESSED = {
  KeyP: 'pause',
  Escape: 'pause',
  KeyR: 'restart',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
};

/**
 * handlers: onStart(), onPause(), onRestart(), onConfirm().
 * Returns { held, detach }: `held` is { left, right, thrust }, kept current.
 * Any held key also counts as onStart, so the first burn can launch the game.
 */
export function attachKeyboard(handlers) {
  const held = { left: false, right: false, thrust: false };

  function handleKeydown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const control = HELD[event.code];
    const action = PRESSED[event.code];
    if (!control && !action) return;
    // Otherwise the arrows and Space scroll the page, and a focused control
    // would take them too.
    event.preventDefault();
    if (control) {
      held[control] = true;
      if (!event.repeat && event.code === 'Space') handlers.onStart();
      return;
    }
    if (event.repeat) return;
    if (action === 'pause') handlers.onPause();
    else if (action === 'restart') handlers.onRestart();
    else if (action === 'confirm') handlers.onConfirm();
  }

  function handleKeyup(event) {
    const control = HELD[event.code];
    if (control) held[control] = false;
  }

  // A key released while the window is not focused never sends keyup, and the
  // engine would keep burning on its own when the player came back.
  function releaseAll() {
    held.left = false;
    held.right = false;
    held.thrust = false;
  }

  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('keyup', handleKeyup);
  window.addEventListener('blur', releaseAll);

  return {
    held,
    detach() {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('keyup', handleKeyup);
      window.removeEventListener('blur', releaseAll);
    },
  };
}
