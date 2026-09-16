export interface WorkflowStep {
  id: 'layout' | 'rough-saw' | 'pare' | 'dry-fit';
  title: string;
  goal: string;
  checks: string[];
}

export const workflowSteps: WorkflowStep[] = [
  {
    id: 'layout',
    title: '1. 保守放样',
    goal: '按最不利内缩边界标定补齿，不把任何线放到裂纹或完整榫齿上。',
    checks: ['木纹线与原板同向', '肩线、尖端和斜度均已复核', '禁切区与完整齿净距满足胶缝'],
  },
  {
    id: 'rough-saw',
    title: '2. 留量锯切',
    goal: '独立坯料顺纹下锯；旧件 relief 锯口只进入已确认损伤区，全部保留修凿量。',
    checks: ['锯路宽度已计入', '坯料木纹方向正确', '旧件锯口未越过损伤内缩线'],
  },
  {
    id: 'pare',
    title: '3. 修凿到位',
    goal: '只从可达侧逐层修凿高亮区域，反复试配，不得一次凿到线。',
    checks: ['凿削方向背离裂纹', '各侧壁保留干装余量', '根部圆角未越过残存肩'],
  },
  {
    id: 'dry-fit',
    title: '4. 干装检验',
    goal: '沿木纹直线插入至肩，记录顶住、露肩、肩缝或侧隙；系统重算后续。',
    checks: ['插入时无完整齿碰撞', '肩缝不超限', '两侧隙不超限', '可无锤击退出'],
  },
];
