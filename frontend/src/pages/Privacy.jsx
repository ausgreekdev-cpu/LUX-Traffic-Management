export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-3xl font-bold">Privacy Policy — Delux TPM CRM</h1>
      <p className="text-sm text-gray-500 mt-2">Effective: 27 Aug 2026 • AusGreek Developments</p>
      <div className="prose prose-sm mt-6 space-y-4">
        <p>Delux TPM CRM (“we”, “us”) respects your privacy. This policy describes how we handle traffic management data, user accounts, and telemetry.</p>
        <h2 className="font-semibold">Data We Collect</h2>
        <ul className="list-disc ml-6"><li>Account: name, email, role, client linkage</li><li>Project: TMPs, sites, permits, time entries, photos, branding assets</li><li>Telemetry: anonymized usage counters for billing limits</li></ul>
        <h2 className="font-semibold">Storage</h2>
        <p>Data is stored in SQLite (local/Electron) or Netlify Blobs (cloud) with WAL. Photos and branding assets are stored via media-store. No data is sold.</p>
        <h2 className="font-semibold">Contact</h2>
        <p>privacy@ausgreek.dev — AusGreek Developments, Perth WA 6000</p>
      </div>
    </div>
  );
}
