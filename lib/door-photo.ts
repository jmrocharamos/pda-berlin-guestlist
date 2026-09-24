const MAX_BYTES = 40 * 1024 * 1024;

// Photos are decoded and re-encoded locally: originals and EXIF never leave the device.
export async function prepareDoorPhoto(file: File): Promise<string> {
  if (!file.size || file.size > MAX_BYTES) throw new Error('Choose a photo smaller than 40 MB.');
  if (!/\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.name) && !/^image\/(jpeg|png|webp|gif|bmp|avif|heic|heif)$/.test(file.type)) throw new Error('Choose a JPEG, PNG, WebP, GIF, BMP, AVIF, HEIC or HEIF photo.');
  let blob: Blob = file;
  if (/\.(heic|heif)$/i.test(file.name) || /heic|heif/.test(file.type)) {
    const { default: heic2any } = await import('heic2any');
    try { const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 }); blob = Array.isArray(converted) ? converted[0] : converted; }
    catch { throw new Error('This HEIC photo could not be opened. Please export it as JPEG and try again.'); }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); } catch { throw new Error('This photo could not be opened. Please try a JPEG or PNG copy.'); }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 100_000_000) throw new Error('This photo is too large to process. Please choose a smaller copy.');
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo processing is unavailable in this browser.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let result = canvas.toDataURL('image/jpeg', 0.82);
    for (const quality of [0.7, 0.55, 0.4]) { if (result.length <= 650_000) break; result = canvas.toDataURL('image/jpeg', quality); }
    if (result.length > 650_000) throw new Error('Please choose a smaller copy of this photo.');
    return result;
  } finally { URL.revokeObjectURL(url); }
}
