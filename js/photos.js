// Shrinks a phone photo or screenshot before it's sent to the AI helper: longest side at most
// 1600px (plenty to read text), saved as JPEG. Returns { media_type, data (base64), preview }.
const MAX_SIDE = 1600;

export async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That file isn’t a photo we can read.'));
      i.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { media_type: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}
