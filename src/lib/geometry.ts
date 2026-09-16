import type { Polygon, Pt } from '../types';

export const uid = (prefix = 'id'): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const r = (n: number, digits = 2): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export const clamp = (n: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, n));

export const pt = (x: number, y: number): Pt => ({ x, y });

export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s });

export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

export function bounds(poly: Polygon): { minX: number; maxX: number; minY: number; maxY: number } {
  return poly.reduce(
    (b, p) => ({
      minX: Math.min(b.minX, p.x),
      maxX: Math.max(b.maxX, p.x),
      minY: Math.min(b.minY, p.y),
      maxY: Math.max(b.maxY, p.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
}

export function signedArea(poly: Polygon): number {
  return poly.reduce((sum, p, i) => {
    const q = poly[(i + 1) % poly.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0) / 2;
}

export const area = (poly: Polygon): number => Math.abs(signedArea(poly));

export function ccw(poly: Polygon): Polygon {
  return signedArea(poly) >= 0 ? poly : [...poly].reverse();
}

export function centroid(poly: Polygon): Pt {
  const c = poly.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: c.x / poly.length, y: c.y / poly.length };
}

export function convexHull(points: Pt[]): Polygon {
  if (points.length < 3) return points.map((p) => ({ ...p }));
  const sorted = [...new Map(points.map((p) => [`${r(p.x, 4)},${r(p.y, 4)}`, p])).values()].sort(
    (a, b) => a.x - b.x || a.y - b.y,
  );
  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of sorted) {
    while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i];
    while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return ccw([...lower, ...upper]);
}

export function hullOfPolygons(polys: Polygon[]): Polygon {
  return convexHull(polys.flat());
}

interface Line {
  a: Pt;
  b: Pt;
}

function lineIntersection(l1: Line, l2: Line): Pt | null {
  const d1 = sub(l1.b, l1.a);
  const d2 = sub(l2.b, l2.a);
  const den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-9) return null;
  const d = sub(l2.a, l1.a);
  const t = (d.x * d2.y - d.y * d2.x) / den;
  return add(l1.a, scale(d1, t));
}

/** Positive distance erodes a CCW convex polygon; negative expands it. */
export function offsetConvex(input: Polygon, distanceMm: number): Polygon {
  const src = ccw(input);
  if (src.length < 3 || area(src) < 0.01) return [];
  const lines: Line[] = src.map((p, i) => {
    const q = src[(i + 1) % src.length];
    const edge = sub(q, p);
    const len = Math.hypot(edge.x, edge.y) || 1;
    const inward = { x: -edge.y / len, y: edge.x / len };
    return { a: add(p, scale(inward, distanceMm)), b: add(q, scale(inward, distanceMm)) };
  });
  const out: Pt[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const p = lineIntersection(lines[(i - 1 + lines.length) % lines.length], lines[i]);
    if (p) out.push(p);
  }
  return out.length >= 3 && area(out) > 0.1 ? ccw(out) : [];
}

export function pointInPolygon(p: Pt, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const intersects =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Clip CCW subject polygon by one CCW polygon edge. Inside is left of a->b. */
function clipHalfPlane(subject: Polygon, a: Pt, b: Pt): Polygon {
  if (subject.length === 0) return [];
  const output: Pt[] = [];
  const side = (p: Pt) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  for (let i = 0; i < subject.length; i += 1) {
    const s = subject[i];
    const e = subject[(i + 1) % subject.length];
    const ss = side(s);
    const es = side(e);
    if (ss >= 0) output.push(s);
    if ((ss < 0 && es >= 0) || (es < 0 && ss >= 0)) {
      const p = lineIntersection({ a: s, b: e }, { a, b });
      if (p) output.push(p);
    }
  }
  return output;
}

export function intersectConvex(a: Polygon, b: Polygon): Polygon {
  let subject = [...a];
  const clip = ccw(b);
  for (let i = 0; i < clip.length; i += 1) {
    subject = clipHalfPlane(subject, clip[i], clip[(i + 1) % clip.length]);
    if (subject.length < 3) return [];
  }
  return area(subject) > 0.1 ? ccw(subject) : [];
}

export function containsPolygon(outer: Polygon, inner: Polygon): boolean {
  return inner.every((p) => pointInPolygon(p, outer));
}

export function polygonsIntersect(a: Polygon, b: Polygon): boolean {
  return intersectConvex(a, b).length > 0 || a.some((p) => pointInPolygon(p, b));
}

export function distancePointToSegment(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a);
  const l2 = ab.x ** 2 + ab.y ** 2;
  if (l2 === 0) return dist(p, a);
  const t = clamp(((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2, 0, 1);
  return dist(p, add(a, scale(ab, t)));
}

export function distancePointToPolygon(p: Pt, poly: Polygon): number {
  if (pointInPolygon(p, poly)) return 0;
  return Math.min(...poly.map((a, i) => distancePointToSegment(p, a, poly[(i + 1) % poly.length])));
}

export function polygonDistance(a: Polygon, b: Polygon): number {
  if (polygonsIntersect(a, b)) return 0;
  const da = Math.min(...a.map((p) => distancePointToPolygon(p, b)));
  const db = Math.min(...b.map((p) => distancePointToPolygon(p, a)));
  return Math.min(da, db);
}

/** Rectangle swept along local X between two x coordinates, with given vertical half width. */
export function sweptRect(x0: number, x1: number, cy: number, halfWidth: number): Polygon {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  return ccw([
    pt(left, cy - halfWidth),
    pt(right, cy - halfWidth),
    pt(right, cy + halfWidth),
    pt(left, cy + halfWidth),
  ]);
}

export function regularize(poly: Polygon, digits = 2): Polygon {
  return poly.map((p) => ({ x: r(p.x, digits), y: r(p.y, digits) }));
}

export function dimensions(poly: Polygon): { width: number; length: number } {
  const b = bounds(poly);
  return { width: r(b.maxY - b.minY), length: r(b.maxX - b.minX) };
}
