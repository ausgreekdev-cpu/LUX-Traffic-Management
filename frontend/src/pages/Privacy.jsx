export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-3xl font-bold">Privacy Policy — Delux TPM CRM / LUX Field</h1>
      <p className="text-sm text-gray-500 mt-2">Effective: 7 Sep 2026 • AusGreek Developments • Contact: ausgreekdev@gmail.com</p>
      <div className="prose prose-sm mt-6 space-y-4 text-gray-700 dark:text-gray-300">
        <p>Delux TPM CRM and LUX Field (“we”, “us”) respect your privacy. This policy applies to the web app at <a href="https://lux-official.netlify.app" className="text-lux-600 underline">lux-official.netlify.app</a> and the Android field app <code>com.lux.traffic.field</code> on Google Play.</p>
        <h2 className="font-semibold text-gray-900 dark:text-white">Data We Collect</h2>
        <ul className="list-disc ml-6">
          <li><strong>Account</strong>: name, email, role, client linkage, tenant ID (to isolate workspaces). Passwords are bcrypt-hashed.</li>
          <li><strong>Project</strong>: TMPs, sites, permits, time entries, fees, documents.</li>
          <li><strong>Camera / Photos</strong>: site photos you capture via the field app (with optional geotag). Stored via <code>/api/photos</code> and shown in TMP detail / Kanban. You can delete them if your role allows.</li>
          <li><strong>Location</strong>: optional GPS coordinates attached to site photos (ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION). Used only to tag the photo; no background tracking.</li>
          <li><strong>Telemetry</strong>: anonymized usage counters (api_calls_per_day) for billing limits; crash logs are not collected.</li>
        </ul>
        <h2 className="font-semibold text-gray-900 dark:text-white">Permissions (Android)</h2>
        <ul className="list-disc ml-6">
          <li>CAMERA — capture site photos</li>
          <li>ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION — geotag photos (foreground only, with consent)</li>
          <li>READ_MEDIA_IMAGES — pick existing photos</li>
          <li>INTERNET / ACCESS_NETWORK_STATE — sync to <code>https://lux-official.netlify.app</code></li>
        </ul>
        <p className="text-xs">No advertising, no sale of data, no third-party analytics. Data is not used for tracking across apps.</p>
        <h2 className="font-semibold text-gray-900 dark:text-white">Storage & Retention</h2>
        <p>Web/Netlify: SQLite in Netlify Blobs (persisted via snapshot), media via media-store. Desktop: local SQLite. Photos retained until deleted by a Manager/Developer. Backups are encrypted at rest (AES-256-GCM).</p>
        <h2 className="font-semibold text-gray-900 dark:text-white">Your Rights</h2>
        <p>You may request access, correction, or deletion of your account and photos via ausgreekdev@gmail.com. Tenant admins can delete users and assets in Settings → Security.</p>
        <h2 className="font-semibold text-gray-900 dark:text-white">Data Safety (Google Play)</h2>
        <p>We declare in Play Console: Email, Name, Photos, Location (optional, foreground). Data is encrypted in transit (HTTPS) and at rest. No data is shared with third parties. See “Permissions” above for what is collected and why.</p>
        <h2 className="font-semibold text-gray-900 dark:text-white">Children</h2>
        <p>Not directed to children under 13. No knowing collection from children.</p>
        <h2 className="font-semibold text-gray-900 dark:text-white">Changes</h2>
        <p>We will post updates here and bump the Effective date. Material changes will be noted in the app.</p>
        <h2 className="font-semibold text-gray-900 dark:text-white">Contact</h2>
        <p>AusGreek Developments, Perth WA 6000 — <a href="mailto:ausgreekdev@gmail.com" className="text-lux-600 underline">ausgreekdev@gmail.com</a> — Support: <a href="/support" className="text-lux-600 underline">/support</a></p>
      </div>
    </div>
  );
}
