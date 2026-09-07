export default function Support() {
  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-3xl font-bold">Support — Delux TPM CRM</h1>
      <p className="mt-2">Need help with TMPs, permits, or billing? Contact AusGreek Developments.</p>
      <ul className="mt-4 space-y-2 text-sm">
        <li><strong>Email:</strong> ausgreekdev@gmail.com</li>
        <li><strong>Privacy:</strong> <a href="/privacy" className="text-lux-600 underline">/privacy</a> (also at https://lux-official.netlify.app/privacy)</li>
        <li><strong>Docs:</strong> /help, /docs/store.md (Microsoft Store), /docs/server-deployment.md</li>
        <li><strong>Billing:</strong> /billing → Customer Portal (upgrade/cancel/seats)</li>
        <li><strong>Admin Override:</strong> /admin/override (developer only)</li>
      </ul>
    </div>
  );
}
