export default function SaveBar({ onSave, onReset, saving, disabled, saved, error, saveLabel = 'Save' }) {
  return (
    <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
      <button onClick={onSave} disabled={saving || disabled} className="btn btn-primary">
        {saving ? 'Saving…' : saveLabel}
      </button>
      {onReset && <button onClick={onReset} disabled={saving} className="btn btn-ghost">Discard changes</button>}
      {saving && <span className="text-sm text-amber-600 dark:text-amber-400">Saving…</span>}
      {!saving && saved && <span className="text-sm text-green-600 dark:text-green-400">{saved}</span>}
      {!saving && error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}