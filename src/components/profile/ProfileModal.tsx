import { useEffect, useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Display';
import { Field, Input } from '../ui/Form';
import { Avatar } from '../ui/Avatar';
import { getAuthSession, updateUserProfile } from '../../services/auth';
import { fileToAvatarDataUrl } from '../../lib/image';
import { errorMessage } from '../../lib/utils';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export function ProfileModal({ open, onClose }: ProfileModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const user = getAuthSession()?.user;
    setName(user?.name ?? '');
    setAvatar(user?.avatarUrl ?? null);
    setError(null);
  }, [open]);

  const email = getAuthSession()?.user.email ?? '';

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      setAvatar(await fileToAvatarDataUrl(file));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleSave = async () => {
    if (name.trim().length < 2) {
      setError('O nome precisa ter pelo menos 2 letras.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateUserProfile({ name: name.trim(), avatarUrl: avatar });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      title="Editar perfil"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && (
          <Alert tone="danger" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <div className="flex items-center gap-4">
          <Avatar name={name || email} src={avatar} size="xl" />
          <div className="flex flex-col items-start gap-2">
            <Button size="sm" icon={<Camera className="size-4" />} onClick={() => fileRef.current?.click()}>
              {avatar ? 'Trocar foto' : 'Enviar foto'}
            </Button>
            {avatar && (
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setAvatar(null)}>
                Remover
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFile}
              data-testid="avatar-file-input"
            />
          </div>
        </div>

        <Field label="Nome" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
        </Field>

        <Field label="E-mail" hint="O e-mail é o seu login e não pode ser alterado.">
          <Input value={email} disabled readOnly />
        </Field>
      </div>
    </Dialog>
  );
}
