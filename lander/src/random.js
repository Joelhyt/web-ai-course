// A seeded random generator (Park–Miller), for anything that must come out the
// same every time: the renderer's starfield, and terrain in the tests.

export function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
