import db from './db.js';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';

// Idempotently ensure the demo login accounts exist (keyed by unique email),
// so local DBs that pre-date the LUX rebrand still accept the demo logins
// shown on the login page. Safe to run on any DB; will not touch other users.
export function ensureDemoUsers() {
  const demoPass = 'Demo123!';
  db.prepare('INSERT OR IGNORE INTO users (id,email,password,name,role) VALUES (?,?,?,?,?)').run(uuid(),'developer@lux.com.au',bcrypt.hashSync(demoPass,12),'Dev User','developer');
  db.prepare('INSERT OR IGNORE INTO users (id,email,password,name,role) VALUES (?,?,?,?,?)').run(uuid(),'manager@lux.com.au',bcrypt.hashSync(demoPass,12),'Manager User','manager');
  db.prepare('INSERT OR IGNORE INTO users (id,email,password,name,role) VALUES (?,?,?,?,?)').run(uuid(),'staff@lux.com.au',bcrypt.hashSync(demoPass,12),'Staff User','staff');
  db.prepare('INSERT OR IGNORE INTO users (id,email,password,name,role) VALUES (?,?,?,?,?)').run(uuid(),'client@lux.com.au',bcrypt.hashSync(demoPass,12),'Client User','client');
}

export function seedDatabase() {
const demoPass = 'Demo123!';
const adminId = uuid();
const clientId = uuid();
const siteId = uuid();
const projectId = uuid();
const tmpId = uuid();

db.prepare('INSERT OR IGNORE INTO users (id,email,password,name,role) VALUES (?,?,?,?,?)').run(adminId,'developer@lux.com.au',bcrypt.hashSync(demoPass,12),'Dev User','developer');
db.prepare('INSERT OR IGNORE INTO users (id,email,password,name,role) VALUES (?,?,?,?,?)').run(uuid(),'manager@lux.com.au',bcrypt.hashSync(demoPass,12),'Manager User','manager');
db.prepare('INSERT OR IGNORE INTO users (id,email,password,name,role) VALUES (?,?,?,?,?)').run(uuid(),'staff@lux.com.au',bcrypt.hashSync(demoPass,12),'Staff User','staff');
db.prepare('INSERT OR IGNORE INTO users (id,email,password,name,role) VALUES (?,?,?,?,?)').run(uuid(),'client@lux.com.au',bcrypt.hashSync(demoPass,12),'Client User','client');

db.prepare('INSERT OR IGNORE INTO clients (id,name,company,email,phone) VALUES (?,?,?,?,?)').run(clientId,'John Builder','BuilderCorp','john@buildercorp.com','0400 111 222');
db.prepare('INSERT OR IGNORE INTO clients (id,name,company,email,phone) VALUES (?,?,?,?,?)').run(uuid(),'Sarah Roadworks','City Roads Pty Ltd','sarah@cityroads.com','0400 333 444');
db.prepare('INSERT OR IGNORE INTO clients (id,name,company,email,phone) VALUES (?,?,?,?,?)').run(uuid(),'Mike Developments','Perth Properties','mike@perthprops.com','0400 555 666');

db.prepare('UPDATE users SET client_id = ? WHERE email = ?').run(clientId, 'client@lux.com.au');

db.prepare('INSERT OR IGNORE INTO sites (id,name,road_name,suburb,state) VALUES (?,?,?,?,?)').run(siteId,'Main St Intersection','Main Street','Perth CBD','WA');
db.prepare('INSERT OR IGNORE INTO sites (id,name,road_name,suburb,state) VALUES (?,?,?,?,?)').run(uuid(),'Highway Overpass','Kwinana Freeway','Maddington','WA');
db.prepare('INSERT OR IGNORE INTO sites (id,name,road_name,suburb,state) VALUES (?,?,?,?,?)').run(uuid(),'Rail Bridge Works','Tonkin Highway','Midland','WA');

db.prepare('INSERT OR IGNORE INTO tmp_projects (id,name,description,client_id,status,start_date,end_date) VALUES (?,?,?,?,?,?,?)').run(projectId,'Main St Upgrade','Traffic light installation and lane widening',clientId,'active','2026-07-01','2026-09-30');
db.prepare('INSERT OR IGNORE INTO tmp_projects (id,name,description,client_id,status,start_date,end_date) VALUES (?,?,?,?,?,?,?)').run(uuid(),'Kwinana Freeway Smart Workzone','Variable speed signs and lane closure management',clientId,'active','2026-08-01','2026-12-31');

db.prepare('INSERT OR IGNORE INTO traffic_management_plans (id,project_id,site_id,title,reference,status,plan_type,description) VALUES (?,?,?,?,?,?,?,?)').run(tmpId,projectId,siteId,'Main St Stage 1 Lane Closure','TMP-2026-001','approved','temporary','Lane closure for kerb works');
db.prepare('INSERT OR IGNORE INTO traffic_management_plans (id,project_id,site_id,title,reference,status,plan_type,description) VALUES (?,?,?,?,?,?,?,?)').run(uuid(),projectId,siteId,'Main St Night Works','TMP-2026-002','draft','temporary','Night works for signal installation');
db.prepare('INSERT OR IGNORE INTO traffic_management_plans (id,project_id,site_id,title,reference,status,plan_type,description) VALUES (?,?,?,?,?,?,?,?)').run(uuid(),projectId,siteId,'Main St Permanent Signage','TMP-2026-003','submitted','permanent','New permanent signage installation');

db.prepare('INSERT OR IGNORE INTO plan_activities (id,tmp_id,user_id,action,description) VALUES (?,?,?,?,?)').run(uuid(),tmpId,adminId,'created','Plan created and submitted for review');

// WA Authorities
const lgaId = uuid();
const mrwaId = uuid();
const ptaId = uuid();
const hvsId = uuid();

db.prepare('INSERT OR IGNORE INTO authorities (id,name,short_name,type,email,phone) VALUES (?,?,?,?,?,?)').run(lgaId,'City of Perth','COP','lga','traffic@perth.wa.gov.au','08 9461 3333');
db.prepare('INSERT OR IGNORE INTO authorities (id,name,short_name,type,email,phone) VALUES (?,?,?,?,?,?)').run(mrwaId,'Main Roads Western Australia','MRWA','mrwa','trafficmanagement@mainroads.wa.gov.au','138 138');
db.prepare('INSERT OR IGNORE INTO authorities (id,name,short_name,type,email,phone) VALUES (?,?,?,?,?,?)').run(ptaId,'Public Transport Authority','PTA','pta','tmp@pta.wa.gov.au','13 62 13');
db.prepare('INSERT OR IGNORE INTO authorities (id,name,short_name,type,email,phone) VALUES (?,?,?,?,?,?)').run(hvsId,'Heavy Vehicle Safety Branch','HVS','hvs','hvs@transport.wa.gov.au','08 9326 8000');
db.prepare('INSERT OR IGNORE INTO authorities (id,name,short_name,type,email,phone) VALUES (?,?,?,?,?,?)').run(uuid(),'City of Stirling','COS','lga','traffic@stirling.wa.gov.au','08 9205 8555');
db.prepare('INSERT OR IGNORE INTO authorities (id,name,short_name,type,email,phone) VALUES (?,?,?,?,?,?)').run(uuid(),'City of Wanneroo','COW','lga','traffic@wanneroo.wa.gov.au','08 9405 5000');
db.prepare('INSERT OR IGNORE INTO authorities (id,name,short_name,type,email,phone) VALUES (?,?,?,?,?,?)').run(uuid(),'City of Mandurah','COM','lga','traffic@mandurah.wa.gov.au','08 9550 3000');

// SLA Rules
db.prepare('INSERT OR IGNORE INTO sla_rules (id,authority_id,complexity,assessment_days,public_notice_days,buffer_days,requires_public_notice) VALUES (?,?,?,?,?,?,?)').run(uuid(),lgaId,'simple',7,0,0,0);
db.prepare('INSERT OR IGNORE INTO sla_rules (id,authority_id,complexity,assessment_days,public_notice_days,buffer_days,requires_public_notice) VALUES (?,?,?,?,?,?,?)').run(uuid(),lgaId,'standard',14,0,3,0);
db.prepare('INSERT OR IGNORE INTO sla_rules (id,authority_id,complexity,assessment_days,public_notice_days,buffer_days,requires_public_notice) VALUES (?,?,?,?,?,?,?)').run(uuid(),lgaId,'complex',20,0,5,0);
db.prepare('INSERT OR IGNORE INTO sla_rules (id,authority_id,complexity,assessment_days,public_notice_days,buffer_days,requires_public_notice) VALUES (?,?,?,?,?,?,?)').run(uuid(),lgaId,'complex_with_notice',20,15,5,1);

db.prepare('INSERT OR IGNORE INTO sla_rules (id,authority_id,complexity,assessment_days,public_notice_days,buffer_days,requires_public_notice) VALUES (?,?,?,?,?,?,?)').run(uuid(),mrwaId,'simple',10,0,5,0);
db.prepare('INSERT OR IGNORE INTO sla_rules (id,authority_id,complexity,assessment_days,public_notice_days,buffer_days,requires_public_notice) VALUES (?,?,?,?,?,?,?)').run(uuid(),mrwaId,'standard',15,0,5,0);
db.prepare('INSERT OR IGNORE INTO sla_rules (id,authority_id,complexity,assessment_days,public_notice_days,buffer_days,requires_public_notice) VALUES (?,?,?,?,?,?,?)').run(uuid(),mrwaId,'complex',20,0,10,0);
db.prepare('INSERT OR IGNORE INTO sla_rules (id,authority_id,complexity,assessment_days,public_notice_days,buffer_days,requires_public_notice) VALUES (?,?,?,?,?,?,?)').run(uuid(),mrwaId,'complex_with_notice',20,15,10,1);

db.prepare('INSERT OR IGNORE INTO sla_rules (id,authority_id,complexity,assessment_days,public_notice_days,buffer_days,requires_public_notice) VALUES (?,?,?,?,?,?,?)').run(uuid(),ptaId,'simple',5,0,0,0);
db.prepare('INSERT OR IGNORE INTO sla_rules (id,authority_id,complexity,assessment_days,public_notice_days,buffer_days,requires_public_notice) VALUES (?,?,?,?,?,?,?)').run(uuid(),ptaId,'standard',10,0,3,0);
db.prepare('INSERT OR IGNORE INTO sla_rules (id,authority_id,complexity,assessment_days,public_notice_days,buffer_days,requires_public_notice) VALUES (?,?,?,?,?,?,?)').run(uuid(),ptaId,'complex',15,0,5,0);
db.prepare('INSERT OR IGNORE INTO sla_rules (id,authority_id,complexity,assessment_days,public_notice_days,buffer_days,requires_public_notice) VALUES (?,?,?,?,?,?,?)').run(uuid(),ptaId,'complex_with_notice',15,15,5,1);

db.prepare('INSERT OR IGNORE INTO sla_rules (id,authority_id,complexity,assessment_days,public_notice_days,buffer_days,requires_public_notice) VALUES (?,?,?,?,?,?,?)').run(uuid(),hvsId,'simple',5,0,0,0);
db.prepare('INSERT OR IGNORE INTO sla_rules (id,authority_id,complexity,assessment_days,public_notice_days,buffer_days,requires_public_notice) VALUES (?,?,?,?,?,?,?)').run(uuid(),hvsId,'standard',10,0,3,0);
db.prepare('INSERT OR IGNORE INTO sla_rules (id,authority_id,complexity,assessment_days,public_notice_days,buffer_days,requires_public_notice) VALUES (?,?,?,?,?,?,?)').run(uuid(),hvsId,'complex',20,0,5,0);

// Sample permits
const permitId1 = uuid();
db.prepare('INSERT OR IGNORE INTO permits (id,tmp_id,authority_id,status,complexity,submission_date,created_by) VALUES (?,?,?,?,?,?,?)').run(permitId1,tmpId,lgaId,'under_review','standard','2026-07-15',adminId);
const permitId2 = uuid();
db.prepare('INSERT OR IGNORE INTO permits (id,tmp_id,authority_id,status,complexity,is_within_30m_signals,requires_mrwa,created_by) VALUES (?,?,?,?,?,?,?,?)').run(permitId2,tmpId,mrwaId,'submitted','complex',1,1,adminId);

// Sample time entries
db.prepare('INSERT OR IGNORE INTO time_entries (id,tmp_id,user_id,cost_code,description,duration_hours,rate_per_hour,is_billable,date) VALUES (?,?,?,?,?,?,?,?,?)').run(uuid(),tmpId,adminId,'TMP-DESIGN','Initial site assessment and TMP drafting',4.5,150,1,'2026-07-10');
db.prepare('INSERT OR IGNORE INTO time_entries (id,tmp_id,user_id,cost_code,description,duration_hours,rate_per_hour,is_billable,date) VALUES (?,?,?,?,?,?,?,?,?)').run(uuid(),tmpId,adminId,'TMP-LGA-LIAISON','Called City of Perth planning dept',2.0,150,1,'2026-07-12');
db.prepare('INSERT OR IGNORE INTO time_entries (id,tmp_id,user_id,cost_code,description,duration_hours,rate_per_hour,is_billable,date) VALUES (?,?,?,?,?,?,?,?,?)').run(uuid(),tmpId,adminId,'TMP-REVISION-INT','Internal QA review of draft TMP',1.5,150,0,'2026-07-14');

// Sample fees
db.prepare('INSERT OR IGNORE INTO permit_fees (id,permit_id,fee_type,amount,status) VALUES (?,?,?,?,?)').run(uuid(),permitId1,'application_fee',350,'paid');
db.prepare('INSERT OR IGNORE INTO permit_fees (id,permit_id,fee_type,amount,status) VALUES (?,?,?,?,?)').run(uuid(),permitId2,'application_fee',500,'pending');
db.prepare('INSERT OR IGNORE INTO permit_fees (id,permit_id,fee_type,amount,status,bond_returned) VALUES (?,?,?,?,?,?)').run(uuid(),permitId2,'bond',2000,'paid',0);

console.log('Database seeded successfully!');
console.log('Developer: developer@lux.com.au / Demo123!');
console.log('Manager: manager@lux.com.au / Demo123!');
console.log('Staff: staff@lux.com.au / Demo123!');
console.log('Client: client@lux.com.au / Demo123!');
}

// Serverless (Netlify) bootstrap: no default credentials on a public endpoint.
// Creates a single developer account from environment variables when the (ephemeral) DB is empty.
export function seedAdminFromEnv() {
  const email = process.env.NETLIFY_ADMIN_EMAIL;
  const password = process.env.NETLIFY_ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('seedAdminFromEnv: NETLIFY_ADMIN_EMAIL / NETLIFY_ADMIN_PASSWORD not set — no users will exist. Set both to create the initial developer on each cold start.');
    return false;
  }
  const name = process.env.NETLIFY_ADMIN_NAME || 'Admin User';
  db.prepare('INSERT OR IGNORE INTO users (id,email,password,name,role) VALUES (?,?,?,?,?)')
    .run(uuid(), String(email).trim().toLowerCase(), bcrypt.hashSync(String(password), 12), String(name).trim(), 'developer');
  console.log(`seedAdminFromEnv: created developer ${email} (serverless bootstrap)`);
  return true;
}

if (typeof import.meta !== 'undefined' && import.meta.url === new URL(process.argv[1] || '', 'file://').href) {
  seedDatabase();
}
