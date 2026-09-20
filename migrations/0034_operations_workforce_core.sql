BEGIN;

-- Operations workforce core: employees after first shift, object crews, flexible absences,
-- distributed stock locations and auditable inventory movements.

ALTER TABLE worker_profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS clothing_size text,
  ADD COLUMN IF NOT EXISTS shoe_size text,
  ADD COLUMN IF NOT EXISTS height_cm integer,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS object_crews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  specialty_id uuid REFERENCES specialties(id),
  name text NOT NULL,
  leader_worker_id uuid REFERENCES worker_profiles(id),
  leader_mode text NOT NULL DEFAULT 'working_leader'
    CHECK (leader_mode IN ('working_leader','dedicated')),
  bonus_amount numeric(14,2),
  bonus_unit text CHECK (bonus_unit IS NULL OR bonus_unit IN ('hour','shift','month','period')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS object_crew_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES object_crews(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crew_member_active
  ON object_crew_members(crew_id,worker_id)
  WHERE effective_to IS NULL;

CREATE TABLE IF NOT EXISTS worker_absence_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  object_id uuid REFERENCES objects(id) ON DELETE SET NULL,
  absence_type text NOT NULL CHECK (absence_type IN ('intershift','vacation','sick','personal','other')),
  status text NOT NULL DEFAULT 'tentative'
    CHECK (status IN ('tentative','confirmed','cancelled','completed')),
  planned_from date NOT NULL,
  planned_to date,
  actual_from date,
  actual_to date,
  flexible_return boolean NOT NULL DEFAULT false,
  note text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  updated_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (planned_to IS NULL OR planned_to >= planned_from),
  CHECK (actual_to IS NULL OR actual_from IS NULL OR actual_to >= actual_from)
);

CREATE TABLE IF NOT EXISTS storage_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'other'
    CHECK (kind IN ('office','manager','object','housing','vehicle','other')),
  object_id uuid REFERENCES objects(id) ON DELETE SET NULL,
  responsible_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('workwear','ppe','tool','equipment','consumable','other')),
  unit text NOT NULL DEFAULT 'шт',
  returnable boolean NOT NULL DEFAULT true,
  tracks_variant boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_item_code
  ON inventory_items(organization_id,code)
  WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS inventory_stock_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES storage_locations(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  variant text NOT NULL DEFAULT '',
  min_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  updated_by_user_id uuid REFERENCES app_users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(location_id,item_id,variant)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES inventory_items(id),
  variant text NOT NULL DEFAULT '',
  movement_type text NOT NULL CHECK (movement_type IN (
    'opening','receipt','transfer','issue','return','writeoff','adjustment_in','adjustment_out'
  )),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  from_location_id uuid REFERENCES storage_locations(id),
  to_location_id uuid REFERENCES storage_locations(id),
  worker_id uuid REFERENCES worker_profiles(id),
  item_condition text CHECK (item_condition IS NULL OR item_condition IN ('new','good','worn','damaged','unusable')),
  unit_cost numeric(14,2),
  note text,
  reference text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (movement_type IN ('opening','receipt','adjustment_in') AND to_location_id IS NOT NULL AND from_location_id IS NULL)
    OR (movement_type='transfer' AND from_location_id IS NOT NULL AND to_location_id IS NOT NULL AND from_location_id<>to_location_id)
    OR (movement_type='issue' AND from_location_id IS NOT NULL AND worker_id IS NOT NULL)
    OR (movement_type='return' AND to_location_id IS NOT NULL AND worker_id IS NOT NULL)
    OR (movement_type='writeoff' AND (from_location_id IS NOT NULL OR worker_id IS NOT NULL))
    OR (movement_type='adjustment_out' AND from_location_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS housing_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  address_text text,
  vendor text,
  primary_object_id uuid REFERENCES objects(id) ON DELETE SET NULL,
  responsible_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  rate_model text NOT NULL DEFAULT 'bed_day'
    CHECK (rate_model IN ('bed_day','room_day','room_month','site_period')),
  rate_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (rate_amount >= 0),
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS housing_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES housing_sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  capacity integer NOT NULL DEFAULT 1 CHECK (capacity > 0),
  rate_amount_override numeric(14,2),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS housing_stays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  object_id uuid REFERENCES objects(id) ON DELETE SET NULL,
  site_id uuid NOT NULL REFERENCES housing_sites(id),
  unit_id uuid REFERENCES housing_units(id),
  bed_label text,
  check_in date NOT NULL,
  check_out date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('planned','active','completed','cancelled')),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out IS NULL OR check_out >= check_in)
);

INSERT INTO permission_definitions(capability,domain,resource,action,field_sensitive,description) VALUES
('operations.crew.read','operations','crew','read',false,'Просмотр бригад на доступных объектах'),
('operations.crew.manage','operations','crew','manage',false,'Создание и изменение бригад на доступных объектах'),
('assets.read','operations','inventory','read',false,'Просмотр запасов, имущества и движений'),
('assets.manage','operations','inventory','manage',false,'Управление местами хранения и движениями имущества'),
('supply.housing.read','operations','housing','read',false,'Просмотр жилья и заселений'),
('supply.housing.manage','operations','housing','manage',false,'Управление жильём и заселениями')
ON CONFLICT (capability) DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,p.capability,'allow',
  CASE WHEN r.code='regional_manager' THEN 'region' ELSE 'assigned_to_me' END,
  '{}'::uuid[]
FROM role_templates r
JOIN permission_definitions p ON p.capability IN (
  'operations.crew.read','operations.crew.manage','assets.read','assets.manage','supply.housing.read','supply.housing.manage'
)
WHERE r.code IN ('object_manager','regional_manager')
ON CONFLICT DO NOTHING;

INSERT INTO permission_grants(organization_id,role_template_id,capability,effect,scope_type,scope_ids)
SELECT r.organization_id,r.id,p.capability,'allow','all_org','{}'::uuid[]
FROM role_templates r
JOIN permission_definitions p ON p.capability IN (
  'operations.crew.read','operations.crew.manage','assets.read','assets.manage','supply.housing.read','supply.housing.manage'
)
WHERE r.code='director'
ON CONFLICT DO NOTHING;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'object_crews','object_crew_members','worker_absence_plans','storage_locations',
    'inventory_items','inventory_stock_limits','inventory_movements',
    'housing_sites','housing_units','housing_stays'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I',table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id())',
      table_name
    );
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_object_crews_object ON object_crews(organization_id,object_id,status);
CREATE INDEX IF NOT EXISTS idx_crew_members_worker ON object_crew_members(organization_id,worker_id,effective_to);
CREATE INDEX IF NOT EXISTS idx_worker_absence_period ON worker_absence_plans(organization_id,worker_id,planned_from,planned_to);
CREATE INDEX IF NOT EXISTS idx_storage_locations_object ON storage_locations(organization_id,object_id,active);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_date ON inventory_movements(organization_id,item_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_from ON inventory_movements(organization_id,from_location_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_to ON inventory_movements(organization_id,to_location_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_worker ON inventory_movements(organization_id,worker_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_housing_sites_object ON housing_sites(organization_id,primary_object_id,active);
CREATE INDEX IF NOT EXISTS idx_housing_stays_active ON housing_stays(organization_id,site_id,status,check_in,check_out);

DROP TRIGGER IF EXISTS audit_object_crews ON object_crews;
CREATE TRIGGER audit_object_crews AFTER INSERT OR UPDATE OR DELETE ON object_crews
FOR EACH ROW EXECUTE FUNCTION audit_row_change();
DROP TRIGGER IF EXISTS audit_object_crew_members ON object_crew_members;
CREATE TRIGGER audit_object_crew_members AFTER INSERT OR UPDATE OR DELETE ON object_crew_members
FOR EACH ROW EXECUTE FUNCTION audit_row_change();
DROP TRIGGER IF EXISTS audit_worker_absence_plans ON worker_absence_plans;
CREATE TRIGGER audit_worker_absence_plans AFTER INSERT OR UPDATE OR DELETE ON worker_absence_plans
FOR EACH ROW EXECUTE FUNCTION audit_row_change();
DROP TRIGGER IF EXISTS audit_storage_locations ON storage_locations;
CREATE TRIGGER audit_storage_locations AFTER INSERT OR UPDATE OR DELETE ON storage_locations
FOR EACH ROW EXECUTE FUNCTION audit_row_change();
DROP TRIGGER IF EXISTS audit_inventory_items ON inventory_items;
CREATE TRIGGER audit_inventory_items AFTER INSERT OR UPDATE OR DELETE ON inventory_items
FOR EACH ROW EXECUTE FUNCTION audit_row_change();
DROP TRIGGER IF EXISTS audit_inventory_stock_limits ON inventory_stock_limits;
CREATE TRIGGER audit_inventory_stock_limits AFTER INSERT OR UPDATE OR DELETE ON inventory_stock_limits
FOR EACH ROW EXECUTE FUNCTION audit_row_change();
DROP TRIGGER IF EXISTS audit_inventory_movements ON inventory_movements;
CREATE TRIGGER audit_inventory_movements AFTER INSERT OR UPDATE OR DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION audit_row_change();
DROP TRIGGER IF EXISTS audit_housing_sites ON housing_sites;
CREATE TRIGGER audit_housing_sites AFTER INSERT OR UPDATE OR DELETE ON housing_sites
FOR EACH ROW EXECUTE FUNCTION audit_row_change();
DROP TRIGGER IF EXISTS audit_housing_units ON housing_units;
CREATE TRIGGER audit_housing_units AFTER INSERT OR UPDATE OR DELETE ON housing_units
FOR EACH ROW EXECUTE FUNCTION audit_row_change();
DROP TRIGGER IF EXISTS audit_housing_stays ON housing_stays;
CREATE TRIGGER audit_housing_stays AFTER INSERT OR UPDATE OR DELETE ON housing_stays
FOR EACH ROW EXECUTE FUNCTION audit_row_change();

COMMIT;
