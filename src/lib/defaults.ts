import type { MeasurementSettings, Project } from '../types';
import { uid } from './geometry';

export const defaultSettings: MeasurementSettings = {
  toleranceMm: 0.4,
  sawKerfMm: 0.8,
  maxShoulderGapMm: 0.15,
  maxSideGapMm: 0.2,
  glueLineMm: 0.08,
  grainAxis: 'x',
  accessSide: 'tip',
  slopeRatio: 7,
  dryAllowanceMm: 0.35,
};

export function createProject(): Project {
  const now = Date.now();
  return {
    id: uid('project'),
    name: '旧抽屉燕尾补齿',
    updatedAt: now,
    settings: { ...defaultSettings },
    features: [
      {
        id: uid('board'),
        kind: 'board',
        polygon: [
          { x: 0, y: 14 },
          { x: 20.6, y: 14 },
          { x: 20.6, y: 86 },
          { x: 0, y: 86 },
        ],
      },
      {
        id: uid('joint'),
        kind: 'joint',
        points: [
          { x: 20.6, y: 42 },
          { x: 20.6, y: 60 },
        ],
      },
      {
        id: uid('damage'),
        kind: 'damage',
        polygon: [
          { x: 19.2, y: 42 },
          { x: 34.4, y: 41.4 },
          { x: 35.1, y: 60.7 },
          { x: 18.6, y: 61.3 },
        ],
      },
      {
        id: uid('crack'),
        kind: 'crack',
        polygon: [
          { x: 15.2, y: 61.0 },
          { x: 18.5, y: 61.0 },
          { x: 18.5, y: 64.0 },
          { x: 15.2, y: 63.5 },
        ],
      },
      {
        id: uid('obstacle'),
        kind: 'obstacle',
        polygon: [
          { x: 21.2, y: 62.2 },
          { x: 37.5, y: 62.2 },
          { x: 37.5, y: 72.6 },
          { x: 21.2, y: 72.6 },
        ],
      },
      {
        id: uid('obstacle'),
        kind: 'obstacle',
        polygon: [
          { x: 21.2, y: 29.3 },
          { x: 37.5, y: 29.3 },
          { x: 37.5, y: 39.6 },
          { x: 21.2, y: 39.6 },
        ],
      },
    ],
    selectedCandidateId: null,
    steps: {},
    feedback: [],
  };
}
