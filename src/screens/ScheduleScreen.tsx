import { PageHeader } from '../components/ui/Display';
import { CycleRecommendation } from '../components/CycleRecommendation';

export function ScheduleScreen() {
  return <div className="space-y-6">
    <PageHeader title="Ciclo de Estudos" description="Uma fila contínua que acompanha seu desempenho. Estude no seu ritmo e retome de onde parou." />
    <CycleRecommendation showQueue />
  </div>;
}
