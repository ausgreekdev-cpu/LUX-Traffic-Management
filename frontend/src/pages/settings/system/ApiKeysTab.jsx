import { useSettingsGroup } from '../../../hooks/useSettingsGroup';
import { Field, SelectField, TextField } from '../../../components/settings/fields';
import SectionCard from '../../../components/settings/SectionCard';
import SaveBar from '../../../components/settings/SaveBar';
import { FeatureGate } from '../../../components/EntitlementGate';

export default function ApiKeysTab() {
  const { draft, setValue, save, reset, saving, saved, error } = useSettingsGroup('api_keys', 'api_keys');
  if (!draft) return <p className="text-gray-500">Loading…</p>;

  return (
    <FeatureGate feature="api_access">
    <div>
      <SectionCard title="Environment & API keys" description="External service credentials used by the traffic engine — mapping, geocoding, weather and SMS. Stored encrypted; secrets show as a placeholder and are only replaced when a new value is typed. Requires Agency.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Mapbox token" hint="Map tiles and geocoding for the map viewer.">
            <input type="password" className="input w-full font-mono" value={draft.mapbox_token || ''}
              onChange={(e) => setValue('mapbox_token', e.target.value)} placeholder={draft.has_secret?.mapbox_token ? '••••••••' : 'pk.…'} />
          </Field>
          <Field label="Google Maps API key" hint="Optional alternative map provider.">
            <input type="password" className="input w-full font-mono" value={draft.google_maps_key || ''}
              onChange={(e) => setValue('google_maps_key', e.target.value)} placeholder={draft.has_secret?.google_maps_key ? '••••••••' : 'AIza…'} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Geocoding base URL" hint="Nominatim-compatible endpoint for address lookups.">
              <TextField value={draft.nominatim_base_url || ''} onChange={(v) => setValue('nominatim_base_url', v)} placeholder="https://nominatim.openstreetmap.org" />
            </Field>
          </div>
          <Field label="Weather provider">
            <SelectField value={draft.weather_provider || 'none'} onChange={(v) => setValue('weather_provider', v)}
              options={[{ value: 'none', label: 'None' }, { value: 'openweathermap', label: 'OpenWeatherMap' }, { value: 'tomorrow', label: 'Tomorrow.io' }]} />
          </Field>
          <Field label="Weather API key">
            <input type="password" className="input w-full font-mono" value={draft.weather_api_key || ''}
              onChange={(e) => setValue('weather_api_key', e.target.value)} placeholder={draft.has_secret?.weather_api_key ? '••••••••' : 'Provider key'} />
          </Field>
          <Field label="SMS gateway">
            <SelectField value={draft.sms_gateway || 'none'} onChange={(v) => setValue('sms_gateway', v)}
              options={[{ value: 'none', label: 'None' }, { value: 'twilio', label: 'Twilio' }, { value: 'clickatell', label: 'Clickatell' }]} />
          </Field>
          <Field label="SMS API key">
            <input type="password" className="input w-full font-mono" value={draft.sms_api_key || ''}
              onChange={(e) => setValue('sms_api_key', e.target.value)} placeholder={draft.has_secret?.sms_api_key ? '••••••••' : 'Gateway key'} />
          </Field>
          <Field label="SMS sender ID" hint="Shown as the sender on outgoing messages.">
            <TextField value={draft.sms_from || ''} onChange={(v) => setValue('sms_from', v)} placeholder="e.g. LUX TMP" />
          </Field>
        </div>
        <SaveBar onSave={() => save()} onReset={reset} saving={saving} saved={saved} error={error} saveLabel="Save API keys" />
      </SectionCard>
    </div>
    </FeatureGate>
  );
}