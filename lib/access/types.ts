export type ScopeType = "own_created" | "assigned_to_me" | "team" | "region" | "objects" | "clients" | "all_org";
export type ScopeGrant = { type: ScopeType; ids: string[] };

export type EffectiveAccess = {
  capabilities: string[];
  denies: string[];
  allOrg: boolean;
  scopes: Record<string, ScopeGrant[]>;
};

export type Actor = {
  userId: string;
  organizationId: string;
  membershipId: string;
  displayName: string;
  email: string;
  roleCode: string;
  roleName: string;
  teamIds: string[];
  regionIds: string[];
  access: EffectiveAccess;
  demo: boolean;
};
