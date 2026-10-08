const destructivePattern=/\b(?:DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|DROP\s+(?:TABLE|SCHEMA|COLUMN)|ALTER\s+TABLE[\s\S]{0,200}\bDROP\b)\b/i;

export function isDestructiveMigration(body){
  const safeRelaxations=String(body).replace(/\bDROP\s+NOT\s+NULL\b/gi,'');
  return destructivePattern.test(safeRelaxations);
}
