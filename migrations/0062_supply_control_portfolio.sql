BEGIN;

-- Supply control portfolio:
-- shared contractors, housing contracts/payment linkage and one transport source of truth.

CREATE TABLE IF NOT EXISTS supply_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  legal_name text,
  tax_id text,
  categories text[] NOT NULL DEFAULT '{}'::text[],
  contact_name text,
  phone text,
  email text,
  address_text text,
  payment_terms text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  owner_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (categories <@ ARRAY['housing','transport','workwear_ppe','tools_equipment','medicine','travel_tickets','food','services','other']::text[])
);

CREATE INDEX IF NOT EXISTS idx_supply_partners_status
  ON supply_partners(organization_id,status,name);

CREATE TABLE IF NOT EXISTS supply_partner_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES supply_partners(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('housing','transport','workwear_ppe','tools_equipment','medicine','travel_tickets','food','services','other')),
  service_name text NOT NULL,
  unit text,
  price numeric(14,2),
  effective_from date,
  effective_to date,
  notes text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_supply_partner_services_partner
  ON supply_partner_services(organization_id,partner_id,category,effective_to);

ALTER TABLE housing_sites
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES supply_partners(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS housing_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES housing_sites(id) ON DELETE CASCADE,
  partner_id uuid REFERENCES supply_partners(id) ON DELETE SET NULL,
  contract_number text,
  signed_on date,
  valid_from date NOT NULL,
  valid_to date,
  billing_model text NOT NULL CHECK (billing_model IN ('bed_day','bed_month','room_day','room_month','site_period')),
  booked_capacity integer CHECK (booked_capacity IS NULL OR booked_capacity >= 0),
  rate_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (rate_amount >= 0),
  deposit_amount numeric(14,2) CHECK (deposit_amount IS NULL OR deposit_amount >= 0),
  payment_day integer CHECK (payment_day IS NULL OR payment_day BETWEEN 1 AND 31),
  prepaid_until date,
  next_payment_due date,
  notice_days integer CHECK (notice_days IS NULL OR notice_days >= 0),
  auto_renew boolean NOT NULL DEFAULT false,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  updated_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_housing_contracts_site_active
  ON housing_contracts(organization_id,site_id,active,next_payment_due);

CREATE TABLE IF NOT EXISTS transport_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  operation_type text NOT NULL CHECK (operation_type IN ('employee_trip','hired_transport')),
  object_id uuid REFERENCES objects(id) ON DELETE SET NULL,
  worker_id uuid REFERENCES worker_profiles(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES supply_partners(id) ON DELETE SET NULL,
  owner_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  transport_kind text NOT NULL CHECK (transport_kind IN ('train','plane','bus','taxi','transfer','shuttle','cargo','other')),
  route_from text,
  route_to text,
  departure_at timestamptz,
  arrival_at timestamptz,
  schedule_text text,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  payment_model text CHECK (payment_model IS NULL OR payment_model IN ('ticket','ride','day','month','service','reimbursement')),
  amount numeric(14,2) CHECK (amount IS NULL OR amount >= 0),
  payment_due date,
  prepaid_until date,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','booked','in_transit','completed','cancelled')),
  notes text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transport_operations_scope
  ON transport_operations(organization_id,object_id,status,departure_at);
CREATE INDEX IF NOT EXISTS idx_transport_operations_worker
  ON transport_operations(organization_id,worker_id,departure_at);

ALTER TABLE supply_requests
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES supply_partners(id) ON DELETE SET NULL;

ALTER TABLE object_expenses
  ADD COLUMN IF NOT EXISTS housing_contract_id uuid REFERENCES housing_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transport_operation_id uuid REFERENCES transport_operations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supply_partner_id uuid REFERENCES supply_partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supply_request_id uuid REFERENCES supply_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_object_expenses_housing_contract
  ON object_expenses(organization_id,housing_contract_id,expense_date DESC)
  WHERE housing_contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_object_expenses_transport
  ON object_expenses(organization_id,transport_operation_id,expense_date DESC)
  WHERE transport_operation_id IS NOT NULL;

-- Preserve existing free-text housing vendors by promoting them to the shared directory.
INSERT INTO supply_partners(
  organization_id,name,categories,status,owner_user_id,created_by_user_id
)
SELECT hs.organization_id,trim(hs.vendor),ARRAY['housing']::text[],'active',
  COALESCE(hs.responsible_user_id,o.owner_user_id,hs.created_by_user_id),hs.created_by_user_id
FROM housing_sites hs
LEFT JOIN objects o ON o.id=hs.primary_object_id
WHERE hs.vendor IS NOT NULL AND trim(hs.vendor)<>''
  AND NOT EXISTS (
    SELECT 1 FROM supply_partners sp
    WHERE sp.organization_id=hs.organization_id AND lower(sp.name)=lower(trim(hs.vendor))
  );

UPDATE housing_sites hs
SET partner_id=sp.id
FROM supply_partners sp
WHERE hs.partner_id IS NULL
  AND hs.vendor IS NOT NULL
  AND sp.organization_id=hs.organization_id
  AND lower(sp.name)=lower(trim(hs.vendor));

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description) VALUES
  ('supply.transport.read','operations','transport','read',false,'Просмотр поездок сотрудников и заказного транспорта'),
  ('supply.transport.manage','operations','transport','manage',false,'Управление поездками сотрудников и заказным транспортом'),
  ('supplier.read','operations','supplier','read',false,'Просмотр поставщиков и подрядчиков'),
  ('supplier.manage','operations','supplier','manage',false,'Управление поставщиками, подрядчиками и услугами')
ON CONFLICT (capability) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,p.capability,'allow',
  CASE
    WHEN p.capability='supplier.read' THEN 'all_org'
    WHEN r.code='regional_manager' THEN 'region'
    ELSE 'assigned_to_me'
  END,
  '{}'::uuid[]
FROM role_templates r
JOIN permission_definitions p ON p.capability IN ('supply.transport.read','supply.transport.manage','supplier.read')
WHERE r.code IN ('object_manager','regional_manager')
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,p.capability,'allow','all_org','{}'::uuid[]
FROM role_templates r
JOIN permission_definitions p ON p.capability IN ('supply.transport.read','supply.transport.manage','supplier.read','supplier.manage')
WHERE r.code='director'
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,'supplier.manage','allow','region','{}'::uuid[]
FROM role_templates r
WHERE r.code='regional_manager'
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,p.capability,'allow','all_org','{}'::uuid[]
FROM role_templates r
JOIN permission_definitions p ON p.capability IN ('supply.transport.read','supply.transport.manage','supplier.read','supplier.manage')
WHERE r.code='supply_specialist'
ON CONFLICT DO NOTHING;

ALTER TABLE supply_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_partners FORCE ROW LEVEL SECURITY;
CREATE POLICY supply_partners_tenant_isolation ON supply_partners
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

ALTER TABLE supply_partner_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_partner_services FORCE ROW LEVEL SECURITY;
CREATE POLICY supply_partner_services_tenant_isolation ON supply_partner_services
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

ALTER TABLE housing_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE housing_contracts FORCE ROW LEVEL SECURITY;
CREATE POLICY housing_contracts_tenant_isolation ON housing_contracts
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

ALTER TABLE transport_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY transport_operations_tenant_isolation ON transport_operations
  USING (organization_id=app_current_organization_id())
  WITH CHECK (organization_id=app_current_organization_id());

CREATE TRIGGER audit_supply_partners
  AFTER INSERT OR UPDATE OR DELETE ON supply_partners
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_supply_partner_services
  AFTER INSERT OR UPDATE OR DELETE ON supply_partner_services
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_housing_contracts
  AFTER INSERT OR UPDATE OR DELETE ON housing_contracts
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_transport_operations
  AFTER INSERT OR UPDATE OR DELETE ON transport_operations
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

COMMIT;
