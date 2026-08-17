import { useCallback, useEffect, useState } from 'react';
import api from '../api';
import { useBranding } from '../context/Branding';
import ThemeEditor from '../components/branding/ThemeEditor';
import AssetsManager from '../components/branding/AssetsManager';
import FontManager from '../components/branding/FontManager';
import PdfLayoutBuilder from '../components/branding/PdfLayoutBuilder';
import WatermarkControls from '../components/branding/WatermarkControls';
import EmailBranding from '../components/branding/EmailBranding';
import DomainManager from '../components/branding/DomainManager';
import CssOverride from '../components/branding/CssOverride';
import PreviewPanel from '../components/branding/PreviewPanel';

const TABS = [
  { id: 'theme', label: 'Theme' },
  { id: 'assets', label: 'Typography & Assets' },
  { id: 'pdf', label: 'PDF Stamping' },
  { id: 'email', label: 'Email & Domain' },
  { id: 'advanced', label: 'Advanced CSS' }
];

export default function Branding() {
  const { refresh } = useBranding();
  const [tab, setTab] = useState('theme');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const [theme, setTheme] = useState({});
  const [typography, setTypography] = useState({});
  const [pdfLayout, setPdfLayout] = useState({ header: [], footer: [] });
  const [watermark, setWatermark] = useState({});
  const [email, setEmail] = useState({});
  const [cssOverride, setCssOverride] = useState('');
  const [assets, setAssets] = useState([]);
  const [versions, setVersions] = useState([]);
  const [domains, setDomains] = useState([]);

  const load = useCallback(async () => {
    try {
      const full = await api.branding.full();
      setTheme(full.theme || {});
      setTypography(full.typography || {});
      setPdfLayout(full.pdf_layout || { header: [], footer: [] });
      setWatermark(full.watermark || {});
      setEmail(full.email || {});
      setCssOverride(full.css_override || '');
      setAssets(full.assets || []);
      setVersions(full.versions || []);
      setDomains(full.domains || []);
      setError('');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const flashNotice = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const saveSection = async (section) => {
    setSaving(true);
    try {
      const res = await api.branding.save(section);
      flashNotice(`Saved — version v${res.css_version}`);
      await Promise.all([load(), refresh()]);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const handleReset = async () => {
    try {
      await api.branding.reset();
      flashNotice('Branding reset to defaults');
      await Promise.all([load(), refresh()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRestore = async (id) => {
    try {
      await api.branding.restoreVersion(id);
      flashNotice('Version restored');
      await Promise.all([load(), refresh()]);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="text-gray-500">Loading branding…</div>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Branding & Themes</h1>
          <p className="text-sm text-gray-500">White-label the portal, exported PDFs and email — changes apply instantly.</p>
        </div>
        <div className="flex items-center gap-2">
          {notice && <span className="text-sm text-green-600">{notice}</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700 mb-4">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id
              ? 'border-lux-500 text-lux-600 dark:text-lux-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="min-w-0">
          {tab === 'theme' && <ThemeEditor value={theme} onChange={setTheme} onSave={t => saveSection({ theme: t })} saving={saving} />}
          {tab === 'assets' && (
            <div className="space-y-4">
              <FontManager typography={typography} onChange={setTypography} onSave={t => saveSection({ typography: t })} saving={saving} onError={setError} />
              <AssetsManager assets={assets} onChanged={load} onError={setError} />
            </div>
          )}
          {tab === 'pdf' && (
            <div className="space-y-4">
              <PdfLayoutBuilder pdfLayout={pdfLayout} onChange={setPdfLayout} onSave={p => saveSection({ pdf_layout: p })} saving={saving} />
              <WatermarkControls watermark={watermark} onChange={setWatermark} onSave={w => saveSection({ watermark: w })} saving={saving} />
            </div>
          )}
          {tab === 'email' && (
            <div className="space-y-4">
              <EmailBranding email={email} onChange={setEmail} onSave={e => saveSection({ email: e })} saving={saving} />
              <DomainManager domains={domains} onChanged={load} onError={setError} />
            </div>
          )}
          {tab === 'advanced' && (
            <CssOverride cssOverride={cssOverride} onChange={setCssOverride} onSave={c => saveSection({ css_override: c })}
              saving={saving} versions={versions} onRestore={handleRestore} onReset={handleReset} />
          )}
        </div>
        <div className="min-w-0">
          <PreviewPanel pdfLayout={pdfLayout} watermark={watermark} assets={assets} />
        </div>
      </div>
    </div>
  );
}
