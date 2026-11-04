import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Display';
import { ContestSearchSelect } from '../contests/ContestSearchSelect';
import { EditalUploadBox } from '../contests/EditalUploadBox';
import { createAndActivateContest, type UserContestProfile } from '../../services/contests';
import { errorMessage } from '../../lib/utils';

interface NewContestModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (contest: UserContestProfile) => void;
}

export function NewContestModal({ open, onClose, onCreated }: NewContestModalProps) {
  const [contestId, setContestId] = useState('');
  const [customName, setCustomName] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [editalText, setEditalText] = useState('');
  const [editalFileName, setEditalFileName] = useState<string | null>(null);
  const [examDate, setExamDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setContestId('');
    setCustomName('');
    setCustomRole('');
    setEditalText('');
    setEditalFileName(null);
    setExamDate('');
    setError(null);
  };

  const handleClose = () => {
    if (loading) return;
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!contestId) {
      setError('Escolha qual concurso você deseja criar antes de continuar.');
      return;
    }
    if (contestId === 'custom' && !customName.trim()) {
      setError('Informe o nome do concurso personalizado.');
      return;
    }

    setLoading(true);
    try {
      const created = await createAndActivateContest({
        templateId: contestId,
        customName: customName.trim() || undefined,
        customRole: customRole.trim() || undefined,
        editalText: editalText.trim() || undefined,
        editalFileName,
        examDate: examDate || null,
        generateScheduleNow: true,
      });
      resetForm();
      onCreated(created);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Novo Concurso e Edital Verticalizado"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={loading}
            disabled={!contestId}
            icon={contestId ? <Sparkles className="size-4" /> : <Plus className="size-4" />}
          >
            {loading ? 'Adaptando Edital e Cronograma...' : 'Criar Concurso e Gerar Cronograma'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-fg-muted leading-relaxed">
          Crie um ambiente exclusivo para outro concurso em sua conta. As disciplinas, o edital
          verticalizado, os simulados e o cronograma de 24 semanas ficarão totalmente separados.
        </p>

        {error && (
          <Alert tone="danger" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <ContestSearchSelect
          value={contestId}
          onChange={(id) => {
            setContestId(id);
            setError(null);
          }}
          customName={customName}
          onCustomNameChange={setCustomName}
          customRole={customRole}
          onCustomRoleChange={setCustomRole}
          disabled={loading}
          label="1. Escolha o concurso que deseja adicionar"
        />

        <div className="space-y-1.5">
          <div className="text-xs font-medium text-fg">
            2. Envie o Edital Verticalizado (liberado após escolher o concurso)
          </div>
          <EditalUploadBox
            contestId={contestId}
            customContestName={customName}
            editalText={editalText}
            onEditalTextChange={setEditalText}
            editalFileName={editalFileName}
            onEditalFileNameChange={setEditalFileName}
            disabled={loading}
          />
        </div>

        <div className="pt-1">
          <label className="block text-xs font-medium text-fg mb-1">
            Data prevista da prova (Opcional)
          </label>
          <input
            type="date"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            disabled={loading || !contestId}
            className="h-9 w-full sm:w-56 rounded-lg border border-border-strong bg-surface px-3 text-xs text-fg focus:border-primary focus:outline-none disabled:opacity-50"
          />
        </div>
      </form>
    </Dialog>
  );
}
