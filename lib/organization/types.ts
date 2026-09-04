export type OrganizationUnitKind = "company" | "department" | "region" | "branch" | "direction" | "team" | "project_group" | "object_team" | "other";

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
  staffPositionCount?: number;
  vacancyCount?: number;
  childCount?: number;
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
  primaryStaffPositionId?: string | null;
  primaryStaffPosition?: string | null;
  additionalAssignments?: number;
  objectCount?: number;
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

export type StaffPositionStatus = "planned" | "open" | "filled" | "frozen" | "closed";
export type StaffPositionRow = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  jobProfileId: string;
  jobProfile: string;
  orgUnitId: string;
  orgUnit: string;
  regionId: string | null;
  region: string | null;
  reportsToPositionId: string | null;
  reportsToPosition: string | null;
  capacity: number;
  occupied: number;
  open: number;
  level: number;
  status: StaffPositionStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  allowOverallocation?: boolean;
};

export type AccessSourceRow = {
  capability: string;
  label: string;
  effect: "allow" | "deny";
  scopeType: string | null;
  scopeIds: string[];
  sourceType: "role_template" | "job_profile" | "process_role" | "individual";
  sourceName: string;
};

export type PositionAssignmentRow = {
  id: string;
  organizationId: string;
  staffPositionId: string;
  membershipId: string;
  employeeName: string;
  assignmentType: "primary" | "additional" | "acting";
  fte: number;
  status: "planned" | "active" | "ended";
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type ResponsibilityRuleRow = {
  id: string;
  processCode?: string;
  process: string;
  stepCode?: string;
  step: string;
  responsibilityType: "owner" | "executor" | "approver" | "observer" | "fallback";
  subjectType: "process_role" | "staff_position" | "org_unit" | "membership";
  subjectName: string;
  scopeLabel: string;
  fallbackName: string | null;
  resolvedMembershipId?: string | null;
  resolvedEmployee?: string | null;
  resolutionStatus?: "resolved" | "missing" | "fallback" | "conflict";
};

export type OrganizationChangeSetRow = {
  id: string;
  title: string;
  status: "draft" | "review" | "approved" | "scheduled" | "applied" | "cancelled";
  effectiveDate: string;
  itemCount: number;
  createdBy: string;
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
