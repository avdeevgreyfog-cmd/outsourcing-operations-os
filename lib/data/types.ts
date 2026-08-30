export type ScopedRow = {
  id: string;
  organizationId: string;
  createdByUserId?: string;
  ownerUserId?: string;
  assigneeUserIds?: string[];
  teamId?: string;
  regionId?: string;
  objectId?: string;
  clientId?: string;
};
