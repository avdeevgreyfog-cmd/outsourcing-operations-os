/** Missing demand and an explicit zero have different operational meanings. */
export function planningCoverage(required:number|null,coverage:number,past=false){
  if(required===null)return {label:"Потребность не задана",deficit:null,excess:null};
  const deficit=Math.max(required-coverage,0),excess=Math.max(coverage-required,0);
  const label=deficit?`${past?"Не хватило":"Дефицит"}: ${deficit}`:excess?`Сверх потребности: +${excess}`:required===0?"Выходы не требуются":past?"Факт закрыт":"План закрыт";
  return {label,deficit,excess};
}
