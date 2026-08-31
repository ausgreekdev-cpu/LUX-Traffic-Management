import { useState } from 'react';
import { useSettingsGroup } from '../../../hooks/useSettingsGroup';
import { Field, SelectField, TextField } from '../../../components/settings/fields';
import SectionCard from '../../../components/settings/SectionCard';
import SaveBar from '../../../components/settings/SaveBar';
import { FeatureGate } from '../../../components/EntitlementGate';

export default function SsoTab() {
  const { draft, setValue, save, reset, saving, saved, error } = useSettingsGroup('sso', 'sso');
  const [reveal, setReveal] = useState(false);
  if (!draft) return <p className="text-gray-500">Loading…</p>;

  const isSAML = draft.provider === 'saml';
  const isOAuth = draft.provider === 'oauth2';

  return (
    <FeatureGate feature="sso_saml">
    <div>
      <SectionCard title="Single sign-on" description="Enterprise SSO configuration (SAML / OAuth2). Credentials are stored encrypted and masked. JWT login remains active until an identity provider is wired end-to-end. Requires Enterprise.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Provider">
            <SelectField value={draft.provider || 'none'} onChange={(v) => setValue('provider', v)}
              options={[{ value: 'none', label: 'None — username/password only' }, { value: 'saml', label: 'SAML 2.0' }, { value: 'oauth2', label: 'OAuth2 / OpenID Connect' }]} />
          </Field>
        </div>

        {isSAML && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <Field label="Issuer (IdP entity ID)"><TextField value={draft.issuer || ''} onChange={(v) => setValue('issuer', v)} placeholder="https://idp.example.com" /></Field>
            <Field label="Service provider entity ID"><TextField value={draft.entity_id || ''} onChange={(v) => setValue('entity_id', v)} placeholder="https://lux-official.netlify.app/saml/metadata" /></Field>
            <Field label="ACS URL"><TextField value={draft.acs_url || ''} onChange={(v) => setValue('acs_url', v)} placeholder="https://lux-official.netlify.app/saml/acs" /></Field>
            <Field label="IdP signing certificate" hint={draft.has_secret?.certificate ? 'Stored — leave blank to keep it.' : 'Public X.509 certificate (PEM).'}>
              <textarea rows={4} className="input w-full font-mono text-xs" value={draft.certificate || ''}
                onChange={(e) => setValue('certificate', e.target.value)} placeholder={draft.has_secret?.certificate ? '••••••••' : '-----BEGIN CERTIFICATE-----…'} />
            </Field>
          </div>
        )}

        {isOAuth && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <Field label="Client ID"><TextField value={draft.client_id || ''} onChange={(v) => setValue('client_id', v)} placeholder="client-id" /></Field>
            <Field label="Client secret" hint={draft.has_secret?.client_secret ? 'Stored — leave blank to keep it.' : undefined}>
              <div className="flex gap-2">
                <input type={reveal ? 'text' : 'password'} className="input w-full font-mono" value={draft.client_secret || ''}
                  onChange={(e) => setValue('client_secret', e.target.value)} placeholder={draft.has_secret?.client_secret ? '••••••••' : 'client-secret'} />
                <button type="button" onClick={() => setReveal(!reveal)} className="btn btn-ghost shrink-0">{reveal ? 'Hide' : 'Show'}</button>
              </div>
            </Field>
            <Field label="Authorize URL"><TextField value={draft.authorize_url || ''} onChange={(v) => setValue('authorize_url', v)} placeholder="https://idp.example.com/authorize" /></Field>
            <Field label="Token URL"><TextField value={draft.token_url || ''} onChange={(v) => setValue('token_url', v)} placeholder="https://idp.example.com/token" /></Field>
            <Field label="UserInfo URL"><TextField value={draft.userinfo_url || ''} onChange={(v) => setValue('userinfo_url', v)} placeholder="https://idp.example.com/userinfo" /></Field>
            <Field label="Scopes"><TextField value={draft.scopes || ''} onChange={(v) => setValue('scopes', v)} placeholder="openid email profile" /></Field>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <Field label="Allowed domains" hint="Comma-separated. Emails outside these domains are rejected for SSO.">
            <TextField value={draft.allowed_domains || ''} onChange={(v) => setValue('allowed_domains', v)} placeholder="lux.com.au, example.com" />
          </Field>
        </div>

        <SaveBar onSave={() => save()} onReset={reset} saving={saving} saved={saved} error={error} saveLabel="Save SSO configuration" />
      </SectionCard>
    </div>
    </FeatureGate>
  );
}