import { useEffect, useState } from 'react';
import api from '../api';
import { useSettingsStore } from '../stores/SettingsStore';

export const MASK_PLACEHOLDER = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

// Binds a panel's draft to one settings group in the store. Tracks dirty state
// through the shared registry (feeds the UnsavedPrompt blocker) and strips
// masked/empty secrets before saving so stored credentials are never clobbered.
export function useSettingsGroup(prefix, id) {
  const { groups, refreshGroups, setDirty } = useSettingsStore();
  const server = groups?.[prefix];
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (server) setDraft((d) => (d === null ? { ...server } : d));
  }, [server]);

  const dirty = !!(draft && server && JSON.stringify(draft) !== JSON.stringify(server));
  useEffect(() => { setDirty(id, dirty); }, [id, dirty, setDirty]);

  const setValue = (member, value) => setDraft((d) => (d ? { ...d, [member]: value } : d));
  const reset = () => { if (server) setDraft({ ...server }); };

  const save = async (payload) => {
    const next = payload || draft;
    if (!next) return;
    const cleaned = { ...next };
    const secretMask = server?.has_secret || {};
    for (const [k, v] of Object.entries(cleaned)) {
      if (secretMask[k] && (v === MASK_PLACEHOLDER || v === '' || v === null || v === undefined)) delete cleaned[k];
    }
    setSaving(true);
    setError('');
    try {
      await api.settings.saveGroups({ [prefix]: cleaned });
      setDraft({ ...cleaned });
      setSaved('Saved');
      setTimeout(() => setSaved(''), 2500);
      refreshGroups();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return { group: server, draft, setValue, save, reset, saving, saved, error, dirty };
}