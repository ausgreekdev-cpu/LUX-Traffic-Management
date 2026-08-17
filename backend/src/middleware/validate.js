import { z } from 'zod';

export const schemas = {
  login: z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1)
  }),

  user: z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(6),
    name: z.string().min(1),
    role: z.enum(['developer', 'manager', 'staff', 'client']).optional(),
    client_id: z.string().optional().nullable()
  }),

  client: z.object({
    name: z.string().min(1),
    company: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    abn: z.string().optional()
  }),

  site: z.object({
    name: z.string().min(1),
    road_name: z.string().optional(),
    suburb: z.string().optional(),
    state: z.string().optional(),
    postcode: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    description: z.string().optional(),
    road_class: z.enum(['local', 'distributor', 'collector', 'arterial', 'highway', 'freeway']).optional(),
    speed_limit: z.number().int().min(0).max(200).optional(),
    aadt: z.number().int().min(0).optional(),
    pedestrian_activity: z.enum(['low', 'medium', 'high']).optional(),
    cyclist_activity: z.enum(['low', 'medium', 'high']).optional(),
    rail_corridor: z.boolean().optional(),
    school_zone: z.boolean().optional()
  }),

  project: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    client_id: z.string().optional(),
    site_id: z.string().optional(),
    status: z.enum(['active', 'completed', 'on_hold', 'cancelled']).optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional()
  }),

  tmp: z.object({
    project_id: z.string().optional(),
    site_id: z.string().optional(),
    title: z.string().min(1),
    status: z.enum(['draft', 'submitted', 'approved', 'rejected', 'completed', 'cancelled']).optional(),
    plan_type: z.enum(['temporary', 'permanent', 'event']).optional(),
    complexity: z.enum(['simple', 'standard', 'complex', 'complex_with_notice']).optional(),
    complexity_source: z.enum(['auto', 'manual']).optional(),
    description: z.string().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional()
  }),

  authority: z.object({
    name: z.string().min(1),
    short_name: z.string().optional(),
    type: z.enum(['lga', 'mrwa', 'pta', 'hvs', 'other']).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    website: z.string().url().optional(),
    address: z.string().optional(),
    contact_person: z.string().optional(),
    council_type: z.enum(['town', 'city', 'shire']).optional(),
    abn: z.string().optional(),
    band: z.number().int().min(1).max(4).optional().nullable(),
    suburb: z.string().optional(),
    postcode: z.string().optional(),
    mayor: z.string().optional(),
    deputy: z.string().optional(),
    ceo: z.string().optional(),
    councillors: z.array(z.object({
      name: z.string(),
      ward: z.string().optional().nullable(),
      term: z.string().optional().nullable()
    })).optional(),
    executive_team: z.string().optional(),
    suburbs: z.array(z.object({
      name: z.string(),
      postcode: z.string().optional().nullable()
    })).optional(),
    meeting_schedule: z.string().optional(),
    map_coordinates: z.string().optional(),
    zone: z.string().optional(),
    statistics: z.record(z.string(), z.number()).optional()
  }),

  slaRule: z.object({
    authority_id: z.string(),
    complexity: z.enum(['simple', 'standard', 'complex', 'complex_with_notice']),
    assessment_days: z.number().min(0),
    public_notice_days: z.number().min(0).optional(),
    buffer_days: z.number().min(0).optional(),
    requires_public_notice: z.boolean().optional()
  }),

  permit: z.object({
    tmp_id: z.string(),
    authority_id: z.string(),
    status: z.enum(['draft', 'submitted', 'under_review', 'approved', 'rejected', 'expired', 'cancelled', 'completed']).optional(),
    complexity: z.enum(['simple', 'standard', 'complex', 'complex_with_notice']).optional(),
    submission_date: z.string().optional(),
    approval_date: z.string().optional(),
    expiry_date: z.string().optional(),
    rejection_reason: z.string().optional(),
    is_within_30m_signals: z.boolean().optional(),
    requires_mrwa: z.boolean().optional()
  }),

  permitFee: z.object({
    fee_type: z.enum(['application_fee', 'assessment_fee', 'daily_occupancy_fee', 'lane_usage_fee', 'bond', 'other']),
    amount: z.number().min(0),
    status: z.enum(['pending', 'paid', 'refunded', 'waived']).optional(),
    bond_returned: z.boolean().optional(),
    due_date: z.string().optional(),
    paid_date: z.string().optional()
  }),

  timeEntry: z.object({
    tmp_id: z.string(),
    cost_code: z.string().min(1),
    description: z.string().optional(),
    duration_hours: z.number().min(0),
    rate_per_hour: z.number().min(0).optional(),
    is_billable: z.boolean().optional(),
    date: z.string()
  }),

  emailConfig: z.object({
    host: z.string().optional(),
    port: z.number().optional(),
    user: z.string().optional(),
    pass: z.string().optional()
  }),

  sendEmail: z.object({
    to: z.string().email(),
    subject: z.string().min(1),
    body: z.string().min(1),
    tmp_id: z.string().optional()
  }),

  emailTemplate: z.object({
    name: z.string().min(1),
    subject: z.string().min(1),
    body: z.string().min(1),
    event_type: z.string().optional(),
    html_body: z.string().optional()
  })
};

export function validate(schemaName) {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    if (!schema) return next();
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Validation failed', details: result.error.issues });
    }
    req.validated = result.data;
    next();
  };
}
