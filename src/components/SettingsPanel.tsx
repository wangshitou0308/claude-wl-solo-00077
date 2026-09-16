import type { MeasurementSettings } from '../types';

interface Props {
  settings: MeasurementSettings;
  onChange: (settings: MeasurementSettings) => void;
}

const numberFields: Array<[keyof MeasurementSettings, string, string, number, number, number]> = [
  ['toleranceMm', '测量误差 ±', 'mm', 0.05, 3, 0.05],
  ['sawKerfMm', '锯路宽', 'mm', 0.3, 3, 0.05],
  ['maxShoulderGapMm', '允许肩缝', 'mm', 0, 0.8, 0.01],
  ['maxSideGapMm', '允许侧隙', 'mm', 0, 1, 0.01],
  ['glueLineMm', '目标胶缝', 'mm', 0, 0.4, 0.01],
  ['slopeRatio', '燕尾斜度 1:', '（常用 6–8）', 5, 10, 1],
  ['dryAllowanceMm', '干装预留', 'mm', 0, 1, 0.05],
];

export function SettingsPanel({ settings, onChange }: Props) {
  const set = <K extends keyof MeasurementSettings>(key: K, value: MeasurementSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <aside className="panel settings-panel">
      <h2>现场条件</h2>
      <div className="field-group">
        <label>木纹方向（必须决定补齿顺纹）</label>
        <div className="segmented">
          <button className={settings.grainAxis === 'x' ? 'active' : ''} onClick={() => set('grainAxis', 'x')}>横向 →</button>
          <button className={settings.grainAxis === 'y' ? 'active' : ''} onClick={() => set('grainAxis', 'y')}>纵向 ↓</button>
        </div>
      </div>
      <div className="field-group">
        <label>凿刀可达侧</label>
        <select value={settings.accessSide} onChange={(e) => set('accessSide', e.target.value as MeasurementSettings['accessSide'])}>
          <option value="tip">齿尖侧</option>
          <option value="root">齿根/肩侧</option>
          <option value="both">两侧均可</option>
        </select>
      </div>
      {numberFields.map(([key, label, suffix, min, max, step]) => (
        <label className="number-row" key={key}>
          <span>{label}</span>
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={settings[key] as number}
            onChange={(e) => set(key, Number(e.target.value) as never)}
          />
          <em>{suffix}</em>
        </label>
      ))}
      <div className="rule-note">
        <strong>最不利边界：</strong>缺口内缩一个测量误差；裂纹与完整齿外扩误差及胶缝。只有所有边界同时成立的补齿才列为可行。
      </div>
    </aside>
  );
}
