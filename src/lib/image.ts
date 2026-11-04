function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

/** Reduz e recorta a imagem em um quadrado para caber no perfil (JPEG, ~20 KB). */
export async function fileToAvatarDataUrl(file: File, side = 256): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
    throw new Error('Use uma imagem PNG, JPG ou WebP.');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('A imagem passa de 8 MB. Escolha uma menor.');
  }
  if (typeof createImageBitmap !== 'function') {
    return readFileAsDataUrl(file);
  }
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return readFileAsDataUrl(file);
    }
    const crop = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - crop) / 2;
    const sy = (bitmap.height - crop) / 2;
    ctx.drawImage(bitmap, sx, sy, crop, crop, 0, 0, side, side);
    bitmap.close?.();
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return readFileAsDataUrl(file);
  }
}
