import { PageHeader } from '../components/ui/Display';
import { CycleRecommendation } from '../components/CycleRecommendation';

export function ScheduleScreen() {
  return <div className="space-y-6">
    <PageHeader title="Ciclo de Estudos" description="Seu próximo passo, na ordem certa. Estude no seu ritmo e continue de onde parou." />
    <CycleRecommendation showQueue />
  </div>;
}
