// Translates keyboard events into game intents. Knows nothing about game rules.
//
// Sideways movement repeats on the game's own timers (DAS and ARR) rather than
// on the operating system's key repeat, which is slow, differs per machine and
// cannot be tuned. Every OS repeat event is ignored.

// event.code rather than event.key: it names the physical key, so Z and X sit
// side by side under the left hand whatever the keyboard layout.
const BINDINGS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'softDrop',
  Space: 'hardDrop',
  ArrowUp: 'rotateCW',
  KeyX: 'rotateCW',
  KeyZ: 'rotateCCW',
  KeyC: 'hold',
  ShiftLeft: 'hold',
  ShiftRight: 'hold',
  KeyP: 'pause',
  Escape: 'pause',
  KeyR: 'restart',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
};

/** How many repeats a direction held for `ms` has earned in total. */
function repeatsBy(ms, das, arr) {
  if (ms < das) return 0;
  return Math.floor((ms - das) / arr) + 1;
}

/**
 * Wires up the keyboard. `handlers.onShift(dx)` must return whether the piece
 * moved, which is how an ARR of 0 knows it has reached the wall.
 * Returns { update(dt), detach() }; update drives the auto-repeat and belongs
 * in the animation loop.
 */
export function attachKeyboard(handlers, { das, arr }) {
  const held = { left: false, right: false, softDrop: false };
  // The most recent direction pressed wins while both are held — letting go of
  // it hands control back to the other one.
  let direction = 0;
  let charge = 0;

  function press(dir) {
    direction = dir;
    charge = 0;
    handlers.onShift(dir);
  }

  function release() {
    const next = held.right ? 1 : held.left ? -1 : 0;
    if (next !== direction) {
      direction = next;
      charge = 0;
    }
  }

  function handleKeydown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const action = BINDINGS[event.code];
    if (!action) return;
    // Otherwise Space and the arrows scroll the page, and a focused control
    // would take them too.
    event.preventDefault();
    if (event.repeat) return;

    switch (action) {
      case 'left':
        held.left = true;
        press(-1);
        break;
      case 'right':
        held.right = true;
        press(1);
        break;
      case 'softDrop':
        held.softDrop = true;
        handlers.onSoftDrop(true);
        break;
      case 'hardDrop':
        handlers.onHardDrop();
        break;
      case 'rotateCW':
        handlers.onRotate(1);
        break;
      case 'rotateCCW':
        handlers.onRotate(-1);
        break;
      case 'hold':
        handlers.onHold();
        break;
      case 'pause':
        handlers.onPause();
        break;
      case 'restart':
        handlers.onRestart();
        break;
      case 'confirm':
        handlers.onConfirm();
        break;
      default:
        break;
    }
  }

  function handleKeyup(event) {
    const action = BINDINGS[event.code];
    if (action === 'left') {
      held.left = false;
      release();
    } else if (action === 'right') {
      held.right = false;
      release();
    } else if (action === 'softDrop') {
      held.softDrop = false;
      handlers.onSoftDrop(false);
    }
  }

  // A key released while the window is not focused never sends keyup, and the
  // piece would slide into the wall on its own when the player came back.
  function releaseAll() {
    held.left = false;
    held.right = false;
    direction = 0;
    charge = 0;
    if (held.softDrop) {
      held.softDrop = false;
      handlers.onSoftDrop(false);
    }
  }

  function update(dt) {
    if (!direction) return;
    const before = repeatsBy(charge, das, arr || 1);
    charge += dt;
    const after = repeatsBy(charge, das, arr || 1);
    if (after === before) return;
    if (arr === 0) {
      // Instant repeat: straight to the wall.
      while (handlers.onShift(direction));
      return;
    }
    for (let i = before; i < after; i += 1) {
      if (!handlers.onShift(direction)) break;
    }
  }

  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('keyup', handleKeyup);
  window.addEventListener('blur', releaseAll);

  return {
    update,
    detach() {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('keyup', handleKeyup);
      window.removeEventListener('blur', releaseAll);
    },
  };
}
