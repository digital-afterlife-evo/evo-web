export function sceneAt(scroll, distance) {
  const progress = Math.max(0, Math.min(3, distance > 0 ? scroll / distance * 3 : 0));
  return {
    progress,
    chapter: Math.round(progress),
    visibility: Array.from({ length: 4 }, (_, i) => Math.max(0, 1 - Math.abs(i - progress) * 1.6)),
  };
}

export function letterAt(progress, reduced = false) {
  const p = Math.max(0, Math.min(3, reduced ? Math.round(progress) : progress));
  const ease = (start, end) => {
    const t = Math.max(0, Math.min(1, (p - start) / (end - start)));
    return t * t * (3 - 2 * t);
  };
  const departure = ease(.08, .44);
  const arrival = ease(.52, .94);
  const reunion = ease(2.55, 2.95);
  const memory = p >= .48 && p < 2.5;
  // The sheet wraps from above to below the viewport only while fully hidden.
  return {
    travel: p < .48 ? 0 - 115 * departure : p < 1 ? 115 * (1 - arrival) : 0,
    tilt: p < .48 ? -10 * departure : p < 1 ? 16 * (1 - arrival) - 2 : memory ? -2 : 0,
    memory: Number(memory),
    opacity: p >= .44 && p <= .52 ? 0 : 1 - ease(1.25, 1.55) + reunion,
    machine: 1 - ease(.25, .48) + reunion,
  };
}

export function filmOffsets(scroll, distance) {
  const travel = Math.max(0, Math.min(scroll, Math.max(0, distance))) * .36;
  return { down: travel, up: -travel };
}

export const FILM_IDLE_SPEED = 12;

export function advanceFilm({ offset, speed, boost }, elapsed) {
  // Cap long frames so restoring a hidden tab never jumps through several frames of film.
  const dt = Math.max(0, Math.min(elapsed, .05));
  const nextSpeed = speed + (FILM_IDLE_SPEED + boost - speed) * (1 - Math.exp(-dt * 10));
  return { offset: offset + nextSpeed * dt, speed: nextSpeed, boost: boost * Math.exp(-dt * 2.8) };
}
