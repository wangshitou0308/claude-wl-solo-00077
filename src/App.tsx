import { useEffect, useMemo, useState } from 'react';
import type { Candidate, FeedbackRecord, MeasureFeature, Project, StepState, ToolKind } from './types';
import { calculateCandidates } from './lib/engine';
import { createProject } from './lib/defaults';
import { loadProject, saveProject } from './lib/db';
import { MeasurementEditor } from './components/MeasurementEditor';
import { SettingsPanel } from './components/SettingsPanel';
import { CandidateList } from './components/CandidateList';
import { WorkflowPanel } from './components/WorkflowPanel';
import { PrintTemplate } from './components/PrintTemplate';
import { workflowSteps } from './lib/steps';

const PROJECT_KEY = 'dovetail-bench-project-id';

function reconcileSteps(project: Project, selectedHash?: string, preserveReasons = false): Record<string, StepState> {
  const next: Record<string, StepState> = {};
  let invalidateRest = false;
  for (const step of workflowSteps) {
    const old = project.steps[step.id];
    if (invalidateRest && old?.status === 'done') {
      next[step.id] = {
        status: 'invalid',
        confirmedAt: old.confirmedAt,
        invalidReason: preserveReasons
          ? old.invalidReason ?? '测量或选定轮廓已变化，相关步骤失效。'
          : '测量或选定轮廓已变化，相关步骤失效。',
      };
      continue;
    }
    const canPreserveRoughSaw =
      step.id === 'rough-saw' &&
      project.feedback.at(-1)?.type === 'bottomed' &&
      old.preserveFeedbackAt === project.feedback.at(-1)?.at;
    if (old?.status === 'done' && selectedHash && old.hash !== selectedHash && !canPreserveRoughSaw) {
      next[step.id] = {
        status: 'invalid',
        confirmedAt: old.confirmedAt,
        invalidReason: '尺寸变化后该步对应的旧轮廓不再匹配。',
      };
      if (step.id === 'layout') invalidateRest = true;
    } else {
      next[step.id] = old ? { ...old } : { status: step.id === 'layout' ? 'active' : 'pending' };
    }
  }
  return next;
}

export default function App() {
  const [project, setProject] = useState<Project>(() => createProject());
  const [tool, setTool] = useState<ToolKind>('select');
  const [selectedMeasureId, setSelectedMeasureId] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState('layout');
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState('未连接 IndexedDB');

  useEffect(() => {
    const id = localStorage.getItem(PROJECT_KEY);
    if (!id) {
      setLoaded(true);
      return;
    }
    loadProject(id)
      .then((p) => {
        if (p) setProject(p);
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      saveProject(project)
        .then(() => {
          localStorage.setItem(PROJECT_KEY, project.id);
          setSaveState(`已保存 ${new Date().toLocaleTimeString()}`);
        })
        .catch(() => setSaveState('IndexedDB 保存失败'));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [project, loaded]);

  const result = useMemo(
    () => calculateCandidates(project.features, project.settings, project.feedback),
    [project.features, project.settings, project.feedback],
  );

  const selectedCandidate = result.candidates.find((c) => c.id === project.selectedCandidateId);

  const steps = useMemo(
    () => reconcileSteps(project, selectedCandidate?.hash),
    [project, selectedCandidate?.hash],
  );

  const updateProject = (patch: Partial<Project>) =>
    setProject((p) => ({ ...p, ...patch, updatedAt: Date.now() }));

  const updateFeature = (feature: MeasureFeature) =>
    updateProject({ features: project.features.map((f) => (f.id === feature.id ? feature : f)) });

  const addFeature = (feature: MeasureFeature) =>
    updateProject({ features: [...project.features, feature] });

  const deleteFeature = (id: string) =>
    updateProject({ features: project.features.filter((f) => f.id !== id) });

  const selectCandidate = (candidate: Candidate) => {
    updateProject({ selectedCandidateId: candidate.id });
    setActiveStep('layout');
  };

  const confirmStep = (id: string) => {
    const hash = selectedCandidate?.hash;
    const updated: Record<string, StepState> = {
      ...steps,
      [id]: { status: 'done', confirmedAt: Date.now(), hash },
    };
    const idx = workflowSteps.findIndex((s) => s.id === id);
    const nextStep = workflowSteps[idx + 1];
    if (nextStep) updated[nextStep.id] = { status: 'active', hash };
    updateProject({ steps: updated });
    if (nextStep) setActiveStep(nextStep.id);
  };

  const reviseStep = (id: string) => {
    updateProject({ steps: { ...steps, [id]: { status: 'active', hash: selectedCandidate?.hash } } });
    setActiveStep(id);
  };

  const undoStep = (id: string) => {
    const idx = workflowSteps.findIndex((s) => s.id === id);
    const updated: Record<string, StepState> = { ...steps, [id]: { status: 'active', hash: selectedCandidate?.hash } };
    workflowSteps.slice(idx + 1).forEach((s) => {
      updated[s.id] = { status: 'pending' };
    });
    updateProject({ steps: updated });
    setActiveStep(id);
  };

  const addFeedback = (feedback: Omit<FeedbackRecord, 'at' | 'geometryHash'>) => {
    const hash = selectedCandidate?.hash ?? '';
    const record: FeedbackRecord = { ...feedback, at: Date.now(), geometryHash: hash };
    const reason =
      feedback.type === 'bottomed'
        ? '尖端顶住：齿尖将截短；若坯料不足则需换新坯。'
        : feedback.type === 'sideGap'
          ? '侧隙超限：补齿需加宽厚或贴薄木片；旧锯切尺寸可能不足。'
          : '肩线未贴合：根部长度重算，放样与后续步骤失效。';
    const current: Record<string, StepState> = { ...steps };
    workflowSteps.forEach((step) => {
      const retainRoughSaw = step.id === 'rough-saw' && feedback.type === 'bottomed';
      if (current[step.id]?.status === 'done' && retainRoughSaw) {
        current[step.id] = { ...current[step.id], preserveFeedbackAt: record.at };
        return;
      }
      if (current[step.id]?.status === 'done' && !retainRoughSaw) {
        current[step.id] = { status: 'invalid', invalidReason: reason };
      }
    });
    current['dry-fit'] = { status: 'active', hash };
    updateProject({ feedback: [...project.feedback, record], steps: current });
    setActiveStep('dry-fit');
  };

  const undoFeedback = (at: number) => {
    const updated: Record<string, StepState> = { ...steps };
    Object.keys(updated).forEach((id) => {
      if (updated[id].preserveFeedbackAt === at) {
        updated[id] = { status: 'invalid', invalidReason: '试装回报已撤回，旧锯切需要重新核对。' };
      }
    });
    updateProject({ feedback: project.feedback.filter((f) => f.at !== at), steps: updated });
  };

  const resetProject = () => {
    if (!window.confirm('将清空当前测量并恢复示例。此操作只影响本机浏览器数据。')) return;
    const fresh = createProject();
    setProject(fresh);
    setTool('select');
    setSelectedMeasureId(null);
    setActiveStep('layout');
  };

  const printTemplate = () => window.print();

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">只补缺失燕尾 · 不重切完整榫齿</p>
          <h1>燕尾补齿放样与试装台</h1>
          <p className="subtitle">毫米 SVG 描测 · 误差最不利边界 · IndexedDB 本机保存 · 1:1 打印</p>
        </div>
        <div className="header-actions">
          <input value={project.name} onChange={(e) => updateProject({ name: e.target.value })} aria-label="工件名称" />
          <button className="ghost" onClick={resetProject}>重置示例</button>
          <span className="save-state">{saveState}</span>
        </div>
      </header>

      <div className="workspace">
        <div className="left-column">
          <SettingsPanel settings={project.settings} onChange={(settings) => updateProject({ settings })} />
        </div>
        <div className="center-column">
          <MeasurementEditor
            features={project.features}
            tool={tool}
            selectedId={selectedMeasureId}
            candidate={selectedCandidate}
            stepHighlight={activeStep}
            grainAxis={project.settings.grainAxis}
            onToolChange={setTool}
            onCommit={addFeature}
            onUpdate={updateFeature}
            onDelete={deleteFeature}
            onSelect={setSelectedMeasureId}
          />
          <CandidateList result={result} selectedId={selectedCandidate?.id ?? null} onSelect={selectCandidate} />
        </div>
        <div className="right-column">
          <WorkflowPanel
            candidate={selectedCandidate}
            steps={steps}
            feedback={project.feedback}
            activeStep={activeStep}
            onActive={setActiveStep}
            onConfirm={confirmStep}
            onRevise={reviseStep}
            onUndo={undoStep}
            onFeedback={addFeedback}
            onUndoFeedback={undoFeedback}
            onPrint={printTemplate}
          />
        </div>
      </div>

      {selectedCandidate && <PrintTemplate candidate={selectedCandidate} features={project.features} projectName={project.name} />}
    </main>
  );
}
