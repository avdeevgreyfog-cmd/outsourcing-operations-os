export type WorkerProfileData = {
  fullName: string; phone: string | null; email: string | null; city: string | null;
  birthDate: string | null; clothingSize: string | null; shoeSize: string | null;
  heightCm: number | null; notes: string | null;
};
export type WorkerEmploymentPeriod = {
  id: string; relationType: 'employment' | 'gph' | 'npd' | 'custom';
  effectiveFrom: string; effectiveTo: string | null; contractReference: string | null;
};
export type WorkerEditEvent = {id: string; date: string; summary: string; actor: string | null; reason: string | null; detail?: string};
export type WorkerEditorContext = {
  workerId: string; profile: WorkerProfileData; profileVersion: string; relationsVersion: string;
  relations: WorkerEmploymentPeriod[]; canEdit: boolean; events: WorkerEditEvent[];
};
