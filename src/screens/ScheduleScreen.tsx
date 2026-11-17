import { PageHeader } from '../components/ui/Display';
import { CycleRecommendation } from '../components/CycleRecommendation';

export function ScheduleScreen() {
  return <div className="page-stack">
    <PageHeader title="Ciclo de estudos" description="Seu próximo passo, na ordem certa. Estude no seu ritmo e continue de onde parou." />
    <CycleRecommendation showQueue />
  </div>;
}
