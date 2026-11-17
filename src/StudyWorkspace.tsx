import { Suspense, lazy, type ComponentType } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { LoadingState } from './components/ui/Display';

function lazyScreen<TModule extends Record<string, unknown>>(
  loader: () => Promise<TModule>,
  exportName: keyof TModule
) {
  return lazy(async () => {
    const mod = await loader();
    return { default: mod[exportName] as ComponentType };
  });
}

const OverviewScreen = lazyScreen(() => import('./screens/OverviewScreen'), 'OverviewScreen');
const CalendarScreen = lazyScreen(() => import('./screens/CalendarScreen'), 'CalendarScreen');
const ScheduleScreen = lazyScreen(() => import('./screens/ScheduleScreen'), 'ScheduleScreen');
const StudyNowScreen = lazyScreen(() => import('./screens/StudyNowScreen'), 'StudyNowScreen');
const QuestionsScreen = lazyScreen(() => import('./screens/QuestionsScreen'), 'QuestionsScreen');
const ErrorNotebookScreen = lazyScreen(
  () => import('./screens/ErrorNotebookScreen'),
  'ErrorNotebookScreen'
);
const ReviewsScreen = lazyScreen(() => import('./screens/ReviewsScreen'), 'ReviewsScreen');
const MockExamsScreen = lazyScreen(() => import('./screens/MockExamsScreen'), 'MockExamsScreen');
const DisciplinesScreen = lazyScreen(
  () => import('./screens/DisciplinesScreen'),
  'DisciplinesScreen'
);
const ReportsScreen = lazyScreen(() => import('./screens/ReportsScreen'), 'ReportsScreen');
const SettingsScreen = lazyScreen(() => import('./screens/SettingsScreen'), 'SettingsScreen');

export function StudyWorkspace({ onSwitchContestScreen }: { onSwitchContestScreen: () => void }) {
  return (
    <HashRouter>
      <Suspense fallback={<LoadingState label="Carregando tela..." />}>
        <Routes>
          <Route
            element={
              <AppLayout onSwitchContestScreen={onSwitchContestScreen} />
            }
          >
            <Route path="/" element={<OverviewScreen />} />
            <Route path="/calendario" element={<CalendarScreen />} />
            <Route path="/cronograma" element={<ScheduleScreen />} />
            <Route path="/estudar-agora" element={<StudyNowScreen />} />
            <Route path="/questoes" element={<QuestionsScreen />} />
            <Route path="/erros" element={<ErrorNotebookScreen />} />
            <Route path="/revisoes" element={<ReviewsScreen />} />
            <Route path="/simulados" element={<MockExamsScreen />} />
            <Route path="/disciplinas" element={<DisciplinesScreen />} />
            <Route path="/relatorios" element={<ReportsScreen />} />
            <Route path="/configuracoes" element={<SettingsScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
