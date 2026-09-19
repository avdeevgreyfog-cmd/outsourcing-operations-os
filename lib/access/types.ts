export type ScopeType = "self" | "own_created" | "assigned_to_me" | "team" | "org_unit" | "region" | "objects" | "clients" | "all_org";
export type ScopeGrant = { type: ScopeType; ids: string[] };

export type EffectiveAccess = {
  capabilities: string[];
  denies: string[];
  allOrg: boolean;
  scopes: Record<string, ScopeGrant[]>;
};

export type AccessPreview = {
  roleTemplateId: string;
  roleCode: string;
  roleName: string;
};

export type Actor = {
  userId: string;
  organizationId: string;
  organizationName?: string;
  organizationSlug?: string;
  membershipId: string;
  displayName: string;
  email: string;
  roleCode: string;
  roleName: string;
  baseRoleCode?: string;
  baseRoleName?: string;
  positionId?: string | null;
  positionName?: string | null;
  teamIds: string[];
  orgUnitIds: string[];
  regionIds: string[];
  access: EffectiveAccess;
  accessPreview?: AccessPreview | null;
  canAccessPreview?: boolean;
  demo: boolean;
};

export type WorkspaceOption = {
  key: string;
  id: string | null;
  name: string;
  slug: string;
  kind: "demo" | "tenant";
};

export type PreviewRoleOption = {
  id: string;
  code: string;
  name: string;
};

export type WorkspaceContext = {
  organizations: WorkspaceOption[];
  currentOrganizationKey: string;
  previewRoles: PreviewRoleOption[];
  previewRoleId: string | null;
  actualRoleName: string;
  hasRealSession: boolean;
};
