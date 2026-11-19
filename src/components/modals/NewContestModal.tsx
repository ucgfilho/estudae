import { useId, useRef, useState, type FormEvent } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Display';
import { EditalUploadBox } from '../contests/EditalUploadBox';
import { createAndActivateContest, type UserContestProfile } from '../../services/contests';
import { errorMessage } from '../../lib/utils';

interface NewContestModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (contest: UserContestProfile) => void;
}

export function NewContestModal({ open, onClose, onCreated }: NewContestModalProps) {
  const formId = useId();
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(1);
  const [customName, setCustomName] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [editalText, setEditalText] = useState('');
  const [editalFileName, setEditalFileName] = useState<string | null>(null);
  const [examDate, setExamDate] = useState('');
  const [readingFile, setReadingFile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = loading || readingFile;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (step === 1) {
      if (!customName.trim()) {
        setError('Informe o nome do concurso.');
        return;
      }
      setStep(2);
      requestAnimationFrame(() => stageHeading.current?.focus());
      return;
    }

    setLoading(true);
    try {
      const created = await createAndActivateContest({
        templateId: 'custom',
        customName: customName.trim(),
        customRole: customRole.trim() || undefined,
        editalText: editalText.trim() || undefined,
        editalFileName,
        examDate: examDate || null,
      });
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
      onClose={() => { if (!busy) onClose(); }}
      title="Novo concurso"
      size="lg"
      footer={
        <>
          <Button
            onClick={step === 1 ? onClose : () => {
              setError(null);
              setStep(1);
              requestAnimationFrame(() => stageHeading.current?.focus());
            }}
            disabled={busy}
          >
            {step === 1 ? 'Cancelar' : 'Voltar'}
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={loading} disabled={busy}>
            {step === 1 ? 'Continuar' : 'Criar concurso'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="text-xs text-fg-muted">Etapa {step} de 2</p>
          <h3 ref={stageHeading} tabIndex={-1} className="mt-1 section-title">
            {step === 1 ? 'Dados do concurso' : 'Edital verticalizado'}
          </h3>
        </div>

        {error && <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert>}

        {step === 1 && (
          <div className="space-y-4">
            <label className="block space-y-1 text-sm font-medium">
              <span>Nome do concurso</span>
              <input
                value={customName}
                onChange={(event) => setCustomName(event.target.value)}
                className="input-base"
                required
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1 text-sm font-medium">
                <span>Cargo (opcional)</span>
                <input value={customRole} onChange={(event) => setCustomRole(event.target.value)} className="input-base" />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                <span>Data prevista da prova (opcional)</span>
                <input type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} className="input-base" />
              </label>
            </div>
          </div>
        )}

        <div hidden={step !== 2}>
          <p className="mb-3 text-sm text-fg-muted">
            O envio é opcional. Você também pode cadastrar disciplinas e tópicos no painel.
          </p>
          <EditalUploadBox
            contestId="custom"
            customContestName={customName}
            editalText={editalText}
            onEditalTextChange={setEditalText}
            editalFileName={editalFileName}
            onEditalFileNameChange={setEditalFileName}
            onReadingFileChange={setReadingFile}
            allowTemplate={false}
            disabled={loading}
          />
        </div>
      </form>
    </Dialog>
  );
}
