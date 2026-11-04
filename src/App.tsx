import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { AuthScreen } from './screens/AuthScreen';
import { ContestSelectorScreen } from './screens/ContestSelectorScreen';
import { OverviewScreen } from './screens/OverviewScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { ScheduleScreen } from './screens/ScheduleScreen';
import { StudyNowScreen } from './screens/StudyNowScreen';
import { QuestionsScreen } from './screens/QuestionsScreen';
import { ErrorNotebookScreen } from './screens/ErrorNotebookScreen';
import { ReviewsScreen } from './screens/ReviewsScreen';
import { MockExamsScreen } from './screens/MockExamsScreen';
import { DisciplinesScreen } from './screens/DisciplinesScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ensureSeed } from './db/db';
import {
  getAuthSession,
  subscribeAuth,
  TEST_BYPASS_TOKEN,
  type AuthSessionDto,
} from './services/auth';
import { syncActiveContestMetadataFromDb } from './services/contests';
import { LoadingState } from './components/ui/Display';
import { ToastProvider } from './components/ui/Toast';

export function App() {
  const [session, setSession] = useState<AuthSessionDto | null>(() => getAuthSession());
  const [initialized, setInitialized] = useState(false);
  const [showContestSelector, setShowContestSelector] = useState<boolean>(() => {
    const initial = getAuthSession();
    return Boolean(initial && initial.token !== TEST_BYPASS_TOKEN);
  });

  useEffect(() => {
    return subscribeAuth(() => {
      const next = getAuthSession();
      setSession(next);
      if (next && next.token !== TEST_BYPASS_TOKEN) {
        setShowContestSelector(true);
      }
    });
  }, []);

  const activeToken = session?.token ?? null;

  useEffect(() => {
    if (!activeToken) {
      setInitialized(true);
      return;
    }
    setInitialized(false);
    ensureSeed()
      .then(() => {
        syncActiveContestMetadataFromDb();
        setInitialized(true);
      })
      .catch((err) => {
        console.error('Falha ao inicializar os dados do usuário:', err);
        setInitialized(true);
      });
  }, [activeToken]);

  if (!session) {
    return (
      <ToastProvider>
        <AuthScreen
          onAuthenticated={() => {
            setSession(getAuthSession());
            setShowContestSelector(true);
          }}
        />
      </ToastProvider>
    );
  }

  if (!initialized) {
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas text-fg">
        <LoadingState label="Carregando ambiente de estudos do estudaê..." />
      </div>
    );
  }

  if (showContestSelector) {
    return (
      <ToastProvider>
        <ContestSelectorScreen
          onSelectContest={() => {
            setShowContestSelector(false);
          }}
        />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <HashRouter>
        <Routes>
          <Route
            element={
              <AppLayout onSwitchContestScreen={() => setShowContestSelector(true)} />
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
      </HashRouter>
    </ToastProvider>
  );
}

export default App;
