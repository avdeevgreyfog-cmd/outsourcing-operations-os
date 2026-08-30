BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE,
  display_name text NOT NULL,
  password_hash text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE role_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role_template_id uuid REFERENCES role_templates(id),
  primary_team_id uuid REFERENCES teams(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE membership_teams (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES organization_memberships(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (membership_id, team_id)
);

CREATE TABLE membership_regions (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES organization_memberships(id) ON DELETE CASCADE,
  region_id uuid NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  PRIMARY KEY (membership_id, region_id)
);

CREATE TABLE permission_definitions (
  capability text PRIMARY KEY,
  domain text NOT NULL,
  resource text NOT NULL,
  action text NOT NULL,
  field_sensitive boolean NOT NULL DEFAULT false,
  description text
);

CREATE TABLE permission_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_template_id uuid NOT NULL REFERENCES role_templates(id) ON DELETE CASCADE,
  capability text NOT NULL REFERENCES permission_definitions(capability) ON DELETE CASCADE,
  effect text NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
  scope_type text NOT NULL DEFAULT 'all_org' CHECK (scope_type IN ('own_created','assigned_to_me','team','region','objects','clients','all_org')),
  scope_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_template_id, capability, effect, scope_type)
);

CREATE TABLE user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES organization_memberships(id) ON DELETE CASCADE,
  capability text NOT NULL REFERENCES permission_definitions(capability) ON DELETE CASCADE,
  effect text NOT NULL CHECK (effect IN ('allow','deny')),
  scope_type text CHECK (scope_type IN ('own_created','assigned_to_me','team','region','objects','clients','all_org')),
  scope_ids uuid[] NOT NULL DEFAULT '{}',
  changed_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, code)
);

CREATE TABLE client_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  legal_name text,
  inn text,
  status text NOT NULL DEFAULT 'active',
  owner_user_id uuid REFERENCES app_users(id),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  assigned_team_id uuid REFERENCES teams(id),
  region_id uuid REFERENCES regions(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_company_id uuid NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  position text,
  phone text,
  email text,
  communication_preference text,
  owner_user_id uuid REFERENCES app_users(id),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_company_id uuid REFERENCES client_companies(id),
  title text NOT NULL,
  source text,
  stage text NOT NULL DEFAULT 'new',
  lost_reason text,
  owner_user_id uuid REFERENCES app_users(id),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  assigned_team_id uuid REFERENCES teams(id),
  region_id uuid REFERENCES regions(id),
  next_action_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_company_id uuid NOT NULL REFERENCES client_companies(id),
  contact_id uuid REFERENCES contacts(id),
  lead_id uuid REFERENCES leads(id),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  location_text text,
  region_id uuid REFERENCES regions(id),
  expected_start_date date,
  duration_text text,
  schedule_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  lunch_paid boolean,
  vat_mode text,
  housing_rule text,
  travel_rule text,
  shuttle_rule text,
  ppe_rule text,
  medical_rule text,
  citizenship_rule text,
  tools_rule text,
  comments text,
  owner_user_id uuid REFERENCES app_users(id),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  assigned_team_id uuid REFERENCES teams(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE request_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  specialty_id uuid NOT NULL REFERENCES specialties(id),
  count_required integer NOT NULL CHECK (count_required > 0),
  schedule_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  requirements_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_client_rate numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rate_reference_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  specialty_id uuid NOT NULL REFERENCES specialties(id),
  region_id uuid REFERENCES regions(id),
  employment_model text NOT NULL,
  amount_min numeric(14,2) NOT NULL,
  amount_max numeric(14,2),
  unit text NOT NULL CHECK (unit IN ('hour','shift','month')),
  pay_semantics text NOT NULL CHECK (pay_semantics IN ('net','gross')),
  source text NOT NULL,
  source_date date NOT NULL,
  confidence text NOT NULL DEFAULT 'medium',
  notes text,
  valid_from date NOT NULL,
  valid_to date,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE calculation_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  model_type text NOT NULL CHECK (model_type IN ('employment','gph','npd','custom')),
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE calculation_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  calculation_model_id uuid NOT NULL REFERENCES calculation_models(id) ON DELETE CASCADE,
  version integer NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  rules_json jsonb NOT NULL,
  source text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (calculation_model_id, version)
);

CREATE TABLE calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  owner_user_id uuid REFERENCES app_users(id),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  approved_by_user_id uuid REFERENCES app_users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE calculation_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  calculation_id uuid NOT NULL REFERENCES calculations(id) ON DELETE CASCADE,
  request_role_id uuid NOT NULL REFERENCES request_roles(id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES calculation_models(id),
  rule_version_id uuid REFERENCES calculation_rule_versions(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','accepted','rejected')),
  inputs_snapshot jsonb NOT NULL,
  cost_snapshot jsonb NOT NULL,
  result_snapshot jsonb NOT NULL,
  rate_reference_snapshot jsonb,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  accepted_by_user_id uuid REFERENCES app_users(id),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX one_accepted_scenario_per_role ON calculation_scenarios(request_role_id) WHERE status='accepted';

CREATE TABLE proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  scenario_ids uuid[] NOT NULL DEFAULT '{}',
  total_value numeric(14,2),
  exported_file_id uuid,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  approved_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, version)
);

CREATE TABLE objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_company_id uuid NOT NULL REFERENCES client_companies(id),
  source_request_id uuid REFERENCES requests(id),
  name text NOT NULL,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'launch',
  region_id uuid NOT NULL REFERENCES regions(id),
  address_text text,
  target_start_date date,
  owner_user_id uuid REFERENCES app_users(id),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE object_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id),
  responsibility_type text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  assigned_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  target_date date NOT NULL,
  forecast_date date,
  progress_pct numeric(5,2) NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'normal',
  checklist_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE needs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  source_request_role_id uuid REFERENCES request_roles(id),
  specialty_id uuid NOT NULL REFERENCES specialties(id),
  count_required integer NOT NULL CHECK (count_required > 0),
  count_filled integer NOT NULL DEFAULT 0 CHECK (count_filled >= 0),
  deadline date,
  status text NOT NULL DEFAULT 'open',
  owner_user_id uuid REFERENCES app_users(id),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE need_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  need_id uuid NOT NULL REFERENCES needs(id) ON DELETE CASCADE,
  recruiter_user_id uuid REFERENCES app_users(id),
  team_id uuid REFERENCES teams(id),
  target_count integer NOT NULL DEFAULT 1,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz,
  assigned_by_user_id uuid REFERENCES app_users(id)
);

CREATE TABLE candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  source text,
  original_recruiter_user_id uuid REFERENCES app_users(id),
  current_recruiter_user_id uuid REFERENCES app_users(id),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE candidate_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  need_id uuid NOT NULL REFERENCES needs(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id),
  stage text NOT NULL DEFAULT 'new',
  next_action_at timestamptz,
  owner_user_id uuid REFERENCES app_users(id),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, need_id)
);

CREATE TABLE candidate_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES candidate_applications(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  changed_by_user_id uuid NOT NULL REFERENCES app_users(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE candidate_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  from_user_id uuid REFERENCES app_users(id),
  to_user_id uuid REFERENCES app_users(id),
  changed_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE worker_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  origin_candidate_id uuid REFERENCES candidates(id),
  full_name text NOT NULL,
  phone text,
  status text NOT NULL DEFAULT 'active',
  source text,
  original_recruiter_user_id uuid REFERENCES app_users(id),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE employment_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  relation_type text NOT NULL CHECK (relation_type IN ('employment','gph','npd','custom')),
  effective_from date NOT NULL,
  effective_to date,
  contract_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE worker_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  specialty_id uuid REFERENCES specialties(id),
  object_id uuid REFERENCES objects(id),
  amount numeric(14,2) NOT NULL,
  unit text NOT NULL CHECK (unit IN ('hour','shift','month')),
  day_night text NOT NULL DEFAULT 'any',
  effective_from date NOT NULL,
  effective_to date,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE worker_object_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  specialty_id uuid REFERENCES specialties(id),
  effective_from date NOT NULL,
  effective_to date,
  manager_user_id uuid REFERENCES app_users(id),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  need_id uuid REFERENCES needs(id),
  specialty_id uuid NOT NULL REFERENCES specialties(id),
  shift_date date NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  shift_kind text NOT NULL CHECK (shift_kind IN ('day','night','mixed')),
  demand_count integer NOT NULL DEFAULT 1,
  assigned_count integer NOT NULL DEFAULT 0,
  reserve_count integer NOT NULL DEFAULT 0,
  planned_cost numeric(14,2),
  status text NOT NULL DEFAULT 'open',
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  confirmation_status text NOT NULL DEFAULT 'pending',
  is_reserve boolean NOT NULL DEFAULT false,
  assigned_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shift_id, worker_id)
);

CREATE TABLE attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shift_assignment_id uuid NOT NULL REFERENCES shift_assignments(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('arrival','departure','no_show','manual_correction')),
  event_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  reason text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES shifts(id),
  work_date date NOT NULL,
  planned boolean NOT NULL DEFAULT true,
  time_code text NOT NULL DEFAULT 'WORK',
  fact_hours numeric(7,2) NOT NULL DEFAULT 0,
  day_hours numeric(7,2) NOT NULL DEFAULT 0,
  night_hours numeric(7,2) NOT NULL DEFAULT 0,
  overtime_hours numeric(7,2) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'attendance',
  correction_reason text,
  corrected_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worker_id, object_id, work_date, shift_id)
);

CREATE TABLE timesheet_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  view_type text NOT NULL CHECK (view_type IN ('client','internal')),
  period_type text NOT NULL CHECK (period_type IN ('first_half','second_half','month')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  snapshot_json jsonb NOT NULL,
  submitted_by_user_id uuid REFERENCES app_users(id),
  submitted_at timestamptz,
  approved_by_user_id uuid REFERENCES app_users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reconciliation_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES worker_profiles(id),
  work_date date,
  internal_hours numeric(7,2) NOT NULL,
  client_hours numeric(7,2) NOT NULL,
  difference_hours numeric(7,2) NOT NULL,
  reason text,
  owner_user_id uuid REFERENCES app_users(id),
  status text NOT NULL DEFAULT 'open',
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE worker_accruals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  base_amount numeric(14,2) NOT NULL,
  premium_amount numeric(14,2) NOT NULL DEFAULT 0,
  adjustment_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  source_snapshot_id uuid REFERENCES timesheet_snapshots(id),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  approved_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pay_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  object_id uuid REFERENCES objects(id),
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('bonus','correction','reimbursement','lawful_deduction','other')),
  amount numeric(14,2) NOT NULL,
  basis text NOT NULL,
  document_reference text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE discipline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  object_id uuid REFERENCES objects(id),
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  description text NOT NULL,
  document_reference text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE advance_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  object_id uuid REFERENCES objects(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  reference text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE worker_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  object_id uuid REFERENCES objects(id),
  accrual_id uuid REFERENCES worker_accruals(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_date date,
  status text NOT NULL DEFAULT 'planned',
  reference text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  updated_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_company_id uuid NOT NULL REFERENCES client_companies(id),
  object_id uuid REFERENCES objects(id),
  specialty_id uuid NOT NULL REFERENCES specialties(id),
  accepted_scenario_id uuid REFERENCES calculation_scenarios(id),
  amount numeric(14,2) NOT NULL,
  unit text NOT NULL CHECK (unit IN ('hour','shift','month','service')),
  effective_from date NOT NULL,
  effective_to date,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_revenue_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_company_id uuid NOT NULL REFERENCES client_companies(id),
  object_id uuid NOT NULL REFERENCES objects(id),
  client_rate_id uuid REFERENCES client_rates(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  quantity numeric(14,2) NOT NULL,
  unit text NOT NULL,
  rate numeric(14,2) NOT NULL,
  amount numeric(14,2) NOT NULL,
  source_snapshot_id uuid REFERENCES timesheet_snapshots(id),
  status text NOT NULL DEFAULT 'draft',
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE object_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  expense_date date NOT NULL,
  category text NOT NULL,
  amount numeric(14,2) NOT NULL,
  vendor text,
  reference text,
  plan_fact text NOT NULL DEFAULT 'fact' CHECK (plan_fact IN ('plan','forecast','fact')),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pnl_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  scenario text NOT NULL CHECK (scenario IN ('plan','forecast','fact')),
  revenue numeric(14,2) NOT NULL,
  worker_cost numeric(14,2) NOT NULL,
  object_expenses numeric(14,2) NOT NULL,
  contribution numeric(14,2) NOT NULL,
  margin_pct numeric(7,3) NOT NULL,
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id, period_start, period_end, scenario)
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  assignee_user_id uuid REFERENCES app_users(id),
  due_at timestamptz,
  entity_type text,
  entity_id uuid,
  checklist_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE file_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  storage_provider text NOT NULL DEFAULT 'supabase-compatible',
  storage_key text NOT NULL,
  original_name text NOT NULL,
  content_type text,
  size_bytes bigint,
  entity_type text,
  entity_id uuid,
  uploaded_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  body text NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);

CREATE TABLE activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES app_users(id),
  entity_type text NOT NULL,
  entity_id uuid,
  verb text NOT NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES app_users(id),
  resource_type text NOT NULL,
  resource_id uuid,
  action text NOT NULL,
  before_json jsonb,
  after_json jsonb,
  reason text,
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Common tenant/scope indexes.
CREATE INDEX idx_clients_org_owner ON client_companies(organization_id, owner_user_id);
CREATE INDEX idx_requests_org_status_owner ON requests(organization_id, status, owner_user_id);
CREATE INDEX idx_requests_region ON requests(organization_id, region_id);
CREATE INDEX idx_objects_org_region_status ON objects(organization_id, region_id, status);
CREATE INDEX idx_objects_owner ON objects(organization_id, owner_user_id);
CREATE INDEX idx_needs_object_status ON needs(organization_id, object_id, status);
CREATE INDEX idx_candidates_recruiter ON candidates(organization_id, current_recruiter_user_id, status);
CREATE INDEX idx_candidate_app_need_stage ON candidate_applications(organization_id, need_id, stage);
CREATE INDEX idx_workers_org_status ON worker_profiles(organization_id, status);
CREATE INDEX idx_shifts_object_date ON shifts(organization_id, object_id, shift_date);
CREATE INDEX idx_time_entries_object_date ON time_entries(organization_id, object_id, work_date);
CREATE INDEX idx_accruals_worker_period ON worker_accruals(organization_id, worker_id, period_start, period_end);
CREATE INDEX idx_payments_status_date ON worker_payments(organization_id, status, payment_date);
CREATE INDEX idx_expenses_object_date ON object_expenses(organization_id, object_id, expense_date);
CREATE INDEX idx_tasks_assignee_due ON tasks(organization_id, assignee_user_id, due_at);
CREATE INDEX idx_audit_resource ON audit_events(organization_id, resource_type, resource_id, created_at DESC);
CREATE INDEX idx_activity_entity ON activity_events(organization_id, entity_type, entity_id, created_at DESC);

COMMIT;
