import React, { useState } from 'react';

const guides = [
  {
    id: 'getting-started',
    icon: '🚀',
    title: 'Getting started',
    steps: [
      'Sign in with the account your administrator created for you. If you are the admin, create accounts for your team under <b>Users</b>.',
      'Use the sidebar to navigate: <b>Dashboard</b> shows live stats, recent TMPs and the activity feed; each other item is a workspace for that area.',
      'The <b>notification bell</b> in the top-right shows unread reminders, e.g. TMPs or permits about to expire. Click any notification to jump straight to it.',
      'Start with your first TMP — see the guide below. Everything else (permits, time entries, documents) hangs off a TMP.'
    ]
  },
  {
    id: 'tmps',
    icon: '📋',
    title: 'Creating & managing TMPs',
    steps: [
      'Go to <b>TMPs</b> and press <b>+ New TMP</b>. Fill in the title, site, project, dates and plan type (<i>temporary / permanent / event</i>).',
      'The <b>reference is generated automatically</b> (e.g. <code>TMP-2026-001</code>) — no need to invent one.',
      'Move the plan through its lifecycle: <b>draft → submitted → approved</b> (or <b>rejected</b>) → <b>completed</b> (or <b>cancelled</b>). Change status from the edit form or by selecting rows and using the bulk bar.',
      'Use the filter tabs and search box at the top of the list to narrow results. Export the visible results as CSV with the <b>CSV</b> button.',
      'The detail page shows the full record, linked permits, documents and a live <b>activity log</b> of every change and who made it.',
      'Print or share a plan with <b>Export PDF</b> — the PDF is branded with your company name from Settings.'
    ]
  },
  {
    id: 'permits',
    icon: '📄',
    title: 'Permits, SLAs & fees',
    steps: [
      'Open a TMP and press <b>New Permit</b> (or go to <b>Permits</b> → <b>+ New Permit</b>). Choose the authority, complexity and status.',
      'When a permit is submitted or under review, the app <b>calculates the SLA automatically</b>: assessment days + buffer + public notice days (from the authority’s rules for that complexity) are added to the submission date. The expected date is stored on the permit.',
      'Watch for <b>workflow triggers</b>: the app flags when a site sits within 30&nbsp;m of a signalised intersection (MRWA referral) or when MRWA referral is required but no MRWA permit exists. Resolve these on the permit page as they’re actioned.',
      'Record <b>fees</b> (application, assessment, daily occupancy, lane usage, bond…) and update their status as they are paid, waived or refunded.',
      'Approved permits carry an <b>expiry date</b> — the notification scanner reminds you when they are about to expire or have lapsed.'
    ]
  },
  {
    id: 'stages',
    icon: '🔄',
    title: 'Workflow stages (checklists)',
    steps: [
      'Admins configure the stages every TMP and permit must pass through under <b>Workflows</b> (e.g. “TMP drawing prepared”, “Internal review”, “Public notice issued”).',
      'Each stage is either <b>required</b> or <b>optional</b>. Required stages are enforced: a TMP or permit cannot be marked <b>approved</b> or <b>completed</b> while one is unticked.',
      'Open any TMP or permit detail page to see its <b>workflow checklist</b> — tick stages off as they are completed; the progress bar updates live and records who ticked what and when.',
      'The <b>Dashboard</b> shows a “Needs attention” panel listing active TMPs and permits that still have unticked required stages, so nothing slips through.',
      'Optional stages are tracked for your process but never block status changes — use them for steps that apply only sometimes (e.g. public notice for certain authorities).',
      'Reorder, rename, add or delete stages anytime in <b>Workflows</b>; deleting a stage also removes its checklist entries from existing records.'
    ]
  },
  {
    id: 'bulk',
    icon: '✅',
    title: 'Bulk actions & search',
    steps: [
      'Tick the checkbox on any row in <b>TMPs</b> or <b>Permits</b> to select it. Tick the header checkbox to select the whole page.',
      'A bulk bar appears showing the count. Pick a new status and press <b>Apply</b> to update everything at once, or press <b>Delete</b> to remove them.',
      'Bulk changes are recorded in the activity log, so you always know who moved what and when.',
      'Combine bulk actions with the <b>status filters</b>, <b>authority filter</b> (permits) and <b>search box</b> to process a specific group, e.g. mark all approved TMPs completed at year end.'
    ]
  },
  {
    id: 'documents',
    icon: '📎',
    title: 'Documents & versions',
    steps: [
      'Open a TMP detail page and upload files in the <b>Documents</b> panel. Supported types: <code>.pdf, .doc, .docx, .xls, .xlsx, .dwg, .dxf, .png, .jpg, .jpeg</code> (max 50&nbsp;MB each).',
      'Every upload becomes a <b>version</b> of that document — the newest upload is always the highest version number, so you keep a full history instead of overwriting.',
      'PDFs and images can be <b>previewed in-app</b> with the Preview button; everything else can be downloaded and deleted.',
      'Use versions to track plan revisions through authority review — no more files named <i>final_v3_FINAL</i>.'
    ]
  },
  {
    id: 'time',
    icon: '⏱️',
    title: 'Time tracking',
    steps: [
      'Go to <b>Time Tracking</b> and press <b>+ Log Entry</b> (or equivalent add control). Pick the TMP, cost code, date and duration.',
      'Mark entries as billable or not. Rates can be set per entry; cost is calculated automatically (hours × rate).',
      'Use <b>summary</b> to see totals per TMP, cost code or user, and watch them roll up into the <b>Financial summary</b> on the Analytics page.'
    ]
  },
  {
    id: 'analytics',
    icon: '📈',
    title: 'Analytics & reports',
    steps: [
      'The <b>Analytics</b> page shows approval times, planner throughput, rejection analysis and the financial summary — all filterable by date range.',
      'Export report-ready files from the list pages: <b>CSV</b> (TMPs and permits, respecting current filters), <b>Permits summary PDF</b> and the <b>Audit PDF</b> (a full history of activity from the TMPs page).',
      'Print the per-TMP <b>Export PDF</b> from any TMP detail page for a client-ready document.'
    ]
  },
  {
    id: 'notifications',
    icon: '🔔',
    title: 'Notifications & reminders',
    steps: [
      'The scanner runs automatically when the app opens: it checks every active TMP <b>end date</b> and approved permit <b>expiry date</b> against today.',
      'Reminders fire inside the configured window (default 14&nbsp;days) and also when something has already lapsed without being closed out.',
      'Use the <b>Refresh</b> button in the bell to re-run the scan after changing the window or updating dates.',
      'Unread notifications are counted on the bell badge; open one to jump to the record, or press <b>Mark all read</b>.'
    ]
  },
  {
    id: 'settings',
    icon: '⚙️',
    title: 'Settings & your company',
    steps: [
      '<b>Company profile</b>: set your company name, ABN, phone and email — they are printed on exported PDFs.',
      '<b>Reminders</b>: change how many days before an end/expiry a reminder is created.',
      '<b>Appearance</b>: switch between light and dark theme (your choice is saved).',
      '<b>Data</b>: download a complete database backup anytime. Keep backups somewhere safe and make a habit of taking one before major changes.'
    ]
  },
  {
    id: 'users',
    icon: '🔐',
    title: 'Users & roles',
    steps: [
      'Only <b>admins</b> see the Users page. Add team members with their email and a starting password.',
      '<b>Admin</b> — full access, including user management. <b>Planner</b> — creates and manages TMPs, permits and records. <b>Viewer</b> — read-only.',
      'Roles can be changed later from the same page (Edit). Deleted users keep their history in activity logs.'
    ]
  }
];

const faqs = [
  {
    q: 'Where is my data stored?',
    a: 'Everything lives in a local SQLite database inside the app’s data folder (per-user, e.g. %APPDATA%\\LUX Traffic Management). It is not sent to any cloud service. Use Settings → Data → Download database backup to keep a copy.'
  },
  {
    q: 'How do I restore a database backup?',
    a: 'Backups are for safety and record-keeping — the app currently supports download only. Keep the file somewhere secure; if you ever need to move to a new machine, the backup file is the complete database.'
  },
  {
    q: 'Why don’t I see a reminder for a TMP that ends soon?',
    a: 'The scan runs when the app starts. Press Refresh in the notification bell to re-run it, and check the reminder window in Settings — if the end date is further out than the window, no reminder is created yet. Also check the TMP isn’t already marked completed or cancelled (those are skipped).'
  },
  {
    q: 'How are SLA dates calculated?',
    a: 'For each authority and complexity (simple, standard, complex, complex with notice) an SLA rule defines assessment days, optional public-notice days and buffer days. On submit, the app adds all three to the submission date and stores the expected date on the permit.'
  },
  {
    q: 'What are the MRWA / 30m signalised intersection triggers?',
    a: 'Workflow triggers are automatic flags: if a site is within 30&nbsp;m of a signalised intersection, the app flags that an MRWA referral may be required; it also flags when a permit needs MRWA referral but no MRWA permit exists. Resolve each trigger on the permit page once actioned.'
  },
  {
    q: 'Why can’t I upload a .zip or .dwg copy of the plan?',
    a: 'Only .pdf, .doc, .docx, .xls, .xlsx, .dwg, .dxf, .png, .jpg and .jpeg files are accepted, up to 50&nbsp;MB each. Convert or rename files to one of these formats before uploading.'
  },
  {
    q: 'What can a viewer do?',
    a: 'Viewers can read everything and export reports, but cannot create, edit or delete records. If your role is viewer you will not see buttons such as New TMP or Edit — ask an admin to raise your role if you need it.'
  },
  {
    q: 'Why can’t I delete a TMP?',
    a: 'TMPs that have permits linked to them cannot be deleted until those permits are removed first — this protects the audit trail. Delete the permits from the Permits page, then delete the TMP.'
  },
  {
    q: 'Where do exported files go?',
    a: 'PDF and CSV exports download to your browser’s default download folder (on Windows: Downloads).'
  },
  {
    q: 'What is a cost code in Time Tracking?',
    a: 'Cost codes identify what work an entry relates to (set up per authority). They let you group and summarise time — and they drive the billable totals in Analytics.'
  },
  {
    q: 'Does the app notify me in any other way?',
    a: 'Currently notifications are in-app only (the bell in the top-right). They refresh automatically once a minute while you are signed in.'
  },
  {
    q: 'Why can’t I mark a TMP or permit as approved?',
    a: 'The record has required workflow stages that are still unticked. Open the detail page, complete the required checklist items (the amber note lists them), then change the status again. Optional stages never block approval — only required ones do.'
  },
  {
    q: 'Can every user tick workflow checklist items?',
    a: 'Yes — anyone with access can tick a stage off and mark it done. Only admins can edit the stage definitions themselves (add, rename, reorder, make optional/required) on the Workflows page.'
  },
  {
    q: 'Why do my changes seem to disappear after restart? What should I check?',
    a: 'Make sure you are not running two copies of the app against different data folders (e.g. one installed, one portable), and take a database backup from Settings before experimenting. The installed and portable builds each use their own data folder.'
  }
];

export default function Help() {
  const [query, setQuery] = useState('');
  const [openGuide, setOpenGuide] = useState('getting-started');
  const [openFaqs, setOpenFaqs] = useState(new Set());

  const q = query.trim().toLowerCase();
  const filterText = (s) => q === '' || s.toLowerCase().includes(q);
  const filteredGuides = guides.filter(g => filterText(g.title) || g.steps.some(s => filterText(s.replace(/<[^>]+>/g, ''))));
  const filteredFaqs = faqs.filter(f => filterText(f.q) || filterText(f.a));

  const toggleFaq = (i) => setOpenFaqs(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Help & Tutorials</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Step-by-step guides for the whole workflow, plus answers to common questions.</p>
      </div>

      <input
        placeholder="Search guides and FAQ…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800"
      />

      <section>
        <h2 className="text-lg font-semibold mb-3">How-to guides</h2>
        {filteredGuides.length === 0 ? (
          <p className="text-gray-500 text-sm">No guides match “{query}”.</p>
        ) : (
          <div className="space-y-3">
            {filteredGuides.map(g => {
              const open = openGuide === g.id;
              return (
                <div key={g.id} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                  <button onClick={() => setOpenGuide(open ? null : g.id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <span><span className="mr-2">{g.icon}</span>{g.title}</span>
                    <span className="text-gray-400">{open ? '−' : '+'}</span>
                  </button>
                  {open && (
                    <ol className="px-4 pb-4 space-y-3 text-sm text-gray-700 dark:text-gray-300 list-decimal list-inside">
                      {g.steps.map((step, i) => (
                        <li key={i} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: step }} />
                      ))}
                    </ol>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Frequently asked questions</h2>
        {filteredFaqs.length === 0 ? (
          <p className="text-gray-500 text-sm">No FAQ items match “{query}”.</p>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden divide-y dark:divide-gray-700">
            {filteredFaqs.map((f, i) => {
              const open = openFaqs.has(i);
              return (
                <div key={i}>
                  <button onClick={() => toggleFaq(i)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <span>{f.q}</span>
                    <span className="text-gray-400">{open ? '−' : '+'}</span>
                  </button>
                  {open && <p className="px-4 pb-3 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{f.a}</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
