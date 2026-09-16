import type { Candidate, MeasureFeature } from '../types';
import { bounds } from '../lib/geometry';

interface Props {
  candidate: Candidate;
  features: MeasureFeature[];
  projectName: string;
}

const path = (points: { x: number; y: number }[]) =>
  points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';

export function PrintTemplate({ candidate, features, projectName }: Props) {
  const all = features.flatMap((f) => (f.kind === 'joint' ? f.points : f.polygon)).concat(candidate.patch, candidate.dryPatch);
  const b = bounds(all);
  const margin = 10;
  const w = b.maxX - b.minX + margin * 2;
  const h = b.maxY - b.minY + margin * 2;
  const x0 = b.minX - margin;
  const y0 = b.minY - margin;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = Math.ceil(x0 / 10) * 10; x <= x0 + w; x += 10) xs.push(x);
  for (let y = Math.ceil(y0 / 10) * 10; y <= y0 + h; y += 10) ys.push(y);

  return (
    <div className="print-root" aria-hidden="true">
      <div className="print-header">
        <h1>{projectName} — 燕尾补齿 1:1 样板</h1>
        <p>打印比例必须选择 100% / 实际大小，关闭“适应页面”；用下方 50 mm 标尺校准后再贴样。</p>
      </div>
      <svg
        className="print-svg"
        width={`${w}mm`}
        height={`${h}mm`}
        viewBox={`${x0} ${y0} ${w} ${h}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x={x0} y={y0} width={w} height={h} fill="white" />
        {xs.map((x) => <line key={`x${x}`} x1={x} y1={y0} x2={x} y2={y0 + h} stroke="#ddd" strokeWidth=".15" />)}
        {ys.map((y) => <line key={`y${y}`} x1={x0} y1={y} x2={x0 + w} y2={y} stroke="#ddd" strokeWidth=".15" />)}
        {features.map((f) => {
          if (f.kind === 'joint') return <line key={f.id} x1={f.points[0].x} y1={f.points[0].y} x2={f.points[1].x} y2={f.points[1].y} stroke="#111" strokeWidth=".35" strokeDasharray="1 .8" />;
          const color = f.kind === 'damage' ? '#c8422b' : f.kind === 'crack' ? '#4d3324' : f.kind === 'obstacle' ? '#245aa8' : '#8a552e';
          return <path key={f.id} d={path(f.polygon)} fill="none" stroke={color} strokeWidth=".35" strokeDasharray="1.5 1" />;
        })}
        <path d={path(candidate.dryPatch)} fill="none" stroke="#1a8f65" strokeWidth=".45" strokeDasharray="2 1" />
        <path d={path(candidate.patch)} fill="none" stroke="#0a6b4a" strokeWidth=".8" />
        <text x={x0 + 2} y={y0 + 5} fontSize="3" fill="#222">实线：最终补齿　绿虚线：干装放大轮廓　红虚线：确定损伤内缩边界</text>
      </svg>
      <div className="print-ruler">
        <svg width="50mm" height="8mm" viewBox="0 0 50 8">
          <line x1="0" y1="2" x2="50" y2="2" stroke="#000" strokeWidth=".25" />
          {Array.from({ length: 51 }, (_, i) => (
            <line key={i} x1={i} y1="2" x2={i} y2={i % 10 === 0 ? 6 : i % 5 === 0 ? 4.5 : 3.5} stroke="#000" strokeWidth=".2" />
          ))}
          <text x="0" y="7.8" fontSize="2.5">0</text>
          <text x="46" y="7.8" fontSize="2.5">50 mm</text>
        </svg>
      </div>
      <dl className="print-metrics">
        <div><dt>方案</dt><dd>{candidate.label}（{candidate.strategy}）</dd></div>
        <div><dt>干装肩缝</dt><dd>≤ {candidate.shoulderGap.toFixed(2)} mm</dd></div>
        <div><dt>最不利侧隙</dt><dd>≤ {candidate.sideGap.toFixed(2)} mm</dd></div>
        <div><dt>坯料</dt><dd>{candidate.blank.length.toFixed(1)} × {candidate.blank.width.toFixed(1)} mm，{candidate.blank.grainLabel}</dd></div>
      </dl>
    </div>
  );
}
