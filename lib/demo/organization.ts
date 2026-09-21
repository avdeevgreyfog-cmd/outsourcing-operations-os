import type { CompanyEmployeeRow, CompanyProfile, OrganizationChangeSetRow, OrganizationUnitRow, PositionAssignmentRow, PositionRow, ProcessRoleRow, ResponsibilityRuleRow, StaffPositionRow } from "@/lib/organization/types";

const ORG = "00000000-0000-4000-8000-000000000001";
const MOW = "30000000-0000-4000-8000-000000000001";
const KLG = "30000000-0000-4000-8000-000000000002";
const VLA = "30000000-0000-4000-8000-000000000003";

const membershipId=(index:number)=>`50000000-0000-4000-8000-${String(index).padStart(12,"0")}`;
const userId=(index:number)=>`10000000-0000-4000-8000-${String(index).padStart(12,"0")}`;
const unitId=(index:number)=>`21000000-0000-4000-8000-${String(index).padStart(12,"0")}`;
const positionId=(index:number)=>`41000000-0000-4000-8000-${String(index).padStart(12,"0")}`;
const processRoleId=(index:number)=>`42000000-0000-4000-8000-${String(index).padStart(12,"0")}`;
const staffPositionId=(index:number)=>`43000000-0000-4000-8000-${String(index).padStart(12,"0")}`;

export const companyProfile: CompanyProfile = {
  id: ORG,
  name: "БЕТА · ОПЕРИС Аутсорсинг",
  slug: "operis-beta",
  legalEntities: [{ id: "31000000-0000-4000-8000-000000000001", name: "ООО «Оперис Аутсорсинг»", shortName: "Оперис Аутсорсинг", inn: "7700000000", primary: true }],
  regions: [
    { id: MOW, code: "MOW", name: "Москва и Московская область" },
    { id: KLG, code: "KLG", name: "Калужская область" },
    { id: VLA, code: "VLA", name: "Владимирская область" },
  ],
  directions: ["Производственный аутсорсинг", "Складской персонал", "Подбор персонала"],
};

export const organizationUnits: OrganizationUnitRow[] = [
  {id:unitId(1),organizationId:ORG,parentId:null,regionId:null,region:null,code:"company",name:"БЕТА · ОПЕРИС Аутсорсинг",kind:"company",description:"Тестовая рабочая модель компании для сквозной проверки OPERIS",active:true,sortOrder:0,employeeCount:14,staffPositionCount:14,vacancyCount:0,childCount:5,managerMembershipId:membershipId(1),manager:"Анна Лебедева"},
  {id:unitId(2),organizationId:ORG,parentId:unitId(1),regionId:null,region:null,code:"management",name:"Руководство",kind:"department",description:"Управление компанией",active:true,sortOrder:10,employeeCount:1,staffPositionCount:1,vacancyCount:0,childCount:0,managerMembershipId:membershipId(1),manager:"Анна Лебедева"},
  {id:unitId(3),organizationId:ORG,parentId:unitId(1),regionId:null,region:null,code:"commercial",name:"Коммерция",kind:"department",description:"Продажи, тендеры, расчёты, КП и договорная работа",active:true,sortOrder:20,employeeCount:1,staffPositionCount:1,vacancyCount:0,childCount:1,managerMembershipId:membershipId(2),manager:"Михаил Соколов"},
  {id:unitId(4),organizationId:ORG,parentId:unitId(3),regionId:null,region:null,code:"client-service",name:"Клиентский сервис",kind:"team",description:"Приём и сопровождение клиентских заявок",active:true,sortOrder:10,employeeCount:2,staffPositionCount:2,vacancyCount:0,childCount:0,managerMembershipId:membershipId(2),manager:"Михаил Соколов"},
  {id:unitId(5),organizationId:ORG,parentId:unitId(1),regionId:null,region:null,code:"operations",name:"Операции",kind:"department",description:"Управление портфелем объектов и производственным персоналом",active:true,sortOrder:30,employeeCount:1,staffPositionCount:1,vacancyCount:0,childCount:2,managerMembershipId:membershipId(3),manager:"Алексей Громов"},
  {id:unitId(6),organizationId:ORG,parentId:unitId(5),regionId:null,region:null,code:"object-managers",name:"Менеджеры объектов",kind:"team",description:"Ежедневное управление закреплёнными объектами",active:true,sortOrder:10,employeeCount:2,staffPositionCount:2,vacancyCount:0,childCount:0,managerMembershipId:membershipId(3),manager:"Алексей Громов"},
  {id:unitId(7),organizationId:ORG,parentId:unitId(5),regionId:null,region:null,code:"supply",name:"Обеспечение",kind:"team",description:"Снабжение, имущество, жильё и операционный документооборот",active:true,sortOrder:20,employeeCount:1,staffPositionCount:1,vacancyCount:0,childCount:0,managerMembershipId:membershipId(11),manager:"Ирина Белова"},
  {id:unitId(8),organizationId:ORG,parentId:unitId(1),regionId:null,region:null,code:"recruitment",name:"Подбор персонала",kind:"department",description:"Управление кадровой потребностью и воронкой подбора",active:true,sortOrder:40,employeeCount:1,staffPositionCount:1,vacancyCount:0,childCount:1,managerMembershipId:membershipId(5),manager:"Мария Лебедева"},
  {id:unitId(9),organizationId:ORG,parentId:unitId(8),regionId:null,region:null,code:"recruiters",name:"Группа подбора",kind:"team",description:"Поиск и сопровождение кандидатов до первого выхода",active:true,sortOrder:10,employeeCount:3,staffPositionCount:3,vacancyCount:0,childCount:0,managerMembershipId:membershipId(5),manager:"Мария Лебедева"},
  {id:unitId(10),organizationId:ORG,parentId:unitId(1),regionId:null,region:null,code:"finance",name:"Экономика и финансы",kind:"department",description:"Расчёты, начисления, выплаты и фактическая экономика объектов",active:true,sortOrder:50,employeeCount:2,staffPositionCount:2,vacancyCount:0,childCount:0,managerMembershipId:membershipId(7),manager:"Татьяна Миронова"},
];

export const positions: PositionRow[] = [
  {id:positionId(1),organizationId:ORG,code:"ceo",name:"Генеральный директор / собственник",purpose:"Управление компанией и финальные решения",description:"Первое лицо организации",duties:["Стратегическое управление","Финальные согласования","Контроль ключевых рисков"],responsibilities:["Результат компании","Коммерческие решения","Операционный и финансовый результат"],processes:["Управление","Коммерция","Операции","Финансы"],active:true,employeeCount:1,capabilityCount:20},
  {id:positionId(2),organizationId:ORG,code:"commercial-lead",name:"Руководитель коммерческого направления",purpose:"Развивать продажи и доводить сделки до запуска",duties:["Поиск новых заказов","Тендеры","Расчёты и КП","Договорная работа"],responsibilities:["Коммерческий результат","Корректность условий","Скорость сделки"],processes:["Заявка","Расчёт","КП","Договор"],active:true,employeeCount:1,capabilityCount:14},
  {id:positionId(3),organizationId:ORG,code:"client-manager",name:"Менеджер по клиентским заявкам",purpose:"Принимать и сопровождать заявки заказчиков",duties:["Принимать заявки","Уточнять условия","Вести клиента","Передавать заявку в работу"],responsibilities:["Полнота заявки","Срок реакции","Актуальность клиентских данных"],processes:["Клиенты","Заявки"],active:true,employeeCount:2,capabilityCount:8},
  {id:positionId(4),organizationId:ORG,code:"operations-head",name:"Руководитель объектов",purpose:"Управлять портфелем объектов и менеджерами",duties:["Распределять объекты","Контролировать запуск","Контролировать табели и риски","Разбирать эскалации"],responsibilities:["Результат портфеля","Своевременный запуск","Комплектация и качество"],processes:["Объекты","Запуски","Комплектация","Табели"],active:true,employeeCount:1,capabilityCount:18},
  {id:positionId(5),organizationId:ORG,code:"object-manager",name:"Менеджер объекта",purpose:"Обеспечивать стабильную ежедневную работу закреплённых объектов",duties:["Управлять сотрудниками и сменами","Вести табель","Контролировать обеспечение","Фиксировать инциденты"],responsibilities:["Выходы и смены","Табель","Комплектация","Обеспечение"],processes:["Объект","Смены","Табели","Персонал"],active:true,employeeCount:2,capabilityCount:15},
  {id:positionId(6),organizationId:ORG,code:"supply-specialist",name:"Специалист по снабжению и документообороту",purpose:"Обеспечивать объекты ресурсами и сопровождать операционные документы",duties:["Вести запасы","Обрабатывать заявки на обеспечение","Работать с поставщиками","Контролировать жильё и имущество"],responsibilities:["СИЗ и имущество","Срок исполнения заявок","Поставщики"],processes:["Снабжение","Имущество","Жильё"],active:true,employeeCount:1,capabilityCount:12},
  {id:positionId(7),organizationId:ORG,code:"recruitment-head",name:"Руководитель отдела подбора",purpose:"Управлять командой подбора и закрытием потребностей",duties:["Распределять потребности","Контролировать воронку","Управлять загрузкой","Контролировать подготовку к выходу"],responsibilities:["Закрытие потребностей","Срок подбора","Качество выхода"],processes:["Потребности","Подбор","Подготовка выхода"],active:true,employeeCount:1,capabilityCount:12},
  {id:positionId(8),organizationId:ORG,code:"recruiter",name:"Менеджер по подбору",purpose:"Искать и сопровождать кандидатов до первого выхода",duties:["Искать кандидатов","Вести коммуникацию","Собирать документы","Готовить к выходу"],responsibilities:["Кандидатская воронка","Документы","Подтверждённые выходы"],processes:["Подбор","Кандидаты","Документы"],active:true,employeeCount:3,capabilityCount:8},
  {id:positionId(9),organizationId:ORG,code:"economist",name:"Экономист",purpose:"Обеспечивать корректность коммерческих расчётов",duties:["Готовить расчёты","Проверять маржинальность","Вести нормативы"],responsibilities:["Расчёты","Ставки","Маржа"],processes:["Расчёт экономики","Согласование"],active:true,employeeCount:1,capabilityCount:10},
  {id:positionId(10),organizationId:ORG,code:"finance-manager",name:"Финансовый менеджер",purpose:"Контролировать начисления, выплаты и финансовый результат",duties:["Проверять начисления","Контролировать выплаты","Сверять табели","Анализировать P&L"],responsibilities:["Начисления","Выплаты","Финансовый результат"],processes:["Закрытие периода","Выплаты","P&L"],active:true,employeeCount:1,capabilityCount:12},
];

export const processRoles: ProcessRoleRow[] = [
  {id:processRoleId(1),organizationId:ORG,code:"commercial-owner",name:"Владелец коммерческого контура",description:"Расчёты, КП, тендеры и договоры",responsibility:"Коммерческий результат и передача согласованного заказа в запуск",active:true,employeeCount:1,capabilityCount:6},
  {id:processRoleId(2),organizationId:ORG,code:"client-request-manager",name:"Менеджер клиентских заявок",description:"Приём и сопровождение входящих заявок",responsibility:"Полнота и своевременная передача заявки",active:true,employeeCount:2,capabilityCount:4},
  {id:processRoleId(3),organizationId:ORG,code:"operations-owner",name:"Владелец портфеля объектов",description:"Управление всеми действующими объектами",responsibility:"Операционный результат портфеля",active:true,employeeCount:1,capabilityCount:7},
  {id:processRoleId(4),organizationId:ORG,code:"object-owner",name:"Ответственный за объект",description:"Ежедневная ответственность за закреплённые объекты",responsibility:"Смены, табели, персонал и качество",active:true,employeeCount:2,capabilityCount:8},
  {id:processRoleId(5),organizationId:ORG,code:"supply-owner",name:"Ответственный за обеспечение",description:"Снабжение и имущество",responsibility:"Исполнение заявок на обеспечение",active:true,employeeCount:1,capabilityCount:6},
  {id:processRoleId(6),organizationId:ORG,code:"recruitment-owner",name:"Руководитель подбора",description:"Распределение кадровой потребности",responsibility:"Закрытие потребностей и загрузка рекрутеров",active:true,employeeCount:1,capabilityCount:6},
  {id:processRoleId(7),organizationId:ORG,code:"recruiter",name:"Рекрутер",description:"Исполнитель подбора",responsibility:"Кандидаты по назначенным потребностям",active:true,employeeCount:3,capabilityCount:5},
  {id:processRoleId(8),organizationId:ORG,code:"calculation-economist",name:"Экономист расчётов",description:"Подготовка и проверка экономики",responsibility:"Корректность расчётов и нормативов",active:true,employeeCount:1,capabilityCount:5},
  {id:processRoleId(9),organizationId:ORG,code:"finance-controller",name:"Финансовый контролёр",description:"Закрытие периода и финансовый контроль",responsibility:"Начисления, выплаты и фактическая экономика",active:true,employeeCount:1,capabilityCount:6},
];

const role=(index:number)=>processRoles[index-1];

export const companyEmployees: CompanyEmployeeRow[] = [
  {id:membershipId(1),userId:userId(1),organizationId:ORG,name:"Анна Лебедева",email:"director@beta.local",phone:"+7 900 200-01-01",status:"active",positionId:positions[0].id,position:positions[0].name,orgUnitId:unitId(2),orgUnit:"Руководство",regionId:null,region:null,managerMembershipId:null,manager:null,roles:[],responsibilities:["Стратегия и результат компании","Финальные согласования","Контроль ключевых рисков"],primaryStaffPositionId:staffPositionId(1),primaryStaffPosition:"Генеральный директор / собственник",additionalAssignments:0,objectCount:5},
  {id:membershipId(2),userId:userId(2),organizationId:ORG,name:"Михаил Соколов",email:"commercial@beta.local",phone:"+7 900 200-02-02",status:"active",positionId:positions[1].id,position:positions[1].name,orgUnitId:unitId(3),orgUnit:"Коммерция",regionId:null,region:null,managerMembershipId:membershipId(1),manager:"Анна Лебедева",roles:[role(1)],responsibilities:["Поиск новых заказов","Тендеры, расчёты, КП и договоры"],primaryStaffPositionId:staffPositionId(2),primaryStaffPosition:"Руководитель коммерческого направления",additionalAssignments:0,objectCount:5},
  {id:membershipId(3),userId:userId(3),organizationId:ORG,name:"Алексей Громов",email:"operations@beta.local",phone:"+7 900 200-03-03",status:"active",positionId:positions[3].id,position:positions[3].name,orgUnitId:unitId(5),orgUnit:"Операции",regionId:null,region:null,managerMembershipId:membershipId(1),manager:"Анна Лебедева",roles:[role(3)],responsibilities:["Портфель из 5 объектов","Контроль менеджеров объектов","Эскалации и запуск"],primaryStaffPositionId:staffPositionId(5),primaryStaffPosition:"Руководитель объектов",additionalAssignments:0,objectCount:5},
  {id:membershipId(4),userId:userId(4),organizationId:ORG,name:"Дмитрий Орлов",email:"object1@beta.local",phone:"+7 900 200-04-04",status:"active",positionId:positions[4].id,position:positions[4].name,orgUnitId:unitId(6),orgUnit:"Менеджеры объектов",regionId:null,region:null,managerMembershipId:membershipId(3),manager:"Алексей Громов",roles:[role(4)],responsibilities:["РЦ Северный","Склад Маркет Подольск","Технопарк Калуга"],primaryStaffPositionId:staffPositionId(6),primaryStaffPosition:"Менеджер объекта",additionalAssignments:0,objectCount:3},
  {id:membershipId(5),userId:userId(5),organizationId:ORG,name:"Мария Лебедева",email:"recruitment@beta.local",phone:"+7 900 200-05-05",status:"active",positionId:positions[6].id,position:positions[6].name,orgUnitId:unitId(8),orgUnit:"Подбор персонала",regionId:null,region:null,managerMembershipId:membershipId(1),manager:"Анна Лебедева",roles:[role(6)],responsibilities:["Все кадровые потребности","Команда из трёх рекрутеров"],primaryStaffPositionId:staffPositionId(9),primaryStaffPosition:"Руководитель отдела подбора",additionalAssignments:0,objectCount:5},
  {id:membershipId(6),userId:userId(6),organizationId:ORG,name:"Елена Котова",email:"economist@beta.local",phone:"+7 900 200-06-06",status:"active",positionId:positions[8].id,position:positions[8].name,orgUnitId:unitId(10),orgUnit:"Экономика и финансы",regionId:null,region:null,managerMembershipId:membershipId(7),manager:"Татьяна Миронова",roles:[role(8)],responsibilities:["Коммерческие расчёты","База ставок","Контроль плановой маржи"],primaryStaffPositionId:staffPositionId(13),primaryStaffPosition:"Экономист",additionalAssignments:0,objectCount:5},
  {id:membershipId(7),userId:userId(7),organizationId:ORG,name:"Татьяна Миронова",email:"finance@beta.local",phone:"+7 900 200-07-07",status:"active",positionId:positions[9].id,position:positions[9].name,orgUnitId:unitId(10),orgUnit:"Экономика и финансы",regionId:null,region:null,managerMembershipId:membershipId(1),manager:"Анна Лебедева",roles:[role(9)],responsibilities:["Начисления и выплаты","Закрытие табелей","Фактический P&L"],primaryStaffPositionId:staffPositionId(14),primaryStaffPosition:"Финансовый менеджер",additionalAssignments:0,objectCount:5},
  {id:membershipId(8),userId:userId(8),organizationId:ORG,name:"Анна Воронова",email:"client1@beta.local",phone:"+7 900 200-08-08",status:"active",positionId:positions[2].id,position:positions[2].name,orgUnitId:unitId(4),orgUnit:"Клиентский сервис",regionId:null,region:null,managerMembershipId:membershipId(2),manager:"Михаил Соколов",roles:[role(2)],responsibilities:["Клиенты Север Логистик, ЭлектроМаш и Калуга Технопарк","Приём и сопровождение заявок"],primaryStaffPositionId:staffPositionId(3),primaryStaffPosition:"Менеджер по клиентским заявкам",additionalAssignments:0,objectCount:3},
  {id:membershipId(9),userId:userId(9),organizationId:ORG,name:"Елена Морозова",email:"client2@beta.local",phone:"+7 900 200-09-09",status:"active",positionId:positions[2].id,position:positions[2].name,orgUnitId:unitId(4),orgUnit:"Клиентский сервис",regionId:null,region:null,managerMembershipId:membershipId(2),manager:"Михаил Соколов",roles:[role(2)],responsibilities:["Клиенты Серпухов Фуд и МаркетФулфилмент","Приём и сопровождение заявок"],primaryStaffPositionId:staffPositionId(4),primaryStaffPosition:"Менеджер по клиентским заявкам",additionalAssignments:0,objectCount:2},
  {id:membershipId(10),userId:userId(10),organizationId:ORG,name:"Павел Никитин",email:"object2@beta.local",phone:"+7 900 200-10-10",status:"active",positionId:positions[4].id,position:positions[4].name,orgUnitId:unitId(6),orgUnit:"Менеджеры объектов",regionId:null,region:null,managerMembershipId:membershipId(3),manager:"Алексей Громов",roles:[role(4)],responsibilities:["Пищекомбинат Серпухов","ЭлектроМаш Владимир"],primaryStaffPositionId:staffPositionId(7),primaryStaffPosition:"Менеджер объекта",additionalAssignments:0,objectCount:2},
  {id:membershipId(11),userId:userId(11),organizationId:ORG,name:"Ирина Белова",email:"supply@beta.local",phone:"+7 900 200-11-11",status:"active",positionId:positions[5].id,position:positions[5].name,orgUnitId:unitId(7),orgUnit:"Обеспечение",regionId:null,region:null,managerMembershipId:membershipId(3),manager:"Алексей Громов",roles:[role(5)],responsibilities:["Запасы и имущество","Заявки на обеспечение","Жильё и поставщики"],primaryStaffPositionId:staffPositionId(8),primaryStaffPosition:"Специалист по снабжению и документообороту",additionalAssignments:0,objectCount:5},
  {id:membershipId(12),userId:userId(12),organizationId:ORG,name:"Ольга Зайцева",email:"recruiter1@beta.local",phone:"+7 900 200-12-12",status:"active",positionId:positions[7].id,position:positions[7].name,orgUnitId:unitId(9),orgUnit:"Группа подбора",regionId:null,region:null,managerMembershipId:membershipId(5),manager:"Мария Лебедева",roles:[role(7)],responsibilities:["РЦ Северный","Склад Маркет Подольск"],primaryStaffPositionId:staffPositionId(10),primaryStaffPosition:"Менеджер по подбору",additionalAssignments:0,objectCount:2},
  {id:membershipId(13),userId:userId(13),organizationId:ORG,name:"Ксения Волкова",email:"recruiter2@beta.local",phone:"+7 900 200-13-13",status:"active",positionId:positions[7].id,position:positions[7].name,orgUnitId:unitId(9),orgUnit:"Группа подбора",regionId:null,region:null,managerMembershipId:membershipId(5),manager:"Мария Лебедева",roles:[role(7)],responsibilities:["Пищекомбинат Серпухов","Технопарк Калуга"],primaryStaffPositionId:staffPositionId(11),primaryStaffPosition:"Менеджер по подбору",additionalAssignments:0,objectCount:2},
  {id:membershipId(14),userId:userId(14),organizationId:ORG,name:"Наталья Фомина",email:"recruiter3@beta.local",phone:"+7 900 200-14-14",status:"active",positionId:positions[7].id,position:positions[7].name,orgUnitId:unitId(9),orgUnit:"Группа подбора",regionId:null,region:null,managerMembershipId:membershipId(5),manager:"Мария Лебедева",roles:[role(7)],responsibilities:["ЭлектроМаш Владимир","Склад Маркет Подольск"],primaryStaffPositionId:staffPositionId(12),primaryStaffPosition:"Менеджер по подбору",additionalAssignments:0,objectCount:2},
];

const seat=(index:number,code:string,name:string,profileIndex:number,unitIndex:number,reportsTo:number|null,level:number):StaffPositionRow=>({
  id:staffPositionId(index),organizationId:ORG,code,name,jobProfileId:positionId(profileIndex),jobProfile:positions[profileIndex-1].name,
  orgUnitId:unitId(unitIndex),orgUnit:organizationUnits[unitIndex-1].name,regionId:organizationUnits[unitIndex-1].regionId,region:organizationUnits[unitIndex-1].region,
  reportsToPositionId:reportsTo?staffPositionId(reportsTo):null,reportsToPosition:reportsTo?null:null,capacity:1,occupied:1,open:0,level,status:"filled",effectiveFrom:"2026-01-01",effectiveTo:null,
});

export const staffPositions: StaffPositionRow[] = [
  seat(1,"CEO-01","Генеральный директор / собственник",1,2,null,0),
  seat(2,"COMM-HEAD-01","Руководитель коммерческого направления",2,3,1,1),
  seat(3,"CLIENT-01","Менеджер по клиентским заявкам",3,4,2,2),
  seat(4,"CLIENT-02","Менеджер по клиентским заявкам",3,4,2,2),
  seat(5,"OPS-HEAD-01","Руководитель объектов",4,5,1,1),
  seat(6,"OBJECT-01","Менеджер объекта",5,6,5,2),
  seat(7,"OBJECT-02","Менеджер объекта",5,6,5,2),
  seat(8,"SUPPLY-01","Специалист по снабжению и документообороту",6,7,5,2),
  seat(9,"REC-HEAD-01","Руководитель отдела подбора",7,8,1,1),
  seat(10,"REC-01","Менеджер по подбору",8,9,9,2),
  seat(11,"REC-02","Менеджер по подбору",8,9,9,2),
  seat(12,"REC-03","Менеджер по подбору",8,9,9,2),
  seat(13,"ECON-01","Экономист",9,10,14,2),
  seat(14,"FIN-01","Финансовый менеджер",10,10,1,1),
].map((item)=>{
  if(!item.reportsToPositionId)return item;
  const parent=staffPositionsPlaceholder[item.reportsToPositionId]??null;
  return {...item,reportsToPosition:parent};
});
const staffPositionsPlaceholder:Record<string,string>={};

for(const item of staffPositions)staffPositionsPlaceholder[item.id]=item.name;
for(const item of staffPositions)if(item.reportsToPositionId)item.reportsToPosition=staffPositionsPlaceholder[item.reportsToPositionId]??null;

export const positionAssignments: PositionAssignmentRow[] = companyEmployees.map((employee,index)=>({
  id:`44000000-0000-4000-8000-${String(index+1).padStart(12,"0")}`,organizationId:ORG,staffPositionId:staffPositionId(index+1),
  membershipId:employee.id,employeeName:employee.name,assignmentType:"primary",fte:1,status:"active",effectiveFrom:"2026-01-01",effectiveTo:null,
}));

export const responsibilityRules: ResponsibilityRuleRow[] = [
  {id:"45000000-0000-4000-8000-000000000001",process:"Коммерция",step:"Расчёт и коммерческое решение",responsibilityType:"owner",subjectType:"process_role",subjectName:"Владелец коммерческого контура",scopeLabel:"Вся компания",fallbackName:"Генеральный директор"},
  {id:"45000000-0000-4000-8000-000000000002",process:"Клиентские заявки",step:"Приём и квалификация",responsibilityType:"executor",subjectType:"process_role",subjectName:"Менеджер клиентских заявок",scopeLabel:"Назначенные клиенты",fallbackName:"Руководитель коммерческого направления"},
  {id:"45000000-0000-4000-8000-000000000003",process:"Операции",step:"Портфель объектов",responsibilityType:"owner",subjectType:"process_role",subjectName:"Владелец портфеля объектов",scopeLabel:"Все объекты",fallbackName:"Генеральный директор"},
  {id:"45000000-0000-4000-8000-000000000004",process:"Операции",step:"Ежедневное управление объектом",responsibilityType:"owner",subjectType:"process_role",subjectName:"Ответственный за объект",scopeLabel:"Назначенные объекты",fallbackName:"Руководитель объектов"},
  {id:"45000000-0000-4000-8000-000000000005",process:"Подбор",step:"Распределение потребностей",responsibilityType:"owner",subjectType:"process_role",subjectName:"Руководитель подбора",scopeLabel:"Все потребности",fallbackName:"Генеральный директор"},
  {id:"45000000-0000-4000-8000-000000000006",process:"Обеспечение",step:"Исполнение заявки",responsibilityType:"executor",subjectType:"process_role",subjectName:"Ответственный за обеспечение",scopeLabel:"Все объекты",fallbackName:"Руководитель объектов"},
  {id:"45000000-0000-4000-8000-000000000007",process:"Финансы",step:"Закрытие периода",responsibilityType:"approver",subjectType:"process_role",subjectName:"Финансовый контролёр",scopeLabel:"Вся компания",fallbackName:"Генеральный директор"},
];

export const organizationChangeSets: OrganizationChangeSetRow[] = [
  {id:"46000000-0000-4000-8000-000000000001",title:"БЕТА · распределение портфеля объектов",status:"applied",effectiveDate:"2026-09-01",itemCount:5,createdBy:"Алексей Громов"},
  {id:"46000000-0000-4000-8000-000000000002",title:"БЕТА · команда подбора",status:"applied",effectiveDate:"2026-09-01",itemCount:4,createdBy:"Мария Лебедева"},
];
