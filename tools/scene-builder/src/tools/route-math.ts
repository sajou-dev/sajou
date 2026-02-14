/**
 * Route math — shared geometry helpers for route path sampling and interpolation.
 *
 * Extracted from scene-renderer.ts so that both the renderer (visual) and the
 * run-mode sink (animation) can share the same path logic.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A sampled position along a route path, with direction hint for sprite flip. */
export interface PathSample {
  x: number;
  y: number;
  /** Direction: -1 = left, +1 = right. */
  directionX: number;
}

// ---------------------------------------------------------------------------
// Bézier sampling
// ---------------------------------------------------------------------------

/** Sample a quadratic Bézier curve into straight segments. */
export function sampleQuadratic(
  x0: number, y0: number,
  cx: number, cy: number,
  x1: number, y1: number,
  step: number,
): Array<{ x: number; y: number }> {
  const dist = Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy);
  const segments = Math.max(2, Math.ceil(dist / step));
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    pts.push({
      x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
      y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1,
    });
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Route flattening
// ---------------------------------------------------------------------------

/**
 * Flatten a route into a polyline of evenly-spaced sample points.
 * Handles both sharp (lineTo) and smooth (quadratic curve) segments.
 */
export function flattenRoutePath(
  points: Array<{ x: number; y: number }>,
  routePoints: Array<{ cornerStyle: "sharp" | "smooth" }>,
): Array<{ x: number; y: number }> {
  if (points.length < 2) return [...points];

  const result: Array<{ x: number; y: number }> = [{ x: points[0]!.x, y: points[0]!.y }];

  for (let i = 1; i < points.length; i++) {
    const curr = points[i]!;
    const rp = routePoints[i]!;

    if (rp.cornerStyle === "smooth" && i < points.length - 1) {
      const next = points[i + 1]!;
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      const prev = result[result.length - 1]!;
      const sampled = sampleQuadratic(prev.x, prev.y, curr.x, curr.y, midX, midY, 4);
      result.push(...sampled);
    } else {
      result.push({ x: curr.x, y: curr.y });
    }
  }

  return result;
}

/**
 * Flatten a route into a polyline, returning both the polyline and
 * a mapping from each original route point index to its polyline index.
 *
 * Used by followRoute to find named waypoints within the flattened path.
 */
export function flattenRoutePathWithMapping(
  points: Array<{ x: number; y: number }>,
  routePoints: Array<{ cornerStyle: "sharp" | "smooth" }>,
): { polyline: Array<{ x: number; y: number }>; pointIndices: number[] } {
  if (points.length < 2) {
    return { polyline: [...points], pointIndices: points.map((_, i) => i) };
  }

  const result: Array<{ x: number; y: number }> = [{ x: points[0]!.x, y: points[0]!.y }];
  const pointIndices: number[] = [0]; // index 0 maps to polyline index 0

  for (let i = 1; i < points.length; i++) {
    const curr = points[i]!;
    const rp = routePoints[i]!;

    if (rp.cornerStyle === "smooth" && i < points.length - 1) {
      const next = points[i + 1]!;
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      const prev = result[result.length - 1]!;
      const sampled = sampleQuadratic(prev.x, prev.y, curr.x, curr.y, midX, midY, 4);
      // The smooth point itself is the control point — the midpoint is where
      // the curve passes through. Mark the last sample as this point's index.
      pointIndices.push(result.length + sampled.length - 1);
      result.push(...sampled);
    } else {
      pointIndices.push(result.length);
      result.push({ x: curr.x, y: curr.y });
    }
  }

  return { polyline: result, pointIndices };
}

// ---------------------------------------------------------------------------
// Arc-length parameterization
// ---------------------------------------------------------------------------

/**
 * Compute cumulative segment lengths for a polyline.
 * Returns an array of length polyline.length where:
 *   [0] = 0
 *   [i] = sum of segment lengths from point 0 to point i
 */
export function computeSegmentLengths(
  polyline: ReadonlyArray<{ x: number; y: number }>,
): number[] {
  const lengths: number[] = [0];
  for (let i = 1; i < polyline.length; i++) {
    const prev = polyline[i - 1]!;
    const curr = polyline[i]!;
    lengths.push(lengths[i - 1]! + Math.hypot(curr.x - prev.x, curr.y - prev.y));
  }
  return lengths;
}

/**
 * Interpolate a position along a polyline at progress t in [0, 1].
 *
 * Uses binary search on cumulative lengths for O(log n) lookup,
 * then linear interpolation within the matching segment.
 * Returns position + horizontal direction for sprite flipping.
 */
export function interpolateAlongPath(
  polyline: ReadonlyArray<{ x: number; y: number }>,
  cumulativeLengths: readonly number[],
  t: number,
): PathSample {
  if (polyline.length === 0) return { x: 0, y: 0, directionX: 1 };
  if (polyline.length === 1) return { x: polyline[0]!.x, y: polyline[0]!.y, directionX: 1 };

  const totalLength = cumulativeLengths[cumulativeLengths.length - 1]!;
  const targetDist = Math.max(0, Math.min(1, t)) * totalLength;

  // Binary search for the segment containing targetDist
  let lo = 0;
  let hi = cumulativeLengths.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cumulativeLengths[mid]! <= targetDist) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const segStart = cumulativeLengths[lo]!;
  const segEnd = cumulativeLengths[hi]!;
  const segLen = segEnd - segStart;

  const a = polyline[lo]!;
  const b = polyline[hi]!;

  if (segLen === 0) {
    return { x: a.x, y: a.y, directionX: 1 };
  }

  const segT = (targetDist - segStart) / segLen;
  const x = a.x + (b.x - a.x) * segT;
  const y = a.y + (b.y - a.y) * segT;
  const directionX = b.x - a.x >= 0 ? 1 : -1;

  return { x, y, directionX };
}
