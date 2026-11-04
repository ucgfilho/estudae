import { useState } from 'react';
import {
  CheckCircle2,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  User,
  UserPlus,
} from 'lucide-react';
import { BnbLogo } from '../components/ui/BnbLogo';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Display';
import { Field, InputWithIcon } from '../components/ui/Form';
import { ContestSearchSelect } from '../components/contests/ContestSearchSelect';
import { EditalUploadBox } from '../components/contests/EditalUploadBox';
import { loginWithCredentials, registerUserAccount } from '../services/auth';
import { createAndActivateContest } from '../services/contests';
import { errorMessage } from '../lib/utils';

interface AuthScreenProps {
  onAuthenticated: (mode: 'login' | 'register') => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Campos de escolha de concurso e envio do Edital Verticalizado no momento do cadastro
  const [selectedContestId, setSelectedContestId] = useState('');
  const [customContestName, setCustomContestName] = useState('');
  const [customContestRole, setCustomContestRole] = useState('');
  const [editalText, setEditalText] = useState('');
  const [editalFileName, setEditalFileName] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('As senhas digitadas não conferem.');
        return;
      }
      if (!selectedContestId) {
        setError('Escolha o concurso para liberar o envio do edital.');
        return;
      }
      if (selectedContestId === 'custom' && !customContestName.trim()) {
        setError('Digite o nome do concurso.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await loginWithCredentials({ email, password });
        onAuthenticated('login');
      } else {
        await registerUserAccount({ name, email, password });
        await createAndActivateContest(
          {
            templateId: selectedContestId,
            customName: customContestName.trim() || undefined,
            customRole: customContestRole.trim() || undefined,
            editalText: editalText.trim() || undefined,
            editalFileName,
            generateScheduleNow: true,
          },
          { isInitialRegistration: true },
        );
        onAuthenticated('register');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-bg text-fg">
      {/* Coluna Institucional / Identidade Visual estudaê (mesma paleta e template) */}
      <div
        className="lg:w-5/12 xl:w-1/2 p-6 sm:p-10 lg:p-12 flex flex-col justify-between text-white relative overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #c20018 0%, #a6193c 55%, #7a102b 100%)',
        }}
      >
        <div
          className="pointer-events-none absolute -right-20 -bottom-20 size-96 rounded-full opacity-15"
          style={{
            background: 'radial-gradient(circle, #f68b1f 0%, transparent 70%)',
          }}
        />

        <div className="flex items-center gap-3.5 relative z-10">
          <BnbLogo className="size-11 rounded-xl shadow-md" />
          <div>
            <div className="text-lg sm:text-xl font-bold tracking-tight">estudaê</div>
            <div className="text-xs text-white/80">
              Estudo organizado para qualquer concurso
            </div>
          </div>
        </div>

        <div className="my-8 lg:my-0 space-y-5 max-w-lg relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1 text-xs font-medium backdrop-blur-xs">
            <ShieldCheck className="size-4 text-[#f68b1f]" />
            <span>Cronograma de 24 semanas feito a partir do seu edital</span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">
            Envie seu edital verticalizado e monte seu plano de estudo.
          </h1>

          <p className="text-xs sm:text-sm text-white/85 leading-relaxed">
            Escolha o concurso, envie o edital verticalizado e receba 24 semanas de estudo
            baseadas nos tópicos dele. Dá para ter vários concursos na mesma conta, cada um
            com o seu painel.
          </p>

          <ul className="space-y-2.5 text-xs sm:text-sm text-white/90 pt-1">
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 text-[#f68b1f] shrink-0" />
              <span>
                Bancos, TI, polícia, fiscal, tribunais e outros
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 text-[#f68b1f] shrink-0" />
              <span>
                O cronograma segue os tópicos do seu edital
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 text-[#f68b1f] shrink-0" />
              <span>
                Um painel separado para cada concurso
              </span>
            </li>
          </ul>
        </div>

        <div className="text-xs text-white/70 relative z-10 hidden sm:block">
          estudaê
        </div>
      </div>

      {/* Coluna do Formulário de Login / Cadastro */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 lg:p-12 overflow-y-auto">
        <div
          className="w-full max-w-xl space-y-5 my-auto"
        >
          <div className="space-y-1.5 text-center sm:text-left">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-fg">
              {mode === 'login' ? 'Acesse sua conta no estudaê' : 'Crie sua conta de estudos no estudaê'}
            </h2>
            <p className="text-xs sm:text-sm text-fg-muted">
              {mode === 'login'
                ? 'Entre com seu e-mail e senha para continuar de onde parou.'
                : 'Preencha seus dados, escolha o concurso e envie o edital.'}
            </p>
          </div>

          {/* Seletor de Modo */}
          <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-muted p-1 border border-border">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition ${
                mode === 'login'
                  ? 'bg-surface text-primary shadow-xs'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              <LogIn className="size-3.5" />
              Já tenho conta
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition ${
                mode === 'register'
                  ? 'bg-surface text-primary shadow-xs'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              <UserPlus className="size-3.5" />
              Cadastrar novo
            </button>
          </div>

          {error && (
            <Alert tone="danger" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <Field label="Seu nome completo" required>
                <InputWithIcon
                    type="text"
                    required
                    minLength={2}
                    placeholder="Ex: Maria Oliveira"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                icon={<User />}
              />
              </Field>
            )}

            <Field label="E-mail" required>
              <InputWithIcon
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="seu.email@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                icon={<Mail />}
              />
            </Field>

            <div
              className={
                mode === 'register'
                  ? 'grid grid-cols-1 sm:grid-cols-2 gap-3.5'
                  : 'space-y-4'
              }
            >
              <Field
                label="Senha"
                required
                hint={mode === 'register' ? 'Use pelo menos 6 caracteres.' : undefined}
              >
                <InputWithIcon
                    type="password"
                    required
                    minLength={6}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                icon={<Lock />}
              />
              </Field>

              {mode === 'register' && (
                <Field label="Confirmar senha" required>
                  <InputWithIcon
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                icon={<Lock />}
              />
                </Field>
              )}
            </div>

            {mode === 'register' && (
              <div className="space-y-3.5 pt-2 border-t border-border">
                <ContestSearchSelect
                  value={selectedContestId}
                  onChange={(id) => {
                    setSelectedContestId(id);
                    setError(null);
                  }}
                  customName={customContestName}
                  onCustomNameChange={setCustomContestName}
                  customRole={customContestRole}
                  onCustomRoleChange={setCustomContestRole}
                  disabled={loading}
                  label="Qual concurso você vai fazer?"
                />

                <EditalUploadBox
                  contestId={selectedContestId}
                  customContestName={customContestName}
                  editalText={editalText}
                  onEditalTextChange={setEditalText}
                  editalFileName={editalFileName}
                  onEditalFileNameChange={setEditalFileName}
                  disabled={loading}
                />
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
              loading={loading}
              icon={mode === 'login' ? <LogIn className="size-4" /> : <UserPlus className="size-4" />}
            >
              {mode === 'login'
                ? 'Entrar na plataforma'
                : 'Criar conta e gerar meu cronograma'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
