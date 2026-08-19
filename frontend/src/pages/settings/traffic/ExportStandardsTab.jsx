import { useSettingsGroup } from '../../../hooks/useSettingsGroup';
import { ColorField, Field, SelectField, TextField, ToggleField } from '../../../components/settings/fields';
import SectionCard from '../../../components/settings/SectionCard';
import SaveBar from '../../../components/settings/SaveBar';

export default function ExportStandardsTab() {
  const { draft, setValue, save, reset, saving, saved, error } = useSettingsGroup('export', 'export');
  if (!draft) return <p className="text-gray-500">Loading…</p>;

  const zones = Array.isArray(draft.speed_zone_colors) ? draft.speed_zone_colors : [];
  const setZones = (next) => setValue('speed_zone_colors', next);
  const patchZone = (i, key, v) => setZones(zones.map((z, idx) => (idx === i ? { ...z, [key]: v } : z)));
  const addZone = () => setZones([...zones, { speed: 60, label: '', color: '#22c55e' }]);
  const removeZone = (i) => setZones(zones.filter((_, idx) => idx !== i));

  return (
    <div>
      <SectionCard title="Speed zone colours" description="Colour coding for speed zones — used on exported TMP drawings and stamped into TMP PDFs when the site has a speed limit.">
        <div className="space-y-2 mb-3">
          {zones.map((z, i) => (
            <div key={i} className="grid grid-cols-[80px_1fr_1fr_auto] gap-2 items-end">
              <Field label="km/h">
                <input type="number" min="0" max="200" className="input w-full"
                  value={z.speed ?? ''} onChange={(e) => patchZone(i, 'speed', Number(e.target.value))} />
              </Field>
              <Field label="Label">
                <input type="text" className="input w-full" value={z.label || ''}
                  placeholder="e.g. 40 km/h" onChange={(e) => patchZone(i, 'label', e.target.value)} />
              </Field>
              <Field label="Colour">
                <ColorField value={z.color || ''} onChange={(v) => patchZone(i, 'color', v)} />
              </Field>
              <button onClick={() => removeZone(i)} className="btn btn-ghost mb-1 text-red-500">✕</button>
            </div>
          ))}
          {zones.length === 0 && <p className="text-xs text-gray-400">No speed zones configured.</p>}
        </div>
        <button onClick={addZone} className="btn btn-ghost">+ Add speed zone</button>
        <SaveBar onSave={() => save()} onReset={reset} saving={saving} saved={saved} error={error} saveLabel="Save export standards" />
      </SectionCard>

      <SectionCard title="Drawing & data exports" description="Defaults applied to CAD, GIS and CSV exports.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Icon library">
            <SelectField value={draft.icon_library || 'standard'} onChange={(v) => setValue('icon_library', v)}
              options={[{ value: 'standard', label: 'Standard' }, { value: 'custom', label: 'Custom' }]} />
          </Field>
          <Field label="Default DWG scale">
            <TextField value={draft.default_dwg_scale || ''} onChange={(v) => setValue('default_dwg_scale', v)} placeholder="1:500" />
          </Field>
        </div>
        <ToggleField label="Include CAD layers" hint="Structural layers in exported drawings."
          checked={draft.include_cad_layers} onChange={(v) => setValue('include_cad_layers', v)} />
        <ToggleField label="Include GIS layers" hint="Spatial layers in exported maps."
          checked={draft.include_gis_layers} onChange={(v) => setValue('include_gis_layers', v)} />
        <SaveBar onSave={() => save()} onReset={reset} saving={saving} saved={saved} error={error} saveLabel="Save drawing defaults" />
      </SectionCard>
    </div>
  );
}