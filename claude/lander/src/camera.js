// The view: where it looks and how close. Presentation only. The rules never
// read it, but it is pure, so the zoom behaviour can be tested from Node.
//
// The camera looks at a point (cx, cy) in world metres, magnified by `zoom`.
// Zoom 1 centred on the middle of the world is the whole world, as before.

import { WORLD, ZOOM } from './config.js';
import { groundHeight } from './terrain.js';
import { altitude } from './physics.js';

const WHOLE_WORLD = Object.freeze({ zoom: 1, cx: WORLD.width / 2, cy: WORLD.height / 2 });

export function createCamera() {
  return { ...WHOLE_WORLD, zoomed: false, terrain: null };
}

/** The same x a whole number of world-widths over, whichever is nearest `near`. */
function nearestCopy(x, near) {
  return x + WORLD.width * Math.round((near - x) / WORLD.width);
}

/** Whether the view should be zoomed in, with hysteresis between ZOOM.inBelow and ZOOM.outAbove. */
function wantsZoom(camera, state, settings) {
  switch (state.status) {
    case 'flying':
    case 'paused': {
      const height = altitude(state.terrain, state.lander);
      if (camera.zoomed) return height <= settings.outAbove;
      return height < settings.inBelow;
    }
    case 'landed':
    case 'crashed':
      // Stay as it was: a landing seen up close stays up close.
      return camera.zoomed;
    default:
      return false;
  }
}

/** Where the camera should be: the whole world, or close in on the lander with the ground beneath it in view. */
export function cameraTarget(camera, state, zoomed, settings = ZOOM) {
  if (!zoomed) return { ...WHOLE_WORLD, cx: nearestCopy(WHOLE_WORLD.cx, camera.cx) };
  const zoom = settings.factor;
  const viewHeight = WORLD.height / zoom;
  const { x } = state.lander;
  // The ground right under the lander sits a fixed share up from the bottom,
  // which leaves the rest of the view above it for the lander's descent.
  const ground = groundHeight(state.terrain, x);
  const cy = ground + viewHeight * (0.5 - settings.groundShare);
  return {
    zoom,
    cx: nearestCopy(x, camera.cx),
    cy: Math.min(WORLD.height - viewHeight / 2, Math.max(viewHeight / 2, cy)),
  };
}

/**
 * Moves the camera toward where it should be, easing so the zoom and the
 * panning glide rather than jump. On a new round (new terrain) it cuts
 * straight there instead: gliding out over ground that just changed would look
 * like a glitch.
 */
export function updateCamera(camera, state, dtMs, settings = ZOOM) {
  camera.zoomed = wantsZoom(camera, state, settings);
  const target = cameraTarget(camera, state, camera.zoomed, settings);

  if (camera.terrain !== state.terrain) {
    camera.terrain = state.terrain;
    Object.assign(camera, target);
  } else {
    // Exponential smoothing: the same feel at any frame rate.
    const k = 1 - Math.exp(-dtMs / 1000 / settings.smoothing);
    camera.zoom += (target.zoom - camera.zoom) * k;
    camera.cx += (target.cx - camera.cx) * k;
    camera.cy += (target.cy - camera.cy) * k;
  }
  // Keep the centre's x in the world; the renderer draws across the seam.
  camera.cx = ((camera.cx % WORLD.width) + WORLD.width) % WORLD.width;
  return camera;
}
