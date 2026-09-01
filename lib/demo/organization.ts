import type { CompanyEmployeeRow, CompanyProfile, OrganizationChangeSetRow, OrganizationUnitRow, PositionAssignmentRow, PositionRow, ProcessRoleRow, ResponsibilityRuleRow, StaffPositionRow } from "@/lib/organization/types";

const ORG = "00000000-0000-4000-8000-000000000001";
const MOW = "30000000-0000-4000-8000-000000000001";
const KLG = "30000000-0000-4000-8000-000000000002";

export const companyProfile: CompanyProfile = {
  id: ORG,
  name: "OPERIS Demo",
  slug: "operis-demo",
  legalEntities: [{ id: "31000000-0000-4000-8000-000000000001", name: "ООО «Оперис Персонал»", shortName: "Оперис Персонал", inn: "7700000000", primary: true }],
  regions: [{ id: MOW, code: "MOW", name: "Москва и МО" }, { id: KLG, code: "KLG", name: "Калужская область" }],
  directions: ["Производственный аутсорсинг", "Staffing"],
};

export const organizationUnits: OrganizationUnitRow[] = [
  { id:"21000000-0000-4000-8000-000000000001",organizationId:ORG,parentId:null,regionId:null,region:null,code:"company",name:"OPERIS Demo",kind:"company",description:"Управляющая компания",active:true,sortOrder:0,employeeCount:7,managerMembershipId:"50000000-0000-4000-8000-000000000001",manager:"Анна Лебедева" },
  { id:"21000000-0000-4000-8000-000000000002",organizationId:ORG,parentId:"21000000-0000-4000-8000-000000000001",regionId:null,region:null,code:"management",name:"Руководство",kind:"department",active:true,sortOrder:10,employeeCount:1,managerMembershipId:"50000000-0000-4000-8000-000000000001",manager:"Анна Лебедева" },
  { id:"21000000-0000-4000-8000-000000000003",organizationId:ORG,parentId:"21000000-0000-4000-8000-000000000001",regionId:null,region:null,code:"commerce",name:"Коммерция",kind:"direction",active:true,sortOrder:20,employeeCount:1,managerMembershipId:"50000000-0000-4000-8000-000000000002",manager:"Илья Морозов" },
  { id:"21000000-0000-4000-8000-000000000004",organizationId:ORG,parentId:"21000000-0000-4000-8000-000000000001",regionId:null,region:null,code:"recruiting",name:"Подбор",kind:"department",active:true,sortOrder:30,employeeCount:1,managerMembershipId:"50000000-0000-4000-8000-000000000005",manager:"Ольга Новикова" },
  { id:"21000000-0000-4000-8000-000000000005",organizationId:ORG,parentId:"21000000-0000-4000-8000-000000000001",regionId:null,region:null,code:"economics",name:"Экономика и финансы",kind:"department",active:true,sortOrder:40,employeeCount:2,managerMembershipId:"50000000-0000-4000-8000-000000000007",manager:"Дмитрий Орлов" },
  { id:"21000000-0000-4000-8000-000000000006",organizationId:ORG,parentId:"21000000-0000-4000-8000-000000000001",regionId:MOW,region:"Москва и МО",code:"operations-mow",name:"Операции · Москва",kind:"region",active:true,sortOrder:50,employeeCount:2,managerMembershipId:"50000000-0000-4000-8000-000000000003",manager:"Мария Соколова" },
  { id:"21000000-0000-4000-8000-000000000007",organizationId:ORG,parentId:"21000000-0000-4000-8000-000000000001",regionId:KLG,region:"Калужская область",code:"operations-klg",name:"Операции · Калуга",kind:"region",active:true,sortOrder:60,employeeCount:0,managerMembershipId:null,manager:null },
  { id:"21000000-0000-4000-8000-000000000008",organizationId:ORG,parentId:"21000000-0000-4000-8000-000000000006",regionId:MOW,region:"Москва и МО",code:"objects-mow",name:"Объектовые команды",kind:"team",active:true,sortOrder:10,employeeCount:1,managerMembershipId:"50000000-0000-4000-8000-000000000004",manager:"Алексей Волков" },
];

export const positions: PositionRow[] = [
  {id:"41000000-0000-4000-8000-000000000001",organizationId:ORG,code:"ceo",name:"Генеральный директор",purpose:"Управление компанией и результатами направлений",description:"Первое лицо организации",duties:["Утверждать стратегию и ключевые решения","Контролировать руководителей направлений"],responsibilities:["Результат компании","Система управления","Критические согласования"],processes:["Стратегическое управление","Согласования"],active:true,employeeCount:1,capabilityCount:6},
  {id:"41000000-0000-4000-8000-000000000002",organizationId:ORG,code:"sales-manager",name:"Менеджер по продажам",purpose:"Развивать клиентский портфель и доводить заявки до запуска",duties:["Вести клиента и заявку","Готовить коммерческие предложения"],responsibilities:["Клиенты","Заявки","Коммерческие условия"],processes:["Продажа","Запуск объекта"],active:true,employeeCount:1,capabilityCount:8},
  {id:"41000000-0000-4000-8000-000000000003",organizationId:ORG,code:"regional-manager",name:"Региональный менеджер",purpose:"Обеспечивать результат объектов региона",duties:["Контролировать объекты","Управлять менеджерами объектов"],responsibilities:["Регион","Объекты","Комплектование"],processes:["Запуск объекта","Операционное управление"],active:true,employeeCount:1,capabilityCount:11},
  {id:"41000000-0000-4000-8000-000000000004",organizationId:ORG,code:"object-manager",name:"Менеджер объекта",purpose:"Обеспечивать стабильную работу объекта заказчика",duties:["Контролировать выход персонала","Вести табели","Решать оперативные вопросы"],responsibilities:["Назначенные объекты","Персонал объекта","Сроки и качество"],processes:["Запуск объекта","Смены и табели"],active:true,employeeCount:1,capabilityCount:10},
  {id:"41000000-0000-4000-8000-000000000005",organizationId:ORG,code:"recruiter",name:"Рекрутер",purpose:"Закрывать потребности подходящими кандидатами",duties:["Обрабатывать отклики","Вести кандидата до выхода"],responsibilities:["Назначенные потребности","Кандидаты"],processes:["Подбор","Подготовка к выходу"],active:true,employeeCount:1,capabilityCount:6},
  {id:"41000000-0000-4000-8000-000000000006",organizationId:ORG,code:"economist",name:"Экономист",purpose:"Обеспечивать корректность экономики проектов",duties:["Готовить расчёты","Проверять маржинальность"],responsibilities:["Расчёты","Нормативы","Маржа"],processes:["Расчёт экономики","Согласование"],active:true,employeeCount:1,capabilityCount:7},
  {id:"41000000-0000-4000-8000-000000000007",organizationId:ORG,code:"finance-manager",name:"Финансовый менеджер",purpose:"Контролировать начисления, выплаты и финансовый результат",duties:["Проверять начисления","Планировать выплаты","Контролировать P&L"],responsibilities:["Начисления","Выплаты","Финансовый результат"],processes:["Закрытие периода","Выплаты"],active:true,employeeCount:1,capabilityCount:9},
];

export const processRoles: ProcessRoleRow[] = [
  {id:"42000000-0000-4000-8000-000000000001",organizationId:ORG,code:"client-curator",name:"Куратор клиента",description:"Единая точка ответственности по клиенту",responsibility:"Коммуникация, договорённости и эскалации по закреплённым клиентам",active:true,employeeCount:1,capabilityCount:3},
  {id:"42000000-0000-4000-8000-000000000002",organizationId:ORG,code:"object-owner",name:"Ответственный за объект",description:"Процессная роль для операционного контура",responsibility:"Результат и операционная устойчивость закреплённых объектов",active:true,employeeCount:2,capabilityCount:6},
  {id:"42000000-0000-4000-8000-000000000003",organizationId:ORG,code:"calculation-economist",name:"Экономист расчётов",description:"Подготовка и проверка экономики",responsibility:"Корректность расчётов и соблюдение нормативов",active:true,employeeCount:1,capabilityCount:4},
  {id:"42000000-0000-4000-8000-000000000004",organizationId:ORG,code:"timesheet-approver",name:"Согласующий табелей",description:"Контроль закрытия табельного периода",responsibility:"Проверка и согласование табелей",active:true,employeeCount:1,capabilityCount:2},
];

const role = (id:string) => processRoles.find((item) => item.id === id)!;
export const companyEmployees: CompanyEmployeeRow[] = [
  {id:"50000000-0000-4000-8000-000000000001",userId:"10000000-0000-4000-8000-000000000001",organizationId:ORG,name:"Анна Лебедева",email:"director@demo.local",phone:"+7 900 100-00-01",status:"active",positionId:positions[0].id,position:positions[0].name,orgUnitId:organizationUnits[1].id,orgUnit:organizationUnits[1].name,regionId:null,region:null,managerMembershipId:null,manager:null,roles:[],responsibilities:["Стратегия и результат компании","Критические согласования"]},
  {id:"50000000-0000-4000-8000-000000000002",userId:"10000000-0000-4000-8000-000000000002",organizationId:ORG,name:"Илья Морозов",email:"sales@demo.local",phone:"+7 900 100-00-02",status:"active",positionId:positions[1].id,position:positions[1].name,orgUnitId:organizationUnits[2].id,orgUnit:organizationUnits[2].name,regionId:null,region:null,managerMembershipId:companyEmployeesId(1),manager:"Анна Лебедева",roles:[role(processRoles[0].id)],responsibilities:["Клиенты NordLog и FormaBath","Коммерческие предложения"]},
  {id:"50000000-0000-4000-8000-000000000003",userId:"10000000-0000-4000-8000-000000000003",organizationId:ORG,name:"Мария Соколова",email:"regional@demo.local",phone:"+7 900 100-00-03",status:"active",positionId:positions[2].id,position:positions[2].name,orgUnitId:organizationUnits[5].id,orgUnit:organizationUnits[5].name,regionId:MOW,region:"Москва и МО",managerMembershipId:companyEmployeesId(1),manager:"Анна Лебедева",roles:[role(processRoles[1].id)],responsibilities:["Объекты Москвы и МО","Региональная операционная команда"]},
  {id:"50000000-0000-4000-8000-000000000004",userId:"10000000-0000-4000-8000-000000000004",organizationId:ORG,name:"Алексей Волков",email:"object@demo.local",phone:"+7 900 100-00-04",status:"active",positionId:positions[3].id,position:positions[3].name,orgUnitId:organizationUnits[7].id,orgUnit:organizationUnits[7].name,regionId:MOW,region:"Москва и МО",managerMembershipId:companyEmployeesId(3),manager:"Мария Соколова",roles:[role(processRoles[1].id),role(processRoles[3].id)],responsibilities:["РЦ Север","Склад Юг","Табели закреплённых объектов"]},
  {id:"50000000-0000-4000-8000-000000000005",userId:"10000000-0000-4000-8000-000000000005",organizationId:ORG,name:"Ольга Новикова",email:"recruiter@demo.local",phone:"+7 900 100-00-05",status:"active",positionId:positions[4].id,position:positions[4].name,orgUnitId:organizationUnits[3].id,orgUnit:organizationUnits[3].name,regionId:MOW,region:"Москва и МО",managerMembershipId:companyEmployeesId(1),manager:"Анна Лебедева",roles:[],responsibilities:["Потребности РЦ Север","Кандидаты до первого выхода"]},
  {id:"50000000-0000-4000-8000-000000000006",userId:"10000000-0000-4000-8000-000000000006",organizationId:ORG,name:"Елена Котова",email:"economist@demo.local",phone:"+7 900 100-00-06",status:"active",positionId:positions[5].id,position:positions[5].name,orgUnitId:organizationUnits[4].id,orgUnit:organizationUnits[4].name,regionId:null,region:null,managerMembershipId:companyEmployeesId(7),manager:"Дмитрий Орлов",roles:[role(processRoles[2].id)],responsibilities:["Расчёты экономики","База ставок"]},
  {id:"50000000-0000-4000-8000-000000000007",userId:"10000000-0000-4000-8000-000000000007",organizationId:ORG,name:"Дмитрий Орлов",email:"finance@demo.local",phone:"+7 900 100-00-07",status:"active",positionId:positions[6].id,position:positions[6].name,orgUnitId:organizationUnits[4].id,orgUnit:organizationUnits[4].name,regionId:null,region:null,managerMembershipId:companyEmployeesId(1),manager:"Анна Лебедева",roles:[],responsibilities:["Начисления и выплаты","Управленческий P&L"]},
];

function companyEmployeesId(index:number) { return `50000000-0000-4000-8000-${String(index).padStart(12,"0")}`; }

export const staffPositions: StaffPositionRow[] = [
  staffPosition(1,"CEO-01","Генеральный директор",0,1,1,null,"filled",0),
  staffPosition(2,"SALES-01","Менеджер по продажам",1,2,1,1,"filled",1),
  staffPosition(3,"REG-MOW-01","Региональный менеджер · Москва",2,5,1,1,"filled",1),
  staffPosition(4,"OBJ-MOW-01","Менеджер объекта · Москва 1",3,7,1,3,"filled",2),
  staffPosition(5,"OBJ-MOW-02","Менеджер объекта · Москва 2",3,7,1,3,"open",2),
  staffPosition(6,"OBJ-KLG-01","Менеджер объекта · Калуга 1",3,6,2,3,"open",2),
  staffPosition(7,"REC-01","Рекрутер",4,3,2,1,"open",1),
  staffPosition(8,"ECON-01","Экономист",5,4,1,9,"filled",2),
  staffPosition(9,"FIN-01","Финансовый менеджер",6,4,1,1,"filled",1),
];

function staffPosition(index:number,code:string,name:string,profileIndex:number,unitIndex:number,capacity:number,reportsToIndex:number|null,status:StaffPositionRow["status"],level:number):StaffPositionRow {
  const id=`43000000-0000-4000-8000-${String(index).padStart(12,"0")}`;
  const occupied=status==="filled"?1:0;
  return {id,organizationId:ORG,code,name,jobProfileId:positions[profileIndex].id,jobProfile:positions[profileIndex].name,orgUnitId:organizationUnits[unitIndex].id,orgUnit:organizationUnits[unitIndex].name,regionId:organizationUnits[unitIndex].regionId,region:organizationUnits[unitIndex].region,reportsToPositionId:reportsToIndex?`43000000-0000-4000-8000-${String(reportsToIndex).padStart(12,"0")}`:null,reportsToPosition:null,capacity,occupied,open:Math.max(0,capacity-occupied),level,status,effectiveFrom:"2026-01-01",effectiveTo:null};
}

export const positionAssignments: PositionAssignmentRow[] = [1,2,3,4,8,9].map((positionIndex,offset)=>({
  id:`44000000-0000-4000-8000-${String(offset+1).padStart(12,"0")}`,organizationId:ORG,staffPositionId:staffPositions[positionIndex-1].id,
  membershipId:companyEmployees[offset<4?offset:offset+1].id,employeeName:companyEmployees[offset<4?offset:offset+1].name,
  assignmentType:"primary",fte:1,status:"active",effectiveFrom:"2026-01-01",effectiveTo:null,
}));

export const responsibilityRules: ResponsibilityRuleRow[] = [
  {id:"45000000-0000-4000-8000-000000000001",process:"Запуск объекта",step:"Передача заявки",responsibilityType:"owner",subjectType:"process_role",subjectName:"Куратор клиента",scopeLabel:"Закреплённые клиенты",fallbackName:"Руководитель коммерции"},
  {id:"45000000-0000-4000-8000-000000000002",process:"Запуск объекта",step:"Расчёт ставки",responsibilityType:"executor",subjectType:"process_role",subjectName:"Экономист расчётов",scopeLabel:"Вся компания",fallbackName:"Финансовый менеджер"},
  {id:"45000000-0000-4000-8000-000000000003",process:"Запуск объекта",step:"Операционный запуск",responsibilityType:"owner",subjectType:"process_role",subjectName:"Ответственный за объект",scopeLabel:"Назначенные объекты",fallbackName:"Региональный менеджер"},
  {id:"45000000-0000-4000-8000-000000000004",process:"Закрытие табеля",step:"Проверка табеля",responsibilityType:"approver",subjectType:"process_role",subjectName:"Согласующий табелей",scopeLabel:"Назначенные объекты",fallbackName:"Региональный менеджер"},
  {id:"45000000-0000-4000-8000-000000000005",process:"Выплаты",step:"Формирование реестра",responsibilityType:"executor",subjectType:"staff_position",subjectName:"Финансовый менеджер",scopeLabel:"Вся компания",fallbackName:"Генеральный директор"},
];

export const organizationChangeSets: OrganizationChangeSetRow[] = [
  {id:"46000000-0000-4000-8000-000000000001",title:"Расширение операций в Калуге",status:"scheduled",effectiveDate:"2026-10-01",itemCount:4,createdBy:"Анна Лебедева"},
  {id:"46000000-0000-4000-8000-000000000002",title:"Штат объектовых команд Москвы",status:"review",effectiveDate:"2026-09-15",itemCount:2,createdBy:"Мария Соколова"},
  {id:"46000000-0000-4000-8000-000000000003",title:"Финансовый контур 2026",status:"applied",effectiveDate:"2026-01-01",itemCount:3,createdBy:"Анна Лебедева"},
];
