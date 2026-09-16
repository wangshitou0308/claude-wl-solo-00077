import type { Candidate, CandidateResult } from '../types';

interface Props {
  result: CandidateResult;
  selectedId: string | null;
  onSelect: (candidate: Candidate) => void;
}

export function CandidateList({ result, selectedId, onSelect }: Props) {
  return (
    <section className="panel candidate-panel">
      <div className="section-heading">
        <h2>并列可行解</h2>
        <span>{result.candidates.length} 套通过最不利边界</span>
      </div>

      {result.diagnostics.length > 0 && (
        <div className="diagnostics">
          {result.diagnostics.map((d) => <p key={d}>⚠ {d}</p>)}
        </div>
      )}

      {result.bestMeasurement && (
        <div className="next-measure">
          <strong>下一处最有区分力测量：{result.bestMeasurement.title}</strong>
          <p>{result.bestMeasurement.detail}</p>
        </div>
      )}

      <div className="candidate-grid">
        {result.candidates.map((c, i) => (
          <button
            key={c.id}
            className={`candidate-card ${selectedId === c.id ? 'selected' : ''} ${i === 0 ? 'recommended' : ''}`}
            onClick={() => onSelect(c)}
          >
            <div className="rank">{i === 0 ? '推荐' : `#${i + 1}`}</div>
            <h3>{c.label}</h3>
            <p>{c.strategy}</p>
            <ul>
              {c.metrics.slice(0, 4).map((m) => (
                <li key={m.label} className={m.acceptable ? 'ok' : 'bad'}>
                  <span>{m.label}</span><b>{m.value}</b>
                </li>
              ))}
            </ul>
            {c.warnings.length > 0 && <div className="card-warnings">{c.warnings[0]}</div>}
          </button>
        ))}
        {result.candidates.length === 0 && (
          <div className="empty-state">
            当前误差带内无完整补齿方案。请补测边界、减小测量误差，或确认损伤是否已扩展到必须重建整段榫列（本工具不提供重切完整榫齿）。
          </div>
        )}
      </div>
    </section>
  );
}
