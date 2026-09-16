export type Pt = { x: number; y: number };
export type Polygon = Pt[];

export type GrainAxis = 'x' | 'y';
export type AccessSide = 'root' | 'tip' | 'both';
export type ToolKind =
  | 'select'
  | 'board'
  | 'joint'
  | 'damage'
  | 'crack'
  | 'obstacle';

export interface BoardInput {
  id: string;
  kind: 'board';
  /** Repaired board outline, in millimetres, local joint coordinates. */
  polygon: Polygon;
}

export interface ShoulderInput {
  id: string;
  kind: 'joint';
  /** Two surviving shoulder reference points. */
  points: [Pt, Pt];
}

export interface DamageInput {
  id: string;
  kind: 'damage';
  polygon: Polygon;
}

export interface CrackInput {
  id: string;
  kind: 'crack';
  polygon: Polygon;
}

export interface ObstacleInput {
  id: string;
  kind: 'obstacle';
  polygon: Polygon;
}

export type MeasureFeature =
  | BoardInput
  | ShoulderInput
  | DamageInput
  | CrackInput
  | ObstacleInput;

export interface MeasurementSettings {
  toleranceMm: number;
  sawKerfMm: number;
  maxShoulderGapMm: number;
  maxSideGapMm: number;
  glueLineMm: number;
  grainAxis: GrainAxis;
  accessSide: AccessSide;
  slopeRatio: number;
  dryAllowanceMm: number;
}

export interface FeedbackRecord {
  at: number;
  geometryHash: string;
  type: 'bottomed' | 'shoulderExposed' | 'shoulderGap' | 'sideGap';
  observedMm: number;
  note?: string;
}

export type StepStatus = 'pending' | 'active' | 'done' | 'invalid';

export interface StepState {
  status: StepStatus;
  confirmedAt?: number;
  invalidReason?: string;
  hash?: string;
  preserveFeedbackAt?: number;
}

export interface Project {
  id: string;
  name: string;
  updatedAt: number;
  settings: MeasurementSettings;
  features: MeasureFeature[];
  selectedCandidateId: string | null;
  /** Candidate id + geometry hash at confirmation time. */
  steps: Record<string, StepState>;
  feedback: FeedbackRecord[];
}

export interface RoughBlank {
  polygon: Polygon;
  width: number;
  length: number;
  grainLabel: string;
}

export interface SawPath {
  id: string;
  label: string;
  /** Narrow rectangle showing kerf envelope. */
  kerf: Polygon;
  safe: boolean;
  detail: string;
}

export interface Candidate {
  id: string;
  label: string;
  strategy: string;
  patch: Polygon;
  cavity: Polygon;
  dryPatch: Polygon;
  blank: RoughBlank;
  sawPaths: SawPath[];
  pareArea: Polygon;
  root: { x: number; halfWidth: number };
  tip: { x: number; halfWidth: number };
  direction: 'root-wide' | 'tip-wide';
  score: number;
  shoulderGap: number;
  sideGap: number;
  crackClearance: number;
  insertClearance: number;
  warnings: string[];
  metrics: { label: string; value: string; acceptable: boolean }[];
  hash: string;
}

export interface CandidateResult {
  candidates: Candidate[];
  bestMeasurement?: {
    title: string;
    detail: string;
    gain: number;
  };
  diagnostics: string[];
}
