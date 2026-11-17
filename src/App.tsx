import { Suspense, lazy, useEffect, useState } from 'react';
import { AuthScreen } from './screens/AuthScreen';
import { ContestSelectorScreen } from './screens/ContestSelectorScreen';
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

const StudyWorkspace = lazy(() =>
  import('./StudyWorkspace').then((mod) => ({ default: mod.StudyWorkspace }))
);

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

  if (showContestSelector) {
    return (
      <ToastProvider>
        <ContestSelectorScreen
          initializing={!initialized}
          onSelectContest={() => setShowContestSelector(false)}
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

  return (
    <ToastProvider>
      <Suspense fallback={<LoadingState label="Carregando painel de estudos..." />}>
        <StudyWorkspace onSwitchContestScreen={() => setShowContestSelector(true)} />
      </Suspense>
    </ToastProvider>
  );
}

export default App;
