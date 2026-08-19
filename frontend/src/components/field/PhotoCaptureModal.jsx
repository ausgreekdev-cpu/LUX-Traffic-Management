import { useEffect, useRef, useState } from 'react';
import api from '../../api';
import { capturePhoto, getPosition, isOnline, isNative } from '../../lib/mobileCaps';
import { fileToDataUrl, downscale, applyWatermark, dataUrlToBlob } from '../../lib/image';
import { queueUpload, getQueueStats } from '../../lib/fieldStore';

export default function PhotoCaptureModal({ tmp, onClose, onUploaded }) {
  const [dataUrl, setDataUrl] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [caption, setCaption] = useState('');
  const [geo, setGeo] = useState(null);
  const [geoOk, setGeoOk] = useState(true);
  const [watermark, setWatermark] = useState(true);
  const fileRef = useRef(null);

  useEffect(() => {
    if (isNative() && !dataUrl) beginNativeCapture();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const geoText = () => (geo ? `${geo.latitude.toFixed(5)}, ${geo.longitude.toFixed(5)}` : null);

  const beginNativeCapture = async () => {
    setProcessing(true);
    try {
      const shot = await capturePhoto();
      if (shot) setDataUrl(shot);
    } catch (err) {
      setStatus(err.message || 'Camera unavailable');
    }
    setProcessing(false);
  };

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setProcessing(true);
    try {
      setDataUrl(await fileToDataUrl(file));
    } catch (err) {
      setStatus(err.message);
    }
    setProcessing(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const applyGeo = async () => {
    try {
      setGeo(await getPosition());
      setGeoOk(true);
    } catch {
      setGeoOk(false);
      setGeo(null);
    }
  };

  const save = async () => {
    if (!dataUrl || saving) return;
    setSaving(true);
    setStatus('');
    try {
      let finalDataUrl = await downscale(dataUrl, 2048);
      if (watermark) {
        const label = `${tmp.reference || ''}${geoText() ? '  ·  ' + geoText() : ''}  ·  ${new Date().toLocaleString()}`;
        finalDataUrl = await applyWatermark(finalDataUrl, label.trim());
      }
      const blob = dataUrlToBlob(finalDataUrl);
      const meta = {
        tmp_id: tmp.id,
        caption: caption.trim() || null,
        latitude: geo ? geo.latitude : null,
        longitude: geo ? geo.longitude : null,
        captured_at: new Date().toISOString(),
        watermark_on: watermark ? 1 : 0
      };
      if (isOnline()) {
        await api.photos.upload(tmp.id, blob, meta);
        setStatus('Uploaded');
        if (onUploaded) await onUploaded();
        onClose();
      } else {
        await queueUpload({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), blob, meta, queuedAt: new Date().toISOString() });
        setStatus('Offline — queued for upload when back online.');
        if (onUploaded) await onUploaded();
        onClose();
      }
    } catch (err) {
      setStatus(err.message || 'Upload failed');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-sm">Capture site photo</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 px-2">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-500 truncate">{tmp.reference} · {tmp.site_name || tmp.title}</p>

          {!dataUrl && (
            <div className="flex flex-col items-center gap-3 py-6">
              {processing ? (
                <p className="text-sm text-gray-500">Opening camera…</p>
              ) : (
                <>
                  {isNative() ? (
                    <button onClick={beginNativeCapture} className="btn btn-primary w-full">📷 Open camera</button>
                  ) : (
                    <label className="btn btn-primary w-full cursor-pointer text-center">
                      📷 Take photo
                      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
                    </label>
                  )}
                  <button onClick={applyGeo} className="btn btn-sm w-full">📍 Use current location</button>
                </>
              )}
            </div>
          )}

          {dataUrl && (
            <>
              <img src={dataUrl} alt="Capture preview" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 object-contain max-h-72" />
              <button onClick={() => { setDataUrl(null); if (isNative()) beginNativeCapture(); }} className="btn btn-sm w-full">Retake</button>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" rows={2} className="input w-full" />
              <div className="flex items-center gap-3 flex-wrap text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} className="accent-lux-500" />
                  Watermark (ref · location · time)
                </label>
                <button onClick={applyGeo} className="text-xs text-lux-600 dark:text-lux-400 underline">{geo ? `📍 ${geoText()}` : (geoOk ? '📍 Add location' : '📍 Location unavailable')}</button>
              </div>
            </>
          )}

          {status && <p className="text-sm text-amber-600 dark:text-amber-400">{status}</p>}

          {dataUrl && (
            <div className="flex gap-2">
              <button onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
              <button onClick={save} disabled={saving} className="btn btn-primary flex-1">{saving ? 'Saving…' : 'Save photo'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { getQueueStats };