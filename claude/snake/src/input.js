// Translates keyboard events into game intents. Knows nothing about game rules.

const DIRECTIONS = {
  arrowup: { x: 0, y: -1 },
  w: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 },
  s: { x: 0, y: 1 },
  arrowleft: { x: -1, y: 0 },
  a: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 },
  d: { x: 1, y: 0 },
};

/**
 * Wires up keydown handling and returns a function that detaches it.
 * Uses event.key rather than the deprecated keyCode.
 */
export function attachKeyboard({ onDirection, onTogglePause, onRestart }) {
  function handleKeydown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key.toLowerCase();
    const direction = DIRECTIONS[key];

    if (direction) {
      // Otherwise the arrow keys scroll the page while the player is steering.
      event.preventDefault();
      onDirection(direction);
      return;
    }

    if (key === ' ' || key === 'spacebar') {
      event.preventDefault();
      if (!event.repeat) onTogglePause();
      return;
    }

    if (key === 'p') {
      if (!event.repeat) onTogglePause();
      return;
    }

    if (key === 'enter' || key === 'r') {
      if (!event.repeat) onRestart();
    }
  }

  window.addEventListener('keydown', handleKeydown);
  return () => window.removeEventListener('keydown', handleKeydown);
}
