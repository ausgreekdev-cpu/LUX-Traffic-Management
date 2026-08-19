import { useEffect, useState } from 'react';
import api from '../../../api';
import { Field, TextField } from '../../../components/settings/fields';
import SectionCard from '../../../components/settings/SectionCard';
import SaveBar from '../../../components/settings/SaveBar';

const NAV_ITEMS = [
  { key: '/', label: 'Dashboard' }, { key: '/tmps', label: 'TMPs' }, { key: '/projects', label: 'Projects' },
  { key: '/permits', label: 'Permits' }, { key: '/authorities', label: 'Authorities' },
  { key: '/time-tracking', label: 'Time Tracking' }, { key: '/correspondence', label: 'Correspondence' },
  { key: '/analytics', label: 'Analytics' }, { key: '/clients', label: 'Clients' }, { key: '/sites', label: 'Sites' },
  { key: '/settings', label: 'Settings' }, { key: '/help', label: 'Help & FAQ' }
];

const PAGE_TITLES = [
  { key: 'dashboard', label: 'Dashboard' }, { key: 'tmps', label: 'Traffic Management Plans' },
  { key: 'projects', label: 'Projects' }, { key: 'permits', label: 'Permits' },
  { key: 'authorities', label: 'WA Authorities' }, { key: 'time-tracking', label: 'Time Tracking' },
  { key: 'correspondence', label: 'Correspondence' }, { key: 'analytics', label: 'Analytics' },
  { key: 'clients', label: 'Clients' }, { key: 'sites', label: 'Sites' }, { key: 'settings', label: 'Settings' },
  { key: 'help', label: 'Help & FAQ' }, { key: 'workflows', label: 'Workflows' },
  { key: 'automations', label: 'Automation & Triggers' }, { key: 'users', label: 'Users' }
];

const SECTIONS = [
  { key: 'tmp_details', label: 'Details' }, { key: 'tmp_permits', label: 'Permits' },
  { key: 'tmp_documents', label: 'Documents' }, { key: 'tmp_activity', label: 'Activity' },
  { key: 'tmp_agents', label: 'AI agent checks' }, { key: 'permit_details', label: 'Permit Details' },
  { key: 'permit_sla', label: 'SLA Information' }, { key: 'permit_fees', label: 'Fees' },
  { key: 'permit_triggers', label: 'Workflow Triggers' }, { key: 'permit_compliance', label: 'Compliance check' },
  { key: 'permit_contact', label: 'Contact' }
];

const COLUMN_GROUPS = {
  tmps: { reference: 'Reference', title: 'Title', site: 'Site', status: 'Status', type: 'Type', ends: 'Ends', created: 'Created' },
  permits: { tmp: 'TMP', authority: 'Authority', status: 'Status', complexity: 'Complexity', submitted: 'Submitted', expiry: 'Expiry', signal: '30m Signal', mrwa: 'MRWA' },
  clients: { name: 'Name', company: 'Company', email: 'Email', phone: 'Phone' },
  sites: { name: 'Name', road: 'Road', class: 'Class', speed: 'Speed', aadt: 'AADT', suburb: 'Suburb' },
  users: { name: 'Name', email: 'Email', role: 'Role', created: 'Created' },
  time: { date: 'Date', tmp: 'TMP', cost_code: 'Cost Code', description: 'Description', hours: 'Hours', rate: 'Rate', cost: 'Cost', billable: 'Billable' },
  correspondence: { received: 'Received', from: 'From', subject: 'Subject', tmp: 'TMP', extracted: 'Extracted', review: 'Review' }
};

const STATUS_ITEMS = [
  { key: 'draft', label: 'Draft' }, { key: 'submitted', label: 'Submitted' }, { key: 'under_review', label: 'Under review' },
  { key: 'approved', label: 'Approved' }, { key: 'rejected', label: 'Rejected' }, { key: 'expired', label: 'Expired' },
  { key: 'cancelled', label: 'Cancelled' }, { key: 'completed', label: 'Completed' }
];

const COMPLEXITY_ITEMS = [
  { key: 'simple', label: 'Simple' }, { key: 'standard', label: 'Standard' },
  { key: 'complex', label: 'Complex' }, { key: 'complex_with_notice', label: 'Complex + notice' }
];

const parseJson = (s, fb) => { try { return JSON.parse(s); } catch { return fb || {}; } };

function LabelEditor({ items, values, onChange }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
      {items.map(({ key, label }) => (
        <div key={key}>
          <label className="text-xs text-gray-400">{label}</label>
          <input className="input w-full" value={values[key] || ''} placeholder={label}
            onChange={(e) => onChange({ ...values, [key]: e.target.value })} />
        </div>
      ))}
    </div>
  );
}

export default function LabelsLegalTab() {
  const [branding, setBranding] = useState({ app_name: '', login_subtitle: '', footer_text: '', pdf_footer_text: '' });
  const [navLabels, setNavLabels] = useState({});
  const [pageTitles, setPageTitles] = useState({});
  const [sections, setSections] = useState({});
  const [columns, setColumns] = useState({});
  const [statusLabels, setStatusLabels] = useState({});
  const [complexityLabels, setComplexityLabels] = useState({});
  const [legal, setLegal] = useState({ privacy_policy: '', terms_of_service: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.settings.get()
      .then((s) => {
        setBranding({ app_name: s.app_name || '', login_subtitle: s.login_subtitle || '', footer_text: s.footer_text || '', pdf_footer_text: s.pdf_footer_text || '' });
        setNavLabels(parseJson(s.nav_labels_json));
        setPageTitles(parseJson(s.page_titles_json));
        setSections(parseJson(s.sections_json));
        setColumns(parseJson(s.columns_json));
        setStatusLabels(parseJson(s.status_labels_json));
        setComplexityLabels(parseJson(s.complexity_labels_json));
        setLegal({ privacy_policy: s.privacy_policy || '', terms_of_service: s.terms_of_service || '' });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const notify = (msg) => { setSaved(msg); setTimeout(() => setSaved(''), 2500); };
  const runSave = async (fn, message) => {
    setSaving(true);
    try { await fn(); notify(message); } catch (err) { alert(err.message); } finally { setSaving(false); }
  };
  const saveJson = (key, obj, message) => runSave(() => api.settings.update({ [key]: JSON.stringify(obj) }), message);
  const saveScalar = (key, value, message) => runSave(() => api.settings.update({ [key]: String(value) }), message);

  if (loading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div>
      <SectionCard title="App branding" description="Applied to the login screen, sidebar and exported documents. Leave blank to keep defaults.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="App name"><TextField value={branding.app_name} onChange={(v) => setBranding(b => ({ ...b, app_name: v }))} placeholder="LUX Traffic Management" /></Field>
          <Field label="Login subtitle"><TextField value={branding.login_subtitle} onChange={(v) => setBranding(b => ({ ...b, login_subtitle: v }))} placeholder="Traffic management made simple" /></Field>
          <Field label="Footer text" hint="Shown at the bottom of the sidebar."><TextField value={branding.footer_text} onChange={(v) => setBranding(b => ({ ...b, footer_text: v }))} placeholder="© LUX Traffic Management" /></Field>
          <Field label="PDF footer text" hint="Printed at the bottom of exported PDFs."><TextField value={branding.pdf_footer_text} onChange={(v) => setBranding(b => ({ ...b, pdf_footer_text: v }))} placeholder="Confidential — for internal use only" /></Field>
        </div>
        <SaveBar onSave={() => saveScalar('app_name', branding.app_name, 'App branding saved')
          .then(() => saveScalar('login_subtitle', branding.login_subtitle))
          .then(() => saveScalar('footer_text', branding.footer_text))
          .then(() => saveScalar('pdf_footer_text', branding.pdf_footer_text))}
          saving={saving} saved={saved} saveLabel="Save branding" />
      </SectionCard>

      <SectionCard title="Menu names" description="Rename items in the sidebar navigation.">
        <LabelEditor items={NAV_ITEMS} values={navLabels} onChange={setNavLabels} />
        <SaveBar onSave={() => saveJson('nav_labels_json', navLabels, 'Menu names saved')} saving={saving} saved={saved} saveLabel="Save menu names" />
      </SectionCard>

      <SectionCard title="Page titles & sub-category names" description="Rename page headings and section headings on detail pages.">
        <p className="label">Page headings</p>
        <LabelEditor items={PAGE_TITLES} values={pageTitles} onChange={setPageTitles} />
        <p className="label">Detail-page sections</p>
        <LabelEditor items={SECTIONS} values={sections} onChange={setSections} />
        <SaveBar onSave={() => saveJson('page_titles_json', pageTitles, 'Page titles saved')
          .then(() => saveJson('sections_json', sections, 'Section names saved'))}
          saving={saving} saved={saved} saveLabel="Save titles" />
      </SectionCard>

      <SectionCard title="Table columns" description="Rename column headers on the list pages.">
        {Object.entries(COLUMN_GROUPS).map(([page, items]) => (
          <div key={page} className="mb-3">
            <p className="label capitalize">{page}</p>
            <LabelEditor items={Object.entries(items).map(([key, label]) => ({ key, label }))}
              values={columns[page] || {}} onChange={(v) => setColumns(c => ({ ...c, [page]: v }))} />
          </div>
        ))}
        <SaveBar onSave={() => saveJson('columns_json', columns, 'Column names saved')} saving={saving} saved={saved} saveLabel="Save columns" />
      </SectionCard>

      <SectionCard title="Status & complexity labels" description="Rename how statuses and complexity levels are displayed (badge colours stay the same).">
        <p className="label">Statuses</p>
        <LabelEditor items={STATUS_ITEMS} values={statusLabels} onChange={setStatusLabels} />
        <p className="label">Complexity</p>
        <LabelEditor items={COMPLEXITY_ITEMS} values={complexityLabels} onChange={setComplexityLabels} />
        <SaveBar onSave={() => saveJson('status_labels_json', statusLabels, 'Status labels saved')
          .then(() => saveJson('complexity_labels_json', complexityLabels, 'Complexity labels saved'))}
          saving={saving} saved={saved} saveLabel="Save labels" />
      </SectionCard>

      <SectionCard title="Legal content" description="Privacy policy and terms of service — linked from the login screen and shown in Help.">
        <Field label="Privacy policy">
          <textarea rows={5} className="input w-full font-mono text-xs" value={legal.privacy_policy}
            onChange={(e) => setLegal(l => ({ ...l, privacy_policy: e.target.value }))} placeholder="Describe how collected data is used, stored and shared…" />
        </Field>
        <Field label="Terms of service">
          <textarea rows={5} className="input w-full font-mono text-xs" value={legal.terms_of_service}
            onChange={(e) => setLegal(l => ({ ...l, terms_of_service: e.target.value }))} placeholder="Acceptable use, liability, disclaimers…" />
        </Field>
        <SaveBar onSave={() => saveScalar('privacy_policy', legal.privacy_policy, 'Legal content saved')
          .then(() => saveScalar('terms_of_service', legal.terms_of_service))}
          saving={saving} saved={saved} saveLabel="Save legal content" />
      </SectionCard>
    </div>
  );
}