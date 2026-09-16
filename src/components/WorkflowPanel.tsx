import { useState } from 'react';
import type { Candidate, FeedbackRecord, StepState } from '../types';
import { workflowSteps } from '../lib/steps';

interface Props {
  candidate?: Candidate;
  steps: Record<string, StepState>;
  feedback: FeedbackRecord[];
  activeStep: string;
  onActive: (id: string) => void;
  onConfirm: (id: string) => void;
  onRevise: (id: string) => void;
  onUndo: (id: string) => void;
  onFeedback: (feedback: Omit<FeedbackRecord, 'at' | 'geometryHash'>) => void;
  onUndoFeedback: (at: number) => void;
  onPrint: () => void;
}

const feedbackLabels = {
  bottomed: '尖端顶住，未到肩',
  shoulderExposed: '根部露肩',
  shoulderGap: '肩缝过大',
  sideGap: '单侧侧隙过大',
} as const;

export function WorkflowPanel({
  candidate,
  steps,
  feedback,
  activeStep,
  onActive,
  onConfirm,
  onRevise,
  onUndo,
  onFeedback,
  onUndoFeedback,
  onPrint,
}: Props) {
  const [feedbackType, setFeedbackType] = useState<keyof typeof feedbackLabels>('bottomed');
  const [observed, setObserved] = useState(0.2);

  if (!candidate) {
    return <section className="panel workflow-panel"><h2>放样施工</h2><p className="muted">请先选择一套并列候选。</p></section>;
  }

  const submitFeedback = () => {
    onFeedback({ type: feedbackType, observedMm: Number(observed) });
    setObserved(0.2);
  };

  return (
    <section className="panel workflow-panel">
      <div className="section-heading">
        <h2>逐步放样 / 锯切 / 修凿 / 干装</h2>
        <button onClick={onPrint} className="print-button">打印 1:1 样板</button>
      </div>

      <div className="candidate-summary">
        <h3>{candidate.label}</h3>
        <p>{candidate.strategy}</p>
        <div className="blank-dim">
          <b>独立坯料</b><span>{candidate.blank.length.toFixed(1)} × {candidate.blank.width.toFixed(1)} mm</span>
          <small>{candidate.blank.grainLabel}</small>
        </div>
        <ul className="saw-checks">
          {candidate.sawPaths.map((saw) => (
            <li key={saw.id} className={saw.safe ? 'ok' : 'bad'}>
              <span>{saw.label}</span><b>{saw.safe ? '可锯' : '禁锯'}</b>
              <small>{saw.detail}</small>
            </li>
          ))}
        </ul>
      </div>

      <div className="step-list">
        {workflowSteps.map((step, i) => {
          const state = steps[step.id];
          const status = state?.status ?? 'pending';
          const previousDone = i === 0 || steps[workflowSteps[i - 1].id]?.status === 'done';
          return (
            <article key={step.id} className={`step-card ${status} ${activeStep === step.id ? 'active' : ''}`}>
              <header onClick={() => previousDone && onActive(step.id)}>
                <h3>{step.title}</h3>
                <span className="status">{status === 'done' ? '已确认' : status === 'invalid' ? '已失效' : status === 'active' ? '进行中' : '待执行'}</span>
              </header>
              {activeStep === step.id && (
                <div className="step-body">
                  <p>{step.goal}</p>
                  <ul>
                    {step.checks.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                  {state?.invalidReason && <div className="warning">失效原因：{state.invalidReason}</div>}
                  <div className="step-actions">
                    <button disabled={status === 'done'} onClick={() => onConfirm(step.id)}>检查无误，确认</button>
                    {status === 'done' && <button className="ghost" onClick={() => onUndo(step.id)}>撤回误确认</button>}
                    {(status === 'invalid' || status === 'active') && <button className="ghost" onClick={() => onRevise(step.id)}>按新轮廓重做本步</button>}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="feedback-box">
        <h3>干装回报</h3>
        <p className="muted">回报后，已完成的锯切不会被擅自改写；系统会截短齿尖、退让肩线或提示换新坯，并令后续步骤失效。</p>
        <label>
          现象
          <select value={feedbackType} onChange={(e) => setFeedbackType(e.target.value as keyof typeof feedbackLabels)}>
            {Object.entries(feedbackLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="observed">
          顶住/露肩/缝隙量
          <input type="number" step="0.05" min="0" value={observed} onChange={(e) => setObserved(Number(e.target.value))} /> mm
        </label>
        <button onClick={submitFeedback}>回报并重算未完成步骤</button>
        {feedback.length > 0 && (
          <div className="feedback-history">
            <h4>历史回报（可撤回）</h4>
            {feedback.map((f) => (
              <div key={f.at} className="history-row">
                <span>{feedbackLabels[f.type]}：{f.observedMm.toFixed(2)} mm</span>
                <button onClick={() => onUndoFeedback(f.at)}>撤回</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
