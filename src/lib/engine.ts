import type {
  Candidate,
  CandidateResult,
  CrackInput,
  DamageInput,
  FeedbackRecord,
  MeasureFeature,
  MeasurementSettings,
  ObstacleInput,
  Polygon,
  Pt,
  SawPath,
} from '../types';
import {
  add,
  area,
  bounds,
  centroid,
  containsPolygon,
  convexHull,
  dimensions,
  offsetConvex,
  polygonDistance,
  polygonsIntersect,
  pt,
  regularize,
  scale,
  sub,
} from './geometry';

const swapPoly = (poly: Polygon): Polygon => poly.map((p) => ({ x: p.y, y: p.x }));

interface Transform {
  toLocal: (p: Pt) => Pt;
  fromLocal: (p: Pt) => Pt;
  poly: (p: Polygon) => Polygon;
  polyBack: (p: Polygon) => Polygon;
}

const transformFor = (axis: MeasurementSettings['grainAxis']): Transform => {
  if (axis === 'x') {
    return {
      toLocal: (p) => ({ ...p }),
      fromLocal: (p) => ({ ...p }),
      poly: (p) => p.map((q) => ({ ...q })),
      polyBack: (p) => p.map((q) => ({ ...q })),
    };
  }
  return {
    toLocal: (p) => ({ x: p.y, y: p.x }),
    fromLocal: (p) => ({ x: p.y, y: p.x }),
    poly: swapPoly,
    polyBack: swapPoly,
  };
};

interface Adjustments {
  trimTip: number;
  extendRoot: number;
  expandSide: number;
}

function feedbackAdjustments(feedback: FeedbackRecord[], glue: number): Adjustments {
  return feedback.reduce<Adjustments>(
    (acc, f) => {
      if (f.type === 'bottomed') acc.trimTip += Math.max(0, f.observedMm - glue);
      if (f.type === 'shoulderExposed' || f.type === 'shoulderGap')
        acc.extendRoot += Math.max(0, f.observedMm - glue);
      if (f.type === 'sideGap') acc.expandSide += Math.max(0, f.observedMm - glue);
      return acc;
    },
    { trimTip: 0, extendRoot: 0, expandSide: 0 },
  );
}

function sectionHalfWidth(poly: Polygon, x: number, cy: number): number {
  const ys: number[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (Math.abs(a.x - b.x) < 1e-9) continue;
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    if (x >= minX && x <= maxX) {
      const y = a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
      ys.push(y);
    }
  }
  if (ys.length < 2) return 0;
  ys.sort((a, b) => a - b);
  // Convex polygon has one lower and one upper intersection.
  return Math.min(cy - ys[0], ys[ys.length - 1] - cy);
}

function kerfEnvelope(a: Pt, b: Pt, width: number): Polygon {
  const e = sub(b, a);
  const len = Math.hypot(e.x, e.y) || 1;
  const n = { x: -e.y / len, y: e.x / len };
  const half = width / 2;
  return [
    add(a, scale(n, half)),
    add(b, scale(n, half)),
    add(b, scale(n, -half)),
    add(a, scale(n, -half)),
  ];
}

function rectAround(poly: Polygon, margin: number): Polygon {
  const b = bounds(poly);
  return [
    pt(b.minX - margin, b.minY - margin),
    pt(b.maxX + margin, b.minY - margin),
    pt(b.maxX + margin, b.maxY + margin),
    pt(b.minX - margin, b.maxY + margin),
  ];
}

function stableHash(value: unknown): string {
  const s = JSON.stringify(value, (_key, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v));
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

interface DamageCase {
  raw: DamageInput;
  safe: Polygon;
  maximum: Polygon;
  center: Pt;
  shoulderX: number;
}

interface Strategy {
  id: string;
  label: string;
  direction: 'root-wide' | 'tip-wide';
  ratio: number;
  scale: number;
  lengthScale: number;
}

export function calculateCandidates(
  features: MeasureFeature[],
  settings: MeasurementSettings,
  feedback: FeedbackRecord[],
): CandidateResult {
  const tf = transformFor(settings.grainAxis);
  const localFeatures = features.map((f) => {
    if (f.kind === 'joint') {
      return { ...f, points: f.points.map(tf.toLocal) as [Pt, Pt] };
    }
    return { ...f, polygon: tf.poly(f.polygon) };
  });

  const damages = localFeatures.filter((f): f is DamageInput => f.kind === 'damage');
  const cracks = localFeatures.filter((f): f is CrackInput => f.kind === 'crack');
  const obstacles = localFeatures.filter((f): f is ObstacleInput => f.kind === 'obstacle');
  const shoulder = localFeatures.find((f) => f.kind === 'joint');

  const diagnostics: string[] = [];
  if (!damages.length) diagnostics.push('请先描出至少一个缺口损伤区。');
  if (!shoulder || shoulder.kind !== 'joint') diagnostics.push('请用残存榫肩两点确定肩线。');

  const adj = feedbackAdjustments(feedback, settings.glueLineMm);
  const t = settings.toleranceMm;
  const boards = localFeatures
    .filter((f) => f.kind === 'board')
    .map((f) => convexHull(f.polygon));
  const expandedCracks = cracks
    .map((c) => convexHull(c.polygon))
    .map((c) => offsetConvex(c, t + settings.glueLineMm))
    .filter((c) => c.length > 2);
  const expandedObstacles = obstacles
    .map((o) => convexHull(o.polygon))
    .map((o) => offsetConvex(o, t + settings.glueLineMm))
    .filter((o) => o.length > 2);
  const insertionObstacles = obstacles
    .map((o) => convexHull(o.polygon))
    .map((o) => offsetConvex(o, t + settings.maxSideGapMm))
    .filter((o) => o.length > 2);

  if (!boards.length) diagnostics.push('请先描出板厚轮廓，便于检查补齿木纹和板边。');

  const cases: DamageCase[] = damages.map((d) => {
    const hull = convexHull(d.polygon);
    const safe = offsetConvex(hull, t);
    const maximum = offsetConvex(hull, -t);
    const center = centroid(safe.length ? safe : hull);
    let shoulderX = center.x;
    if (shoulder?.kind === 'joint') {
      const [a, b] = shoulder.points;
      shoulderX = (a.x + b.x) / 2;
      if (Math.abs(a.x - b.x) > 2) diagnostics.push('残存肩点近似沿木纹错位，肩线可能描斜。');
    }
    return { raw: d, safe, maximum, center, shoulderX };
  });

  const strategies: Strategy[] = [
    { id: 'balanced', label: '标准 1:7 最大贴合', direction: 'root-wide', ratio: settings.slopeRatio, scale: 1, lengthScale: 1 },
    { id: 'shallow', label: '缓斜 1:8 易修凿', direction: 'root-wide', ratio: 8, scale: 0.985, lengthScale: 0.96 },
    { id: 'steep', label: '陡斜 1:6 抗拔', direction: 'root-wide', ratio: 6, scale: 0.97, lengthScale: 0.98 },
    { id: 'compact', label: '短齿省料', direction: 'root-wide', ratio: settings.slopeRatio, scale: 0.95, lengthScale: 0.82 },
    { id: 'inverse', label: '反斜限位（仅根侧可达）', direction: 'tip-wide', ratio: settings.slopeRatio, scale: 0.96, lengthScale: 0.94 },
    { id: 'maxbearing', label: '最大承压面', direction: 'root-wide', ratio: settings.slopeRatio, scale: 0.995, lengthScale: 1.02 },
  ];

  const forbiddenForPatch = [...expandedCracks, ...expandedObstacles];
  const candidates: Candidate[] = [];

  for (const [damageIndex, damage] of cases.entries()) {
    if (!damage.safe.length) {
      diagnostics.push('有缺口在扣除测量误差后不足 3 个顶点，请缩小误差或补测缺口边界。');
      continue;
    }
    const b = bounds(damage.safe);
    const targetRootX = damage.shoulderX + adj.extendRoot;
    const rootX = Math.max(b.minX + 1.5, Math.min(b.maxX - 4, targetRootX));
    const maxLength = b.maxX - rootX - 1.2 - adj.trimTip;
    const preferredLength = Math.max(5, Math.min(maxLength, b.maxX - damage.shoulderX - 1));

    for (const s of strategies) {
      const length = Math.max(4, preferredLength * s.lengthScale);
      const tipX = rootX + length - adj.trimTip;
      if (tipX <= rootX + 3) continue;
      const cy = damage.center.y;
      const rootAvail = sectionHalfWidth(damage.safe, rootX, cy);
      const tipAvail = sectionHalfWidth(damage.safe, tipX, cy);
      if (rootAvail < 2 || tipAvail < 2) continue;

      let rootHalf: number;
      let tipHalf: number;
      const sideAdjust = Math.min(adj.expandSide, 0.8);
      if (s.direction === 'root-wide') {
        rootHalf = Math.min(
          rootAvail - settings.glueLineMm + sideAdjust,
          tipAvail - settings.glueLineMm + length / s.ratio + sideAdjust,
        ) * s.scale;
        tipHalf = rootHalf - length / s.ratio;
      } else {
        tipHalf = Math.min(
          tipAvail - settings.glueLineMm + sideAdjust,
          rootAvail - settings.glueLineMm + length / s.ratio + sideAdjust,
        ) * s.scale;
        rootHalf = tipHalf - length / s.ratio;
      }
      if (rootHalf < 2 || tipHalf < 2) continue;

      const patchLocal = [
        pt(rootX, cy - rootHalf),
        pt(tipX, cy - tipHalf),
        pt(tipX, cy + tipHalf),
        pt(rootX, cy + rootHalf),
      ];
      if (!containsPolygon(damage.safe, patchLocal)) continue;
      if (forbiddenForPatch.some((z) => polygonsIntersect(patchLocal, z))) continue;

      // The dry/rough-saw profile is deliberately oversize on the replacement
      // stock. It must not be required to enter the old board before paring.
      const dryLocal = offsetConvex(patchLocal, -settings.dryAllowanceMm);
      if (!dryLocal.length) continue;
      // Highlight the old-part material that must be pared: the certain
      // damage boundary around the final cavity, expanded by the glue line.
      const pareArea = offsetConvex(patchLocal, -settings.glueLineMm);
      if (!pareArea.length || !containsPolygon(damage.safe, pareArea)) continue;

      const insertFromRoot = s.direction === 'tip-wide';
      const accessOk =
        settings.accessSide === 'both' ||
        (settings.accessSide === 'root' && insertFromRoot) ||
        (settings.accessSide === 'tip' && !insertFromRoot);

      const sweepStart = insertFromRoot ? b.minX - 6 : b.maxX + 6;
      const swept = [
        pt(Math.min(sweepStart, rootX), cy - Math.max(rootHalf, tipHalf)),
        pt(Math.max(sweepStart, tipX), cy - Math.max(rootHalf, tipHalf)),
        pt(Math.max(sweepStart, tipX), cy + Math.max(rootHalf, tipHalf)),
        pt(Math.min(sweepStart, rootX), cy + Math.max(rootHalf, tipHalf)),
      ];
      const insertClearance = Math.min(
        ...insertionObstacles.map((o) => polygonDistance(swept, o)),
        99,
      );
      if (insertionObstacles.length && insertClearance <= 0) continue;

      const patchScreen = tf.polyBack(patchLocal);
      const dryScreen = tf.polyBack(dryLocal);
      const pareScreen = tf.polyBack(pareArea);
      const blankLocal = rectAround(dryLocal, settings.sawKerfMm + 0.8);
      const blankScreen = tf.polyBack(blankLocal);

      const sawPaths: SawPath[] = [];
      const oldCuts: Array<[Pt, Pt]> = [
        [patchLocal[0], patchLocal[1]],
        [patchLocal[3], patchLocal[2]],
      ];
      oldCuts.forEach(([a0, b0], i) => {
        const edge = sub(b0, a0);
        const len = Math.hypot(edge.x, edge.y);
        const n = { x: -edge.y / len, y: edge.x / len };
        const inward = settings.accessSide === 'tip' ? scale(n, i === 0 ? 1.2 : -1.2) : scale(n, i === 0 ? -1.2 : 1.2);
        const a = add(a0, inward);
        const b = add(b0, inward);
        const kerf = kerfEnvelope(a, b, settings.sawKerfMm);
        const safe = containsPolygon(damage.safe, kerf) && !forbiddenForPatch.some((z) => polygonsIntersect(kerf, z));
        sawPaths.push({
          id: `old-relief-${i}`,
          label: `旧件损伤区留量锯口 ${i + 1}`,
          kerf: tf.polyBack(kerf),
          safe,
          detail: safe ? '锯路位于实测损伤内缩边界内，保留修凿量。' : '锯路越出确定损伤区，只允许修凿或需补测。',
        });
      });
      const bb = bounds(blankLocal);
      const stockCuts: Array<[Pt, Pt, string]> = [
        [pt(bb.minX, bb.minY), pt(bb.maxX, bb.minY), '坯料顺纹纵切'],
        [pt(bb.maxX, bb.minY), pt(bb.maxX, bb.maxY), '端部截切'],
      ];
      stockCuts.forEach(([a, b0, label], i) => {
        sawPaths.push({
          id: `stock-cut-${i}`,
          label,
          kerf: tf.polyBack(kerfEnvelope(a, b0, settings.sawKerfMm)),
          safe: true,
          detail: '此锯切在独立坯料上进行，不接触旧件。',
        });
      });

      // The generated cavity is generated as patch expanded by glueLine.
      // A trial-fit correction can deliberately enlarge the replacement;
      // geometry containment checks still protect cracks and certain wood.
      const sideGap = settings.glueLineMm + Math.max(0, adj.expandSide);
      const shoulderGap = Math.abs(targetRootX - rootX) + settings.glueLineMm;
      const crackClearance = Math.min(...expandedCracks.map((c) => polygonDistance(patchLocal, c)), 99);
      const patchArea = area(patchLocal);
      const dim = dimensions(patchLocal);
      const warnings: string[] = [];
      const unsafeOldSaw = sawPaths.some((p) => p.id.startsWith('old-') && !p.safe);
      if (unsafeOldSaw) warnings.push('旧件留量锯口不能保证完全在损伤区内；该候选应改用修凿，不可沿锯口下锯。');
      if (!accessOk) warnings.push('凿刀可达侧与推荐插入方向相反，需反向装夹或改用候选。');
      if (adj.trimTip > 0) warnings.push(`试装顶住已累计截短 ${adj.trimTip.toFixed(2)} mm。`);
      if (adj.expandSide > 0) warnings.push(`试装侧隙已放大补齿 ${adj.expandSide.toFixed(2)} mm；超出现场坯料需换新坯。`);
      if (sideGap > settings.maxSideGapMm) warnings.push('最不利侧隙超限，需要加大补齿、贴薄片或重选候选。');
      if (shoulderGap > settings.maxShoulderGapMm) warnings.push('肩缝逼近或超过限值。');

      const score =
        patchArea * 2 +
        dim.length * 0.4 -
        warnings.length * 18 -
        (accessOk ? 0 : 40) +
        Math.min(crackClearance, 8) * 2 +
        Math.min(insertClearance, 8) * 1.5 -
        Math.abs(sideGap - settings.glueLineMm) * 12;

      const hashInput = {
        settings,
        features: localFeatures,
        damage: damage.raw.id,
        strategy: s.id,
        adj,
        patch: regularize(patchLocal, 1),
      };
      const id = `${damage.raw.id}_${damageIndex}_${s.id}`;
      candidates.push({
        id,
        label: s.label,
        strategy: `${s.direction === 'root-wide' ? '根宽尖窄' : '尖宽根窄'}，斜度 1:${s.ratio}`,
        patch: patchScreen,
        cavity: tf.polyBack(damage.safe),
        dryPatch: dryScreen,
        blank: {
          polygon: blankScreen,
          width: dimensions(blankLocal).width,
          length: dimensions(blankLocal).length,
          grainLabel: settings.grainAxis === 'x' ? '木纹 →（与原板同向）' : '木纹 ↓（与原板同向）',
        },
        sawPaths,
        pareArea: pareScreen,
        root: { x: rootX, halfWidth: rootHalf },
        tip: { x: tipX, halfWidth: tipHalf },
        direction: s.direction,
        score,
        shoulderGap,
        sideGap,
        crackClearance: crackClearance === 99 ? Number.POSITIVE_INFINITY : crackClearance,
        insertClearance: insertClearance === 99 ? Number.POSITIVE_INFINITY : insertClearance,
        warnings,
        metrics: [
          { label: '补齿长 × 最大宽', value: `${dim.length.toFixed(1)} × ${dim.width.toFixed(1)} mm`, acceptable: dim.length >= 4 && dim.width >= 4 },
          { label: '干装肩缝上限', value: `${shoulderGap.toFixed(2)} / ${settings.maxShoulderGapMm.toFixed(2)} mm`, acceptable: shoulderGap <= settings.maxShoulderGapMm },
          { label: '最不利侧隙', value: `${sideGap.toFixed(2)} / ${settings.maxSideGapMm.toFixed(2)} mm`, acceptable: sideGap <= settings.maxSideGapMm },
          { label: '裂纹禁切净距', value: crackClearance === 99 ? '无裂纹' : `${crackClearance.toFixed(2)} mm`, acceptable: crackClearance >= settings.glueLineMm },
          { label: '插入路径净距', value: insertClearance === 99 ? '无障碍' : `${insertClearance.toFixed(2)} mm`, acceptable: insertClearance > 0 },
          { label: '凿刀可达侧', value: accessOk ? '匹配' : '不匹配', acceptable: accessOk },
        ],
        hash: stableHash(hashInput),
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const distinct = candidates.filter((c, i) => {
    if (i === 0) return true;
    const key = regularize(c.patch, 0).map((p) => `${p.x},${p.y}`).join('|');
    return !candidates.slice(0, i).some((o) => regularize(o.patch, 0).map((p) => `${p.x},${p.y}`).join('|') === key);
  });

  let bestMeasurement: CandidateResult['bestMeasurement'];
  const viable = distinct.filter((c) => c.warnings.length === 0);
  if (viable.length > 1) {
    const crackRisk = viable.some((c) => Number.isFinite(c.crackClearance) && c.crackClearance < settings.toleranceMm + 1.5);
    const insertRisk = viable.some((c) => Number.isFinite(c.insertClearance) && c.insertClearance < settings.toleranceMm + 1.5);
    const rootSpread = Math.max(...viable.map((c) => c.root.halfWidth)) - Math.min(...viable.map((c) => c.root.halfWidth));
    if (crackRisk) {
      bestMeasurement = {
        title: '补测裂纹尖端边界',
        detail: '在候选补齿最近的裂纹尖端两侧加测两点，可显著判断该方案是否必须退让。',
        gain: settings.toleranceMm / 2,
      };
    } else if (insertRisk) {
      bestMeasurement = {
        title: '复测相邻完整榫齿侧壁',
        detail: '插入路径净距接近误差带；复测完整齿侧壁可区分标准齿与短齿方案。',
        gain: settings.toleranceMm / 2,
      };
    } else if (rootSpread > 1) {
      bestMeasurement = {
        title: '补测缺口根端两个圆角',
        detail: '根端可用宽度决定多套榫齿斜率，当前最有区分力。',
        gain: rootSpread / 2,
      };
    } else {
      bestMeasurement = {
        title: '复测残存肩线深度',
        detail: '各方案材料差异已较小，肩线深度将直接决定肩缝风险。',
        gain: settings.toleranceMm / 2,
      };
    }
  }

  return { candidates: distinct.slice(0, 6), bestMeasurement, diagnostics };
}
