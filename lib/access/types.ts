export type ScopeType = "self" | "own_created" | "assigned_to_me" | "team" | "org_unit" | "org_unit_subtree" | "region" | "objects" | "clients" | "all_org";
export type ScopeGrant = { type: ScopeType; ids: string[] };

export type EffectiveAccess = {
  capabilities: string[];
  denies: string[];
  allOrg: boolean;
  scopes: Record<string, ScopeGrant[]>;
};

export type AccessPreviewTargetType = "role_template" | "position" | "process_role";

export type AccessPreview = {
  targetType: AccessPreviewTargetType;
  targetId: string;
  code: string;
  name: string;
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

export type PreviewAccessOption = {
  id: string;
  code: string;
  name: string;
  targetType: AccessPreviewTargetType;
};

export type WorkspaceContext = {
  organizations: WorkspaceOption[];
  currentOrganizationKey: string;
  previewOptions: PreviewAccessOption[];
  previewTarget: string | null;
  actualRoleName: string;
  hasRealSession: boolean;
};
