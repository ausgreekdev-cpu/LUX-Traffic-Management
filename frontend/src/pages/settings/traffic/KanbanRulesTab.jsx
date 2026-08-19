import ColumnEditor from '../../../components/kanban/ColumnEditor';
import { useSettingsGroup } from '../../../hooks/useSettingsGroup';
import { Field, NumberField, SelectField } from '../../../components/settings/fields';
import SectionCard from '../../../components/settings/SectionCard';
import SaveBar from '../../../components/settings/SaveBar';

export default function KanbanRulesTab() {
  const { draft, setValue, save, reset, saving, saved, error } = useSettingsGroup('kanban', 'kanban');

  return (
    <div>
      <SectionCard title="Board defaults" description="Default behaviour applied to the Kanban board — applied to new columns and emergency lanes.">
        {draft ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Default WIP limit" hint="Limit applied to columns without an explicit WIP limit.">
              <NumberField value={draft.default_wip_limit} min={0}
                onChange={(v) => setValue('default_wip_limit', v === 0 ? 0 : v)} />
            </Field>
            <Field label="Emergency lane policy">
              <SelectField value={draft.emergency_lane_policy || 'manual'} onChange={(v) => setValue('emergency_lane_policy', v)}
                options={[{ value: 'manual', label: 'Manual — staff add and prioritise' }, { value: 'auto_assign', label: 'Auto-assign — rules pick the lane' }]} />
            </Field>
            <Field label="Default stale after (business days)" hint="Flags a card as stale when it has sat in a column past this many business days.">
              <NumberField value={draft.default_stale_business_days} min={0}
                onChange={(v) => setValue('default_stale_business_days', v === 0 ? 0 : v)} />
            </Field>
          </div>
        ) : <p className="text-sm text-gray-500">Loading…</p>}
        <SaveBar onSave={() => save()} onReset={reset} saving={saving} saved={saved} error={error} saveLabel="Save board defaults" />
      </SectionCard>

      <SectionCard title="TMP board columns" description="Add, reorder and configure Kanban columns. WIP limits and Definition-of-Done stages control how the board behaves.">
        <ColumnEditor entityType="tmp" onError={(m) => alert(m)} />
      </SectionCard>

      <SectionCard title="Permit board columns" description="Separate column configuration for the permits board.">
        <ColumnEditor entityType="permit" onError={(m) => alert(m)} />
      </SectionCard>
    </div>
  );
}