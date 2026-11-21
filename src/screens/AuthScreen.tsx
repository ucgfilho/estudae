import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useId, useState, type KeyboardEvent } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  Eye,
  EyeOff,
  Layers3,
  Lock,
  LogIn,
  Mail,
  RotateCw,
  User,
  UserPlus,
} from 'lucide-react';
import { BnbLogo } from '../components/ui/BnbLogo';
import { Button, IconButton } from '../components/ui/Button';
import { Alert } from '../components/ui/Display';
import { Field, InputWithIcon } from '../components/ui/Form';
import { ContestSearchSelect } from '../components/contests/ContestSearchSelect';
import { EditalUploadBox } from '../components/contests/EditalUploadBox';
import { loginWithCredentials, registerUserAccount } from '../services/auth';
import { createAndActivateContest } from '../services/contests';
import { errorMessage } from '../lib/utils';
import './AuthScreen.css';

interface AuthScreenProps {
  onAuthenticated: (mode: 'login' | 'register') => void;
}

const accessModes = [
  { id: 'login', label: 'Já tenho conta', Icon: LogIn },
  { id: 'register', label: 'Cadastrar conta', Icon: UserPlus },
] as const;

function StudyCyclePreview() {
  return (
    <div className="auth-preview" aria-hidden="true">
      <div className="auth-preview-card">
        <div className="auth-preview-header">
          <span className="auth-preview-icon"><RotateCw size={18} /></span>
          <div>
            <strong>Ciclo de estudos</strong>
            <small>Exemplo de ciclo</small>
          </div>
        </div>
        <div className="auth-preview-progress">
          <span /><span /><span />
        </div>
        <div className="auth-preview-row">
          <span className="auth-preview-check"><Check size={14} /></span>
          Língua Portuguesa
          <small>Concluída</small>
        </div>
        <div className="auth-preview-row auth-preview-current">
          <span className="auth-preview-book"><BookOpen size={14} /></span>
          Raciocínio Lógico
          <small>Próxima</small>
        </div>
        <div className="auth-preview-row">
          <span className="auth-preview-book"><Layers3 size={14} /></span>
          Informática
          <small>Na fila</small>
        </div>
      </div>
      <div className="auth-preview-note">
        <span className="auth-preview-icon"><Clock3 size={17} /></span>
        <div>
          <small>Próxima sessão</small>
          <strong>30 min de estudo</strong>
        </div>
      </div>
    </div>
  );
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const accessId = useId();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');

  // Campos de escolha de concurso e envio do Edital Verticalizado no momento do cadastro
  const [selectedContestId, setSelectedContestId] = useState('');
  const [customContestName, setCustomContestName] = useState('');
  const [customContestRole, setCustomContestRole] = useState('');
  const [editalText, setEditalText] = useState('');
  const [editalFileName, setEditalFileName] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === 'register';

  const changeMode = (nextMode: typeof mode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setPasswordVisible(false);
    setError(null);
  };

  const handleTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();

    const nextMode = event.key === 'Home' || (event.key !== 'End' && isRegister)
      ? 'login'
      : 'register';
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-mode="${nextMode}"]`)?.focus();
    changeMode(nextMode);
  };

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
    <main className="auth-screen text-fg">
      <div className="auth-hero">
        <div className="auth-hero-content">
          <div className="auth-brand">
            <span aria-hidden="true"><BnbLogo className="size-11 rounded-xl" /></span>
            estudaê
          </div>

          <div className="auth-pitch">
            <p className="auth-eyebrow">Planejamento para concursos</p>
            <p className="auth-display">Seu edital.<br /> <span>Seu plano.</span></p>
            <p className="auth-description">
              Transforme os tópicos do seu edital em um ciclo contínuo de estudos e organize
              cada concurso no seu próprio painel.
            </p>
          </div>

          <StudyCyclePreview />
        </div>
      </div>

      <div className="auth-access">
        <div className="auth-access-inner">
          <div className="mb-3 flex justify-end"><ThemeToggle /></div>
          <div className="auth-intro" key={mode}>
            <h1>{isRegister ? 'Crie sua conta' : 'Boas-vindas!'}</h1>
            <p>
              {isRegister
                ? 'Preencha seus dados e escolha o concurso para iniciar seu ciclo.'
                : 'Acesse sua conta para continuar seus estudos.'}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Acesso à plataforma"
            className="auth-modes"
            data-register={isRegister}
            onKeyDown={handleTabKey}
          >
            {accessModes.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`${accessId}-${id}`}
                data-mode={id}
                aria-controls={`${accessId}-panel`}
                aria-selected={mode === id}
                tabIndex={mode === id ? 0 : -1}
                disabled={loading}
                onClick={() => changeMode(id)}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`${accessId}-panel`} aria-labelledby={`${accessId}-${mode}`}>
            <form onSubmit={handleSubmit} className="auth-form">
              {isRegister && (
                <Field label="Seu nome completo" required>
                  <InputWithIcon
                    type="text"
                    name="name"
                    autoComplete="name"
                    minLength={2}
                    placeholder="Ex.: Maria Oliveira"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    icon={<User />}
                  />
                </Field>
              )}

              <Field label="E-mail" required>
                <InputWithIcon
                  type="email"
                  name="email"
                  autoComplete={isRegister ? 'email' : 'username'}
                  placeholder="seu.email@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<Mail />}
                />
              </Field>

              <div className={isRegister ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : undefined}>
                <Field
                  label="Senha"
                  required
                  hint={isRegister ? 'Use pelo menos 6 caracteres.' : undefined}
                >
                  <InputWithIcon
                    type={passwordVisible ? 'text' : 'password'}
                    name="password"
                    minLength={6}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    icon={<Lock />}
                    endAction={
                      <IconButton
                        className="auth-password-toggle"
                        label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                        icon={passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
                        onClick={() => setPasswordVisible(!passwordVisible)}
                      />
                    }
                  />
                </Field>

                {isRegister && (
                  <Field label="Confirmar senha" required>
                    <InputWithIcon
                      type="password"
                      name="confirmPassword"
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

              {isRegister && (
                <div className="auth-contest">
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

              {error && (
                <Alert tone="danger" onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}

              <Button type="submit" variant="primary" size="lg" className="auth-submit" loading={loading}>
                {isRegister ? 'Criar conta e iniciar meu ciclo' : 'Entrar na plataforma'}
                {!loading && <ArrowRight size={18} className="auth-submit-arrow" aria-hidden="true" />}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
