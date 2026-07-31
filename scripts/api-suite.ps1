<#
  LUX Traffic Management - API regression suite.

  Usage:
    1. Start the app (dev or packaged) on port 3001. For an isolated run against a copy of
       your data, set DB_PATH before starting the app, e.g.:
         $env:DB_PATH = "$env:TEMP\api-test.db"; npm run electron:dev
    2. powershell -ExecutionPolicy Bypass -File scripts\api-suite.ps1

  The suite requires two test users (admin@test.com/adminpass, planner@test.com/planpass).
  If they are missing it seeds them automatically into the database the app is using
  (DB_PATH if set, else backend/data/tmpcms.db). It creates and deletes its own test
  records; run it against a copy of your data to be safe.
  Exits 1 if any check fails.
#>
param(
  [string]$Base = $env:LUX_API_BASE,
  [string]$TestDbPath = $env:DB_PATH
)
if (-not $Base) { $Base = 'http://localhost:3001' }
if (-not $TestDbPath) { $TestDbPath = Join-Path $PSScriptRoot '..\backend\data\tmpcms.db' }
$repoRoot = Split-Path $PSScriptRoot -Parent
$ErrorActionPreference = 'Continue'
$pass = 0; $fail = 0; $results = @()
function Check($name, $ok, $detail = '') {
  if ($ok) { $script:pass++; $script:results += "PASS  $name" }
  else { $script:fail++; $script:results += "FAIL  $name  $detail" }
}
function Api($method, $path, $token = $null, $body = $null) {
  $h = @{}
  if ($token) { $h['Authorization'] = "Bearer $token" }
  try {
    $p = @{ Method = $method; Uri = "$Base$path"; Headers = $h; TimeoutSec = 30 }
    if ($body -ne $null) { $p['ContentType'] = 'application/json'; $p['Body'] = $body }
    $r = Invoke-WebRequest -UseBasicParsing @p
    [pscustomobject]@{ Status = $r.StatusCode; Headers = $r.Headers; Text = $r.Content }
  } catch {
    $c = $_.Exception.Response
    $st = if ($c) { [int]$c.StatusCode } else { 0 }
    $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } elseif ($c) { try { $sr = New-Object IO.StreamReader($c.GetResponseStream()); $sr.ReadToEnd() } catch { '' } } else { $_.Exception.Message }
    [pscustomobject]@{ Status = $st; Headers = @{}; Text = $msg }
  }
}
function Json($r) { try { $r.Text | ConvertFrom-Json } catch { $null } }
function J($o) { $o | ConvertTo-Json -Compress -Depth 5 }
function Post($path, $token, $o) { Api POST $path $token (J $o) }
function Put($path, $token, $o) { Api PUT $path $token (J $o) }
function SeedTestUsers {
  $seedScript = Join-Path $repoRoot 'backend\scripts\seed-test-users.cjs'
  $env:DB_PATH = $TestDbPath
  & 'node' $seedScript 2>$null
  if ($LASTEXITCODE -ne 0) {
    $env:ELECTRON_RUN_AS_NODE = '1'
    & (Join-Path $repoRoot 'node_modules\.bin\electron.cmd') $seedScript
    Remove-Item Env:\ELECTRON_RUN_AS_NODE
  }
  Remove-Item Env:\DB_PATH
}

# ---------- bootstrap ----------
$h = Api GET '/api/health'
if ($h.Status -ne 200) {
  Write-Host "ERROR: no app on $Base (health got $($h.Status)). Start the app first (dev: npm run electron:dev; packaged: LUX Traffic Management.exe)."
  exit 1
}
$a = Api POST '/api/auth/login' $null '{"email":"admin@test.com","password":"adminpass"}'
if ($a.Status -ne 200) {
  Write-Host 'Test users missing - seeding...'
  SeedTestUsers
  $a = Api POST '/api/auth/login' $null '{"email":"admin@test.com","password":"adminpass"}'
}
if ($a.Status -ne 200) {
  Write-Host "ERROR: cannot login admin@test.com. The app must run against the seeded DB (start it with DB_PATH=$TestDbPath) or against backend/data/tmpcms.db."
  exit 1
}

# ---------- public ----------
Check 'GET /api/health' ($h.Status -eq 200) "got $($h.Status)"
$root = Api GET '/'; Check 'GET / frontend served' ($root.Status -eq 200 -and $root.Text -match 'root') "got $($root.Status)"
Check 'frontend assets referenced' ($root.Text -match '/assets/') 'no /assets/ in html'
$m = [regex]::Match($root.Text, '(/assets/[^"]+\.js)')
Check 'frontend JS asset served' ($m.Success -and (Api GET $m.Groups[1].Value).Status -eq 200) 'asset missing'

# ---------- auth ----------
$b = Api POST '/api/auth/login' $null '{"email":"nobody@test.com","password":"x"}'
Check 'login wrong creds -> 401' ($b.Status -eq 401) "got $($b.Status)"
$a = Api POST '/api/auth/login' $null '{"email":"admin@test.com","password":"adminpass"}'
Check 'login admin' ($a.Status -eq 200 -and (Json $a).token) "got $($a.Status)"
$adminToken = (Json $a).token
$p = Api POST '/api/auth/login' $null '{"email":"planner@test.com","password":"planpass"}'
Check 'login planner' ($p.Status -eq 200 -and (Json $p).token) "got $($p.Status)"
$planToken = (Json $p).token
Check 'dashboard without token -> 401' ((Api GET '/api/dashboard').Status -eq 401) 'no'

# ---------- users (admin only) ----------
Check 'users list (admin)' ((Api GET '/api/users' $adminToken).Status -eq 200) 'no'
Check 'users list (planner) -> 403' ((Api GET '/api/users' $planToken).Status -eq 403) 'no'
$r = Post '/api/users' $adminToken @{ email = 't-user@test.com'; password = 'pass1234'; name = 'Test User'; role = 'viewer' }
Check 'create user (admin)' ($r.Status -eq 201) "got $($r.Status) $($r.Text)"
$tuId = (Json $r).id
$r = Put "/api/users/$tuId" $adminToken @{ name = 'Test User 2'; role = 'viewer' }
Check 'update user' ($r.Status -eq 200 -and (Json $r).name -eq 'Test User 2') "got $($r.Status) $($r.Text)"
Check 'delete user (no refs)' ((Api DELETE "/api/users/$tuId" $adminToken).Status -eq 200) 'no'
$r = Post '/api/users' $adminToken @{ email = "t-user2-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())@test.com"; password = 'pass1234'; name = 'TMP Owner' }
Check 'create user 2' ($r.Status -eq 201) "got $($r.Status)"
$tu2Id = (Json $r).id

# ---------- clients ----------
$r = Post '/api/clients' $adminToken @{ name = 'Test Client'; company = 'Test Co'; email = 't@t.com'; phone = '0400000000'; address = '1 Test St'; abn = 'ABN-1' }
Check 'create client' ($r.Status -eq 201) "got $($r.Status) $($r.Text)"
$cliId = (Json $r).id
$r = Post '/api/clients' $planToken @{ name = 'Planner Client' }
Check 'create client (planner allowed)' ($r.Status -eq 201) "got $($r.Status) $($r.Text)"
$cliPId = (Json $r).id
$r = Put "/api/clients/$cliId" $adminToken @{ name = 'Test Client Renamed' }
Check 'update client' ($r.Status -eq 200 -and (Json $r).name -eq 'Test Client Renamed') "got $($r.Status) $($r.Text)"
$r = Api GET '/api/clients' $adminToken
Check 'list clients' ($r.Status -eq 200 -and $r.Text -match [regex]::Escape($cliId)) "got $($r.Status)"
Check 'delete client (no refs)' ((Api DELETE "/api/clients/$cliPId" $adminToken).Status -eq 200) 'no'

# ---------- sites ----------
$r = Post '/api/sites' $adminToken @{ name = 'Test Site'; road_name = '1 Test Rd'; suburb = 'Perth'; state = 'WA'; postcode = '6000' }
Check 'create site' ($r.Status -eq 201) "got $($r.Status) $($r.Text)"
$siteId = (Json $r).id
$r = Put "/api/sites/$siteId" $adminToken @{ name = 'Test Site 2' }
Check 'update site' ($r.Status -eq 200 -and (Json $r).name -eq 'Test Site 2') "got $($r.Status) $($r.Text)"

# ---------- projects ----------
$r = Post '/api/projects' $adminToken @{ name = 'Test Project'; description = 'd'; client_id = $cliId; site_id = $siteId; status = 'active'; start_date = '2026-07-01' }
Check 'create project' ($r.Status -eq 201) "got $($r.Status) $($r.Text)"
$projId = (Json $r).id
$r = Put "/api/projects/$projId" $adminToken @{ name = 'Test Project 2'; status = 'active' }
Check 'update project' ($r.Status -eq 200 -and (Json $r).name -eq 'Test Project 2') "got $($r.Status) $($r.Text)"
Check 'delete client with project -> 400' ((Api DELETE "/api/clients/$cliId" $adminToken).Status -eq 400) 'no'
Check 'delete site with project -> 400' ((Api DELETE "/api/sites/$siteId" $adminToken).Status -eq 400) 'no'

# ---------- authorities ----------
$r = Post '/api/authorities' $adminToken @{ name = 'Test Authority'; short_name = 'TA'; type = 'lga'; email = 'ta@t.com' }
Check 'create authority' ($r.Status -eq 201) "got $($r.Status) $($r.Text)"
$authId = (Json $r).id
$r = Put "/api/authorities/$authId" $adminToken @{ name = 'Test Authority 2'; short_name = 'TA'; type = 'lga' }
Check 'update authority' ($r.Status -eq 200 -and (Json $r).name -eq 'Test Authority 2') "got $($r.Status) $($r.Text)"
$r = Post "/api/authorities/$authId/sla-rules" $adminToken @{ authority_id = $authId; complexity = 'standard'; assessment_days = 10; buffer_days = 2 }
Check 'create sla rule' ($r.Status -eq 201) "got $($r.Status) $($r.Text)"
$r = Api GET "/api/authorities/$authId/sla-rules" $adminToken
Check 'list sla rules' ($r.Status -eq 200 -and (Json $r).Count -ge 1) "got $($r.Status)"

# ---------- WA Local Government Directory ----------
$r = Post '/api/authorities' $adminToken @{ name = 'Directory Test Council'; short_name = 'DirTest'; type = 'lga'; council_type = 'town'; band = 2; mayor = 'Mayor One'; ceo = 'CEO Two'; councillors = @(@{ name = 'Cr Three'; ward = 'North'; term = '2027' }); suburbs = @(@{ name = 'Dirville'; postcode = '6000' }); statistics = @{ population = 1234 } }
Check 'create authority with directory fields' ($r.Status -eq 201) "got $($r.Status) $($r.Text)"
$dirId = (Json $r).id
$r = Api GET "/api/authorities/$dirId" $adminToken
$one = Json $r
Check 'directory fields persisted' ($one.band -eq 2 -and $one.mayor -eq 'Mayor One' -and $one.councillors.Count -eq 1 -and $one.councillors[0].ward -eq 'North' -and $one.suburbs.Count -eq 1 -and $one.statistics.population -eq 1234) "got band=$($one.band) mayor=$($one.mayor) c=$($one.councillors.Count) s=$($one.suburbs.Count) pop=$($one.statistics.population)"
$r = Put "/api/authorities/$dirId" $adminToken @{ name = 'Directory Test Council'; mayor = 'Mayor Updated' }
Check 'update directory field partial' ($r.Status -eq 200 -and (Json $r).mayor -eq 'Mayor Updated' -and (Json $r).band -eq 2) "got $($r.Status)"
$r = Post '/api/authorities/import-directory' $planToken @{}
Check 'import directory requires admin' ($r.Status -eq 403) "got $($r.Status)"
$r = Post '/api/authorities/import-directory' $adminToken @{}
Check 'import directory missing file -> 400' ($r.Status -eq 400) "got $($r.Status)"
$r = Api DELETE "/api/authorities/$dirId" $adminToken
Check 'delete directory test authority' ($r.Status -eq 200) "got $($r.Status)"

# ---------- TMPs ----------
$r = Post '/api/tmps' $adminToken @{ title = 'Test TMP'; plan_type = 'temporary'; status = 'draft'; description = 'facet test'; project_id = $projId; site_id = $siteId; start_date = '2026-07-01'; end_date = '2026-08-01' }
Check 'create tmp' ($r.Status -eq 201) "got $($r.Status) $($r.Text)"
$tmpId = (Json $r).id
Check 'create tmp invalid -> 400' ((Api POST '/api/tmps' $adminToken '{"title":""}').Status -eq 400) 'no'
$r = Api GET "/api/tmps/$tmpId" $adminToken
Check 'get tmp' ($r.Status -eq 200 -and (Json $r).title -eq 'Test TMP') "got $($r.Status)"
$r = Put "/api/tmps/$tmpId" $adminToken @{ title = 'Test TMP'; status = 'submitted' }
Check 'tmp status -> submitted' ($r.Status -eq 200 -and (Json $r).status -eq 'submitted') "got $($r.Status) $($r.Text)"
$r = Put "/api/tmps/$tmpId" $adminToken @{ title = 'Test TMP'; status = 'approved' }
Check 'tmp approve blocked -> 400' ($r.Status -eq 400 -and $r.Text -match 'Incomplete') "got $($r.Status) text=$($r.Text)"
$cl = Api GET "/api/workflows/checklist/tmp/$tmpId" $adminToken
$items = Json $cl
Check 'tmp checklist seeded' ($cl.Status -eq 200 -and $items.data.Count -ge 2) "got $($cl.Status)"
$req = @($items.data | Where-Object { -not $_.is_optional })
Check 'tmp checklist has required stages' ($req.Count -ge 1) "got $($req.Count)"
$t = $null
foreach ($s in $req) { $t = Post "/api/workflows/checklist/tmp/$tmpId" $adminToken @{ stageId = $s.id; done = $true } }
Check 'tick required tmp stages' ($t.Status -eq 200) "got $($t.Status) $($t.Text)"
$r = Put "/api/tmps/$tmpId" $adminToken @{ title = 'Test TMP'; status = 'approved' }
Check 'tmp approve after stages' ($r.Status -eq 200 -and (Json $r).status -eq 'approved') "got $($r.Status) $($r.Text)"
$u = $null
foreach ($s in ($items.data | Where-Object { $_.is_optional })) { $u = Post "/api/workflows/checklist/tmp/$tmpId" $adminToken @{ stageId = $s.id; done = $true } }
Check 'tick optional tmp stage' ($u.Status -eq 200) "got $($u.Status)"
$cl2 = Json (Api GET "/api/workflows/checklist/tmp/$tmpId" $adminToken)
Check 'checklist required_complete flag' ($cl2.required_complete -eq $true) 'flag false'

# ---------- permits ----------
$r = Post '/api/permits' $adminToken @{ tmp_id = $tmpId; authority_id = 'does-not-exist'; status = 'draft' }
Check 'permit create bad authority -> 400' ($r.Status -eq 400 -and $r.Text -match 'Authority not found') "got $($r.Status) $($r.Text)"
$r = Post '/api/permits' $adminToken @{ tmp_id = 'does-not-exist'; authority_id = $authId; status = 'draft' }
Check 'permit create bad tmp -> 404' ($r.Status -eq 404) "got $($r.Status)"
$r = Post '/api/permits' $adminToken @{ tmp_id = $tmpId; authority_id = $authId; status = 'draft'; complexity = 'standard' }
Check 'create permit' ($r.Status -eq 201) "got $($r.Status) $($r.Text)"
$permitId = (Json $r).id
$r = Put "/api/permits/$permitId" $adminToken @{ tmp_id = $tmpId; authority_id = $authId; status = 'approved'; complexity = 'standard' }
Check 'permit approve blocked -> 400' ($r.Status -eq 400 -and $r.Text -match 'Incomplete') "got $($r.Status) $($r.Text)"
$pcl = Json (Api GET "/api/workflows/checklist/permit/$permitId" $adminToken)
$preq = @($pcl.data | Where-Object { -not $_.is_optional })
$pt = $null
foreach ($s in $preq) { $pt = Post "/api/workflows/checklist/permit/$permitId" $adminToken @{ stageId = $s.id; done = $true } }
Check 'tick required permit stages' ($pt.Status -eq 200) "got $($pt.Status) $($pt.Text)"
$r = Put "/api/permits/$permitId" $adminToken @{ tmp_id = $tmpId; authority_id = $authId; status = 'approved'; complexity = 'standard' }
Check 'permit approve after stages' ($r.Status -eq 200 -and (Json $r).status -eq 'approved') "got $($r.Status) $($r.Text)"
Check 'delete authority with permit -> 400' ((Api DELETE "/api/authorities/$authId" $adminToken).Status -eq 400) 'no'

# ---------- fees / triggers ----------
$r = Post "/api/permits/$permitId/fees" $adminToken @{ fee_type = 'application_fee'; amount = 250; status = 'pending' }
Check 'create permit fee' ($r.Status -eq 201) "got $($r.Status) $($r.Text)"
$r = Api GET "/api/permits/$permitId/fees" $adminToken
Check 'list permit fees' ($r.Status -eq 200 -and (Json $r).Count -ge 1) "got $($r.Status)"
$r = Api GET "/api/permits/$permitId/triggers" $adminToken
Check 'list permit triggers' ($r.Status -eq 200) "got $($r.Status)"
$r = Api GET "/api/permits/calculate-sla/$authId" $adminToken
Check 'calculate sla' ($r.Status -eq 200) "got $($r.Status)"

# ---------- time entries ----------
$r = Post '/api/time-entries' $adminToken @{ tmp_id = $tmpId; cost_code = 'ADMIN'; description = 'facet'; duration_hours = 1.5; rate_per_hour = 50; is_billable = $true; date = '2026-07-01' }
Check 'create time entry' ($r.Status -eq 201) "got $($r.Status) $($r.Text)"
$teId = (Json $r).id
Check 'list time entries' ((Api GET '/api/time-entries' $adminToken).Status -eq 200) 'no'
$r = Put "/api/time-entries/$teId" $adminToken @{ tmp_id = $tmpId; cost_code = 'ADMIN'; description = 'facet2'; duration_hours = 2; date = '2026-07-01' }
Check 'update time entry' ($r.Status -eq 200 -and (Json $r).description -eq 'facet2') "got $($r.Status) $($r.Text)"
Check 'time entries summary' ((Api GET '/api/time-entries/summary' $adminToken).Status -eq 200) 'no'
Check 'cost codes' ((Api GET '/api/time-entries/cost-codes' $adminToken).Status -eq 200) 'no'

# ---------- documents ----------
$r = Api GET "/api/documents/tmp/$tmpId" $adminToken
Check 'documents list' ($r.Status -eq 200) "got $($r.Status) $($r.Text)"

# ---------- dashboard ----------
$r = Api GET '/api/dashboard' $adminToken; $dj = Json $r
Check 'dashboard stats' ($r.Status -eq 200 -and $dj.stats.totalTmps -is [int]) "got $($r.Status)"
Check 'dashboard workflowAttention' ($dj.workflowAttention -is [array]) 'missing'

# ---------- analytics ----------
foreach ($ep in @('/api/analytics/approval-times', '/api/analytics/planner-throughput', '/api/analytics/rejection-analysis', '/api/analytics/financial-summary', '/api/analytics/dashboard')) {
  $r = Api GET $ep $adminToken; Check "analytics $($ep.Split('/')[-1])" ($r.Status -eq 200) "got $($r.Status)"
}

# ---------- exports ----------
$r = Api GET "/api/export/tmp/$tmpId" $adminToken
Check 'export tmp pdf' ($r.Status -eq 200 -and $r.Headers['Content-Type'] -match 'pdf') "got $($r.Status)"
$r = Api GET '/api/export/audit-report' $adminToken
Check 'export audit pdf' ($r.Status -eq 200 -and $r.Headers['Content-Type'] -match 'pdf') "got $($r.Status)"
$r = Api GET '/api/export/permits-summary' $adminToken
Check 'export permits summary pdf' ($r.Status -eq 200 -and $r.Headers['Content-Type'] -match 'pdf') "got $($r.Status)"
$r = Api GET '/api/export/tmps-csv' $adminToken
Check 'export tmps csv' ($r.Status -eq 200 -and $r.Headers['Content-Type'] -match 'csv') "got $($r.Status)"
$r = Api GET '/api/export/permits-csv' $adminToken
Check 'export permits csv' ($r.Status -eq 200 -and $r.Headers['Content-Type'] -match 'csv') "got $($r.Status)"
$r = Api GET '/api/export/db-backup' $adminToken
Check 'export db backup' ($r.Status -eq 200) "got $($r.Status)"

# ---------- notifications ----------
$r = Api POST '/api/notifications/scan' $adminToken
Check 'notification scan' ($r.Status -eq 200) "got $($r.Status) $($r.Text)"
Check 'unread count' ((Api GET '/api/notifications/unread-count' $adminToken).Status -eq 200) 'no'
$r = Api GET '/api/notifications' $adminToken; $notifs = Json $r
Check 'notifications list' ($r.Status -eq 200) "got $($r.Status)"
if ($notifs -is [array] -and $notifs.Count -gt 0) {
  $nid = $notifs[0].id; $owner = $notifs[0].user_id
  if ($owner -ne 'u-tadmin') {
    Check 'cross-user notification read -> 403' ((Api POST "/api/notifications/$nid/read" $planToken).Status -eq 403) 'no'
  }
  Check 'notification read (owner)' ((Api POST "/api/notifications/$nid/read" $adminToken).Status -eq 200) 'no'
} else { Check 'notification read path' $true 'skip - none created' }
Check 'notification read-all' ((Api POST '/api/notifications/read-all' $adminToken).Status -eq 200) 'no'

# ---------- settings ----------
$r = Api GET '/api/settings' $adminToken; $before = (Json $r).reminder_days
Check 'settings get' ($r.Status -eq 200) "got $($r.Status)"
$r = Put '/api/settings' $adminToken @{ reminder_days = 5 }
Check 'settings put' ($r.Status -eq 200) "got $($r.Status) $($r.Text)"
$r = Api GET '/api/settings' $adminToken
Check 'settings persisted' ((Json $r).reminder_days -eq 5) "got $((Json $r).reminder_days)"
if ($before -ne $null) { Put '/api/settings' $adminToken @{ reminder_days = $before } | Out-Null }

# ---------- workflows ----------
$r = Api GET '/api/workflows/stages?entity_type=tmp' $adminToken; $stages = Json $r
Check 'workflow stages list (tmp)' ($r.Status -eq 200 -and $stages.Count -ge 2) "got $($r.Status)"
Check 'workflow stage create (planner) -> 403' ((Post '/api/workflows/stages' $planToken @{ entity_type = 'tmp'; name = 'Nope' }).Status -eq 403) 'no'
$r = Post '/api/workflows/stages' $adminToken @{ entity_type = 'tmp'; name = 'Test Stage'; description = 't'; is_optional = $false }
Check 'workflow stage create (admin)' ($r.Status -eq 201) "got $($r.Status) $($r.Text)"
$stId = (Json $r).id
$r = Put "/api/workflows/stages/$stId" $adminToken @{ name = 'Test Stage 2' }
Check 'workflow stage update' ($r.Status -eq 200 -and (Json $r).name -eq 'Test Stage 2') "got $($r.Status) $($r.Text)"
$r = Put "/api/workflows/stages/$stId" $adminToken @{ is_optional = $true }
Check 'workflow stage make optional' ((Json $r).is_optional -eq 1) "got $($r.Text)"
Check 'workflow stage delete' ((Api DELETE "/api/workflows/stages/$stId" $adminToken).Status -eq 200) 'no'

# ---------- bulk ----------
$r = Post '/api/tmps/bulk' $adminToken @{ ids = @($tmpId); action = 'status'; status = 'completed' }
Check 'tmp bulk status' ($r.Status -eq 200) "got $($r.Status) $($r.Text)"
$r = Post '/api/permits/bulk' $adminToken @{ ids = @($permitId); action = 'status'; status = 'completed' }
Check 'permit bulk status' ($r.Status -eq 200) "got $($r.Status) $($r.Text)"

# ---------- guarded deletes + cascade ----------
Check 'delete project with tmp -> 400' ((Api DELETE "/api/projects/$projId" $adminToken).Status -eq 400) 'no'
$r = Api DELETE "/api/permits/$permitId" $adminToken
Check 'delete permit with fees (cascade)' ($r.Status -eq 200) "got $($r.Status) $($r.Text)"
Check 'permit gone -> 404' ((Api GET "/api/permits/$permitId" $adminToken).Status -eq 404) 'no'
$r = Api DELETE "/api/tmps/$tmpId" $adminToken
Check 'delete tmp with children (cascade)' ($r.Status -eq 200) "got $($r.Status) $($r.Text)"
Check 'tmp gone -> 404' ((Api GET "/api/tmps/$tmpId" $adminToken).Status -eq 404) 'no'
$r = Api GET '/api/time-entries' $adminToken
Check 'time entries cleaned' (-not ($r.Text -match [regex]::Escape($teId))) 'entry still listed'
Check 'delete project (free)' ((Api DELETE "/api/projects/$projId" $adminToken).Status -eq 200) 'no'
Check 'delete site (free)' ((Api DELETE "/api/sites/$siteId" $adminToken).Status -eq 200) 'no'
Check 'delete client (free)' ((Api DELETE "/api/clients/$cliId" $adminToken).Status -eq 200) 'no'
Check 'delete authority (free)' ((Api DELETE "/api/authorities/$authId" $adminToken).Status -eq 200) 'no'
Check 'delete nonexistent -> 404' ((Api DELETE '/api/tmps/does-not-exist' $adminToken).Status -eq 404) 'no'

$script:results | ForEach-Object { $_ }
"========================================"
"TOTAL: PASS=$pass FAIL=$fail"
if ($fail -gt 0) { exit 1 }
