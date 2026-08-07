# Email Setup Guide

LUX sends outbound email (permit updates, reminders, test messages) through an SMTP server.
This guide explains how to connect your provider, where the settings live, and how to
troubleshoot when something does not work.

---

## How email works in the app

- Outbound mail is sent with **nodemailer** over SMTP (STARTTLS on port 587 or implicit TLS
  on port 465).
- Every send is recorded in the **email log** (`email_logs` table) so you can see what went
  out, to whom, and whether it failed.
- **Email templates** (Automation & Triggers → Email templates) define reusable subjects and
  bodies with `{field}` placeholders filled from the record (e.g. `{reference}`, `{title}`,
  `{status}`). Automation rules with a **Send email** action reference a template by name.

### Where settings are read from

| Source                | Example                                  | Priority |
|-----------------------|------------------------------------------|----------|
| Settings table (in-app UI) | `smtp_host`, `smtp_port`, … stored in the database | 1 (wins) |
| Environment variables | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL`, `SMTP_SECURE` | 2 (fallback) |
| Built-in default      | `smtp.example.com:587`                   | 3        |

The in-app **Settings → Email (SMTP)** card is the easiest place to configure email on the
desktop app. On a headless/server install, the `SMTP_*` environment variables (or a `.env`
file in `backend/`) work the same way — the settings saved in the app simply take priority.

The saved fields are:

| Setting      | Meaning                                              |
|--------------|------------------------------------------------------|
| Host         | SMTP server hostname (e.g. `smtp.gmail.com`)         |
| Port         | `587` (STARTTLS) or `465` (implicit TLS)             |
| Secure       | On = connect with TLS directly (port 465)            |
| Username     | Login / account name for the provider                |
| Password     | Login password or **app password** (see below)       |
| From name    | Display name on outgoing mail (e.g. your company)    |
| From address | Reply/sender address (defaults to the username)      |

---

## 1. Gmail

1. Turn on 2-Step Verification for the sending Google account (required for app passwords).
2. Create an app password: Google Account → **Security → 2-Step Verification → App passwords**
   → select *Mail* and your device → copy the 16-character password.
3. In LUX, set:
   - Host: `smtp.gmail.com`
   - Port: `587`, Secure: **off** (STARTTLS)
   - Username: the full Gmail address (e.g. `plans@company.com.au`)
   - Password: the 16-character app password (spaces optional)
   - From address: the same Gmail address

> Never use your normal Gmail password — Google rejects it with `535 5.7.8 Username and
> Password not accepted`. Only app passwords (or OAuth, not supported) work.

## 2. Microsoft 365 / Outlook

1. Enable an app password or use a mailbox that allows SMTP AUTH (default off for new
   Microsoft 365 tenants; enable SMTP AUTH in the Exchange admin centre if needed).
2. In LUX, set:
   - Host: `smtp.office365.com`
   - Port: `587`, Secure: **off** (STARTTLS)
   - Username: full mailbox address (e.g. `noreply@company.com.au`)
   - Password: mailbox password or app password

## 3. SMTP2GO (recommended for business volume)

1. Create an account, verify your sending domain, and get an SMTP username + password under
   **Sending → SMTP Users**.
2. In LUX, set:
   - Host: `mail.smtp2go.com`
   - Port: `587`, Secure: **off** (or `465` with Secure **on**)
   - Username / Password: the SMTP user credentials
   - From address: anything at your verified domain

SMTP2GO accepts mail from any address on a verified domain and gives you delivery analytics —
useful if email is a core workflow for you.

## 4. Zoho Mail

- Host: `smtp.zoho.com.au` (or `smtp.zoho.com`)
- Port: `587`, Secure: **off** — or `465`, Secure: **on**
- Username / Password: your Zoho mailbox login (app password if 2FA is on)

## 5. Self-hosted / on-premises server

- Host: your server hostname or LAN IP (e.g. `smtp.example.com`)
- Port: `587` (STARTTLS) or `25` (plain — most networks block 25 outbound)
- Username / Password: the mailbox account the server relays as

---

## Testing

1. Open **Settings → Email (SMTP)**, fill in the provider details and press **Save SMTP**.
2. Optionally type a recipient into the **Send test email** box and press **Send**.
3. The result shows the provider message ID on success, or a readable error on failure.
4. Every attempt appears in the **Recent email log** on the same page (last 20 by default):
   check the status there after any send, whether from the UI, an automation rule, or a test.

---

## Troubleshooting

| Error / symptom                                      | Likely cause & fix                                                                 |
|------------------------------------------------------|------------------------------------------------------------------------------------|
| `getaddrinfo ENOTFOUND smtp.example.com`             | The host field still holds the placeholder (or is wrong). Set the real hostname in Settings → Email, or `SMTP_HOST`. |
| `535 5.7.8 Username and Password not accepted`       | Wrong credentials. Gmail/Outlook need an **app password**, not the normal password. |
| `535 5.7.3 Authentication unsuccessful`              | SMTP AUTH disabled for the mailbox/tenant (Microsoft 365). Enable SMTP AUTH for the account. |
| `453 Too many messages` / rate limits                | Provider sending limits reached (e.g. free Gmail ≈ 500/day). Use a business provider. |
| `504 5.7.4 Unrecognized authentication type`         | Provider does not accept the auth method; check you are using login + app password. |
| `SELF_SIGNED_CERT_IN_CHAIN` / `ERR_TLS_CERT_ALTNAME_INVALID` | TLS certificate problem on the server. Use 587/STARTTLS with Secure off, or fix the server certificate. |
| Connection times out on port 25/465                  | Outbound port blocked by your network/ISP. Use port 587 (STARTTLS). |
| Mail sends but lands in spam                         | Set up SPF/DKIM for your sending domain at the provider; use a From address at a domain you control. |
| Test passes but automation emails never arrive       | Check the email log for failed statuses, and confirm the **Send email** rule references a template that exists (templates are resolved by name). |
| Nothing in the email log at all                     | No send was attempted — check the rule conditions fired (Automation & Triggers → Runs). |

If you still get stuck, take a database backup (Settings → Data) and reproduce the send —
the email log plus the exact error message above will tell you which part of the chain failed.

---

## Security notes

- The SMTP password is stored **in the local settings table** (plaintext inside the SQLite
  database). Anyone with file access to the data folder can read it — protect the data
  folder the same way you protect your email account.
- For server deployments, prefer the `SMTP_PASS` **environment variable**; it is never
  exposed in the UI or stored in the database.
- The password is masked in the UI after saving (`has_pass`) — it is not re-sent to the
  browser, so never log or paste it into tickets.
- Email bodies can contain plan data (references, titles, statuses) — recipients are
  whatever the rule/trigger specifies, so keep the recipient lists under control.
