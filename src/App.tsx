import { Suspense, lazy, useEffect, useState } from 'react';
import { AuthScreen } from './screens/AuthScreen';
import { ContestSelectorScreen } from './screens/ContestSelectorScreen';
import { db, ensureSeed } from './db/db';
import {
  getAuthSession,
  getLocalSessionId,
  getActiveContestScopeId,
  setActiveContestScopeId,
  subscribeAuth,
  restoreCurrentSession,
  verifyCurrentSession,
  TEST_LOCAL_SESSION_ID,
  type AuthSessionDto,
} from './services/auth';
import { getUserContests, refreshUserContests, syncActiveContestMetadataFromDb } from './services/contests';
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
    return Boolean(initial && initial.sessionId !== TEST_LOCAL_SESSION_ID);
  });

  useEffect(() => {
    let previousSessionId = getAuthSession()?.sessionId;
    const unsubscribe = subscribeAuth(() => {
      const next = getAuthSession();
      if (previousSessionId !== next?.sessionId) {
        previousSessionId = next?.sessionId;
        db.clearMemory();
        setShowContestSelector(Boolean(next && next.sessionId !== TEST_LOCAL_SESSION_ID));
      }
      setSession(next);
    });
    void restoreCurrentSession();
    return unsubscribe;
  }, []);

  const activeSessionId = session?.sessionId ?? null;

  useEffect(() => {
    if (!activeSessionId) {
      setInitialized(true);
      return;
    }
    setInitialized(false);
    let cancelled = false;
    const load = async () => {
      if (getAuthSession()?.legacyToken) await verifyCurrentSession();
      if (cancelled || getLocalSessionId() !== activeSessionId) return;
      try {
        await refreshUserContests();
      } catch (err) {
        console.error('Falha ao carregar concursos da conta:', err);
      }
      if (cancelled || getLocalSessionId() !== activeSessionId) return;
      const contests = getUserContests();
      if (!contests.some((contest) => contest.id === getActiveContestScopeId())) {
        db.clearMemory();
        setActiveContestScopeId(contests[0]?.id ?? 'default');
      }
      await ensureSeed();
    };
    void load()
      .then(() => {
        if (cancelled) return;
        syncActiveContestMetadataFromDb();
        setInitialized(true);
      })
      .catch((err) => {
        console.error('Falha ao inicializar os dados do usuário:', err);
        if (!cancelled) setInitialized(true);
      });
    return () => { cancelled = true; };
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId || activeSessionId === TEST_LOCAL_SESSION_ID) return;
    const refresh = async () => {
      if (document.visibilityState === 'visible') {
        if (getAuthSession()?.legacyToken) await verifyCurrentSession();
        if (getLocalSessionId() !== activeSessionId) return;
        void ensureSeed().catch((err) => console.error('Falha ao atualizar dados:', err));
        if (showContestSelector) {
          void refreshUserContests().catch((err) => console.error('Falha ao atualizar concursos:', err));
        }
      }
    };
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [activeSessionId, showContestSelector]);

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
