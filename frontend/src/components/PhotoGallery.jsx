import { useState, useRef } from 'react';
import api from '../api';

function fmtCoord(v, pos, neg) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return `${Math.abs(v).toFixed(5)}° ${Number(v) >= 0 ? pos : neg}`;
}

export default function PhotoGallery({ tmpId, photos = [], canDelete = false, canUpload = false, onChanged }) {
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.photos.upload(tmpId, file, {});
      if (onChanged) await onChanged();
    } catch (err) {
      alert(err.message);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDelete = async (photo) => {
    if (!confirm('Delete this photo?')) return;
    try {
      await api.photos.delete(photo.id);
      if (onChanged) await onChanged();
    } catch (err) {
      alert(err.message);
    }
  };

  if (!photos.length && !canUpload) return null;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">Site photos ({photos.length})</h2>
        {canUpload && (
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="text-sm" disabled={uploading} />
            {uploading && <span className="text-xs text-gray-500">Uploading...</span>}
          </div>
        )}
      </div>
      {photos.length === 0 ? (
        <p className="text-sm text-gray-500">No photos captured yet.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
              <img
                src={api.photos.url(p.id)}
                alt={p.caption || 'Site photo'}
                loading="lazy"
                className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition"
                onClick={() => setPreview(p)}
              />
              {canDelete && (
                <button
                  onClick={() => handleDelete(p)}
                  className="absolute top-1 right-1 bg-red-600 text-white text-xs rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition"
                  title="Delete photo"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {preview && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium truncate">{preview.caption || 'Site photo'}</p>
              <button onClick={() => setPreview(null)} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 px-2">✕</button>
            </div>
            <img src={api.photos.url(preview.id)} alt={preview.caption || 'Site photo'} className="w-full flex-1 min-h-0 object-contain" style={{ maxHeight: '70vh' }} />
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
              <span>Captured: {preview.captured_at ? new Date(preview.captured_at).toLocaleString() : preview.created_at?.slice(0, 16)}</span>
              {fmtCoord(preview.latitude, 'S', 'N') && <span>Lat {fmtCoord(preview.latitude, 'S', 'N')}</span>}
              {fmtCoord(preview.longitude, 'E', 'W') && <span>Lon {fmtCoord(preview.longitude, 'E', 'W')}</span>}
              {preview.uploaded_by_name && <span>By {preview.uploaded_by_name}</span>}
              {preview.watermark_on ? <span>Watermarked</span> : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}