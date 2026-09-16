import { useMemo, useRef, useState } from 'react';
import type { Candidate, MeasureFeature, Polygon, Pt, ToolKind } from '../types';
import { bounds, centroid, uid } from '../lib/geometry';

interface Props {
  features: MeasureFeature[];
  tool: ToolKind;
  selectedId: string | null;
  candidate?: Candidate;
  stepHighlight?: string;
  grainAxis: 'x' | 'y';
  onToolChange: (tool: ToolKind) => void;
  onCommit: (feature: MeasureFeature) => void;
  onUpdate: (feature: MeasureFeature) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string | null) => void;
}

const styles: Record<string, { fill: string; stroke: string; label: string }> = {
  board: { fill: 'rgba(167, 116, 70, .16)', stroke: '#8a552e', label: '原板' },
  damage: { fill: 'rgba(220, 80, 50, .15)', stroke: '#d4452f', label: '缺口' },
  crack: { fill: 'rgba(88, 64, 45, .22)', stroke: '#4d3324', label: '裂纹禁切' },
  obstacle: { fill: 'rgba(40, 92, 170, .13)', stroke: '#245aa8', label: '完整榫齿' },
};

const polygonTools: ToolKind[] = ['board', 'damage', 'crack', 'obstacle'];

const pathFor = (poly: Polygon) => poly.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';

function eventToSvg(event: React.MouseEvent<SVGSVGElement>, svg: SVGSVGElement): Pt {
  const point = new DOMPoint(event.clientX, event.clientY);
  const ctm = svg.getScreenCTM();
  const transformed = ctm ? point.matrixTransform(ctm.inverse()) : { x: 0, y: 0 };
  return { x: transformed.x, y: transformed.y };
}

export function MeasurementEditor({
  features,
  tool,
  selectedId,
  candidate,
  stepHighlight,
  grainAxis,
  onToolChange,
  onCommit,
  onUpdate,
  onDelete,
  onSelect,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [jointDraft, setJointDraft] = useState<Pt[]>([]);
  const [drag, setDrag] = useState<{ id: string; index: number } | null>(null);

  const view = useMemo(() => {
    const all = features.flatMap((f) => (f.kind === 'joint' ? f.points : f.polygon));
    if (candidate) all.push(...candidate.patch, ...candidate.blank.polygon);
    const b = all.length
      ? bounds(all)
      : { minX: 0, maxX: 80, minY: 0, maxY: 100 };
    const margin = 12;
    const minX = Math.floor(b.minX - margin / 2);
    const maxX = Math.ceil(b.maxX + margin);
    const minY = Math.floor(b.minY - margin);
    const maxY = Math.ceil(b.maxY + margin);
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }, [features, candidate]);

  const ticks = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let x = Math.ceil(view.minX / 5) * 5; x <= view.minX + view.width; x += 5) xs.push(x);
    for (let y = Math.ceil(view.minY / 5) * 5; y <= view.minY + view.height; y += 5) ys.push(y);
    return { xs, ys };
  }, [view]);

  const finishPolygon = (points: Pt[]) => {
    if (!polygonTools.includes(tool) || points.length < 3) {
      setDraft([]);
      return;
    }
    onCommit({ id: uid(tool), kind: tool as MeasureFeature['kind'], polygon: points } as MeasureFeature);
    setDraft([]);
    onToolChange('select');
  };

  const svgPoint = (event: React.MouseEvent<SVGSVGElement>) =>
    svgRef.current ? eventToSvg(event, svgRef.current) : { x: 0, y: 0 };

  const handleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest('[data-handle]')) return;
    const p = svgPoint(event);
    if (polygonTools.includes(tool)) {
      setDraft((d) => [...d, p]);
      onSelect(null);
    } else if (tool === 'joint') {
      const next = [...jointDraft, p];
      if (next.length === 2) {
        onCommit({ id: uid('joint'), kind: 'joint', points: next as [Pt, Pt] });
        setJointDraft([]);
        onToolChange('select');
      } else setJointDraft(next);
    } else {
      onSelect(null);
    }
  };

  const updatePoint = (id: string, index: number, p: Pt) => {
    const f = features.find((x) => x.id === id);
    if (!f) return;
    if (f.kind === 'joint') {
      const points = f.points.map((q, i) => (i === index ? p : q)) as [Pt, Pt];
      onUpdate({ ...f, points });
    } else {
      onUpdate({ ...f, polygon: f.polygon.map((q, i) => (i === index ? p : q)) });
    }
  };

  const beginDrag = (id: string, index: number) => (event: React.MouseEvent) => {
    event.stopPropagation();
    onSelect(id);
    setDrag({ id, index });
  };

  const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!drag) return;
    updatePoint(drag.id, drag.index, svgPoint(event));
  };

  const selected = features.find((f) => f.id === selectedId);

  return (
    <div className="editor-shell">
      <div className="tool-row">
        {([
          ['select', '选择/拖点'],
          ['board', '板厚轮廓'],
          ['joint', '残存榫肩'],
          ['damage', '缺口'],
          ['crack', '裂纹禁切区'],
          ['obstacle', '完整榫齿'],
        ] as [ToolKind, string][]).map(([key, label]) => (
          <button key={key} className={tool === key ? 'active' : ''} onClick={() => { onToolChange(key); setDraft([]); setJointDraft([]); }}>
            {label}
          </button>
        ))}
        {draft.length > 1 && <button onClick={() => finishPolygon(draft.slice(0, -1))}>闭合多边形</button>}
        {draft.length > 0 && <button onClick={() => setDraft(draft.slice(0, -1))}>撤销一点</button>}
      </div>
      <div className="svg-wrap">
        <svg
          ref={svgRef}
          className={`measure-svg tool-${tool}`}
          viewBox={`${view.minX} ${view.minY} ${view.width} ${view.height}`}
          onClick={handleClick}
          onMouseMove={handleMove}
          onMouseUp={() => setDrag(null)}
          onMouseLeave={() => setDrag(null)}
          onDoubleClick={() => draft.length && finishPolygon(draft.slice(0, -1))}
        >
          <defs>
            <pattern id="mmGrid" width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(90,70,50,.16)" strokeWidth=".25" />
            </pattern>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#6a4224" />
            </marker>
          </defs>
          <rect x={view.minX} y={view.minY} width={view.width} height={view.height} fill="#fbf8f1" />
          <rect x={view.minX} y={view.minY} width={view.width} height={view.height} fill="url(#mmGrid)" />
          {ticks.xs.map((x) => (
            <g key={`x${x}`}>
              <line x1={x} y1={view.minY} x2={x} y2={view.minY + view.height} stroke={x % 10 === 0 ? 'rgba(90,70,50,.28)' : 'rgba(90,70,50,.16)'} strokeWidth=".25" />
              {x % 10 === 0 && <text x={x + .6} y={view.minY + 4} className="tick-label">{x}</text>}
            </g>
          ))}
          {ticks.ys.map((y) => (
            <g key={`y${y}`}>
              <line x1={view.minX} y1={y} x2={view.minX + view.width} y2={y} stroke={y % 10 === 0 ? 'rgba(90,70,50,.28)' : 'rgba(90,70,50,.16)'} strokeWidth=".25" />
              {y % 10 === 0 && <text x={view.minX + 1} y={y - .6} className="tick-label">{y}</text>}
            </g>
          ))}
          <text x={view.minX + 2} y={view.minY + view.height - 2} className="axis-label">单位 mm；细线 5 mm，数字线 10 mm</text>

          {features.map((f) => {
            if (f.kind === 'joint') {
              const active = selectedId === f.id;
              return (
                <g key={f.id} className={active ? 'feature-selected' : ''}>
                  <line x1={f.points[0].x} y1={f.points[0].y} x2={f.points[1].x} y2={f.points[1].y} stroke="#111" strokeWidth={active ? 1.2 : .7} strokeDasharray="2 1.2" />
                  {f.points.map((p, i) => (
                    <circle key={i} data-handle cx={p.x} cy={p.y} r={1.3} fill="#111" onMouseDown={beginDrag(f.id, i)} />
                  ))}
                  <text x={f.points[0].x + 1.2} y={(f.points[0].y + f.points[1].y) / 2} className="shape-label">残存肩线</text>
                </g>
              );
            }
            const st = styles[f.kind];
            const active = selectedId === f.id;
            return (
              <g key={f.id} className={active ? 'feature-selected' : ''}>
                <path d={pathFor(f.polygon)} fill={st.fill} stroke={st.stroke} strokeWidth={active ? 1 : .55} strokeDasharray={f.kind === 'damage' ? 'none' : '2 1'} />
                {f.kind === 'board' && (
                  <g>
                    <line
                      x1={grainAxis === 'x' ? 3 : 20}
                      y1={grainAxis === 'x' ? 20 : 3}
                      x2={grainAxis === 'x' ? 16 : 20}
                      y2={grainAxis === 'x' ? 20 : 16}
                      stroke="#6a4224"
                      strokeWidth=".6"
                      markerEnd="url(#arrow)"
                    />
                    <text x={grainAxis === 'x' ? 4 : 22} y={grainAxis === 'x' ? 18.4 : 7} className="grain-label">木纹</text>
                  </g>
                )}
                <text {...centroid(f.polygon)} className="shape-label" textAnchor="middle">{st.label}</text>
                {active && f.polygon.map((p, i) => (
                  <circle key={i} data-handle cx={p.x} cy={p.y} r={1.4} fill="#fff" stroke={st.stroke} strokeWidth=".6" onMouseDown={beginDrag(f.id, i)} />
                ))}
              </g>
            );
          })}

          {draft.length > 0 && (
            <g className="draft">
              <path d={`${draft.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')} ${draft.length > 1 ? 'Z' : ''}`} fill="rgba(30,120,80,.10)" stroke="#16704d" strokeDasharray="1.5 1" />
              {draft.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={1.1} fill="#16704d" />)}
            </g>
          )}
          {jointDraft.length > 0 && jointDraft.map((p) => <circle key={`${p.x}-${p.y}`} cx={p.x} cy={p.y} r={1.2} fill="#111" />)}

          {candidate && (
            <g className={`candidate candidate-${stepHighlight}`}>
              {stepHighlight === 'rough-saw' && (
                <path d={pathFor(candidate.blank.polygon)} fill="rgba(160,100,30,.10)" stroke="#9b6220" strokeWidth=".7" strokeDasharray="2.5 1.5" />
              )}
              {stepHighlight === 'pare' && (
                <path d={pathFor(candidate.pareArea)} fill="rgba(20,120,90,.12)" stroke="#14734f" strokeWidth=".7" strokeDasharray="1.5 1" />
              )}
              {candidate.sawPaths.map((saw) => (
                <path
                  key={saw.id}
                  d={pathFor(saw.kerf)}
                  className={stepHighlight === 'rough-saw' ? 'saw-on' : 'saw-off'}
                  fill={saw.safe ? 'rgba(180,90,20,.22)' : 'rgba(200,0,0,.20)'}
                  stroke={saw.safe ? '#9d4c18' : '#c00'}
                  strokeWidth=".35"
                />
              ))}
              <path d={pathFor(candidate.dryPatch)} fill="none" stroke="#1a8f65" strokeWidth=".55" strokeDasharray="2 1" />
              <path d={pathFor(candidate.patch)} fill="rgba(26,143,101,.25)" stroke="#0c6d4c" strokeWidth=".9" />
              <text x={candidate.root.x + 1} y={centroid(candidate.patch).y} className="candidate-label">补齿</text>
            </g>
          )}
        </svg>
      </div>
      <p className="editor-help">
        {tool === 'select'
          ? '单击图形后拖白色顶点；测量尺寸以 SVG 毫米坐标为准。'
          : tool === 'joint'
            ? '依次单击残存榫肩的两个参照点。'
            : '逐点单击描图，至少 3 点后双击或按“闭合多边形”。错误可用“撤销一点”。'}
        {selected && (
          <>
            {' '}当前：{styles[selected.kind]?.label ?? '榫肩'}（{selected.id.slice(-5)}）
            <button className="danger-inline" onClick={() => { onDelete(selected.id); onSelect(null); }}>删除该项</button>
          </>
        )}
      </p>
    </div>
  );
}
