export type OrganizationUnitKind = "company" | "department" | "region" | "branch" | "direction" | "team" | "project_group";

export type CompanyProfile = {
  id: string;
  name: string;
  slug: string;
  legalEntities: Array<{ id: string; name: string; shortName?: string | null; inn?: string | null; primary: boolean }>;
  regions: Array<{ id: string; name: string; code: string }>;
  directions: string[];
};

export type OrganizationUnitRow = {
  id: string;
  organizationId: string;
  parentId: string | null;
  regionId: string | null;
  region: string | null;
  code: string;
  name: string;
  kind: OrganizationUnitKind;
  description?: string | null;
  active: boolean;
  sortOrder: number;
  employeeCount: number;
  managerMembershipId?: string | null;
  manager?: string | null;
};

export type CompanyEmployeeRow = {
  id: string;
  userId: string;
  organizationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  positionId: string | null;
  position: string | null;
  orgUnitId: string | null;
  orgUnit: string | null;
  regionId: string | null;
  region: string | null;
  managerMembershipId: string | null;
  manager: string | null;
  roles: Array<{ id: string; name: string; code: string }>;
  responsibilities: string[];
};

export type PositionRow = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description?: string | null;
  purpose?: string | null;
  duties: string[];
  responsibilities: string[];
  processes: string[];
  active: boolean;
  employeeCount: number;
  capabilityCount: number;
};

export type ProcessRoleRow = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description?: string | null;
  responsibility?: string | null;
  active: boolean;
  employeeCount: number;
  capabilityCount: number;
};

