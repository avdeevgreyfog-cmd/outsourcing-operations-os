const ORG="00000000-0000-4000-8000-000000000001";
const MOW="30000000-0000-4000-8000-000000000001";
const KLG="30000000-0000-4000-8000-000000000002";
const SALES="20000000-0000-4000-8000-000000000001";
const OPS="20000000-0000-4000-8000-000000000002";
const REC="20000000-0000-4000-8000-000000000003";
const director="10000000-0000-4000-8000-000000000001";
const sales="10000000-0000-4000-8000-000000000002";
const regional="10000000-0000-4000-8000-000000000003";
const objectManager="10000000-0000-4000-8000-000000000004";
const recruiter="10000000-0000-4000-8000-000000000005";
const economist="10000000-0000-4000-8000-000000000006";
const finance="10000000-0000-4000-8000-000000000007";

export const clients = [
 {id:"70000000-0000-4000-8000-000000000001",organizationId:ORG,name:"NordLog",legalName:"ООО «НордЛог»",status:"active",ownerUserId:sales,createdByUserId:sales,teamId:SALES,regionId:MOW,contacts:2,requests:3,objects:2},
 {id:"70000000-0000-4000-8000-000000000002",organizationId:ORG,name:"FormaBath",legalName:"ООО «Форма Бат»",status:"active",ownerUserId:sales,createdByUserId:sales,teamId:SALES,regionId:KLG,contacts:1,requests:2,objects:2},
 {id:"70000000-0000-4000-8000-000000000003",organizationId:ORG,name:"CityPack",legalName:"ООО «Сити Пак»",status:"active",ownerUserId:sales,createdByUserId:sales,teamId:SALES,regionId:MOW,contacts:3,requests:1,objects:1},
];

export const requests = [
 {id:"73000000-0000-4000-8000-000000000001",organizationId:ORG,title:"РЦ Север — запуск 15 сентября",client:"NordLog",clientId:clients[0].id,status:"calculated",location:"Москва, Дмитровское шоссе",regionId:MOW,ownerUserId:sales,createdByUserId:sales,teamId:SALES,start:"15.09.2026",roles:[{name:"Комплектовщик",count:24},{name:"Грузчик",count:8}],schedule:"6/1 · 12 ч присутствие · 11 ч оплачивается",housing:"Включить",vat:"С НДС"},
 {id:"73000000-0000-4000-8000-000000000002",organizationId:ORG,title:"Склад Калуга — усиление",client:"FormaBath",clientId:clients[1].id,status:"review",location:"Калуга",regionId:KLG,ownerUserId:sales,createdByUserId:sales,teamId:SALES,start:"05.09.2026",roles:[{name:"Сборщик мебели",count:12}],schedule:"6/1 · 11 ч",housing:"Включить",vat:"С НДС"},
];

export const calculations = [
 {id:"79000000-0000-4000-8000-000000000001",organizationId:ORG,requestId:requests[0].id,request:"РЦ Север",role:"Комплектовщик",name:"Базовый TK",model:"Employment / TK",status:"accepted",ownerUserId:economist,createdByUserId:economist,teamId:SALES,regionId:MOW,workerNet:390,totalCost:550,clientRate:670.73,marginPct:18,monthlyContribution:701216},
 {id:"79000000-0000-4000-8000-000000000002",organizationId:ORG,requestId:requests[0].id,request:"РЦ Север",role:"Грузчик",name:"Грузчики TK",model:"Employment / TK",status:"accepted",ownerUserId:economist,createdByUserId:economist,teamId:SALES,regionId:MOW,workerNet:420,totalCost:592,clientRate:713.25,marginPct:17,monthlyContribution:234740},
 {id:"79000000-0000-4000-8000-000000000003",organizationId:ORG,requestId:requests[1].id,request:"Склад Калуга",role:"Сборщик мебели",name:"Сценарий GPH",model:"GPH",status:"review",ownerUserId:economist,createdByUserId:economist,teamId:SALES,regionId:KLG,workerNet:410,totalCost:566,clientRate:690,marginPct:17.97,monthlyContribution:324000},
];

export const objects = [
 {id:"80000000-0000-4000-8000-000000000001",organizationId:ORG,name:"РЦ Север",code:"MOW-NL-01",client:"NordLog",clientId:clients[0].id,status:"launch",region:"Москва и МО",regionId:MOW,ownerUserId:objectManager,createdByUserId:sales,teamId:OPS,assigneeUserIds:[objectManager,regional],targetStart:"15.09",coverage:69,required:32,filled:22,deficit:10,risk:"high",revenueForecast:3110000,marginForecast:22.8},
 {id:"80000000-0000-4000-8000-000000000002",organizationId:ORG,name:"РЦ Восток",code:"MOW-NL-02",client:"NordLog",clientId:clients[0].id,status:"active",region:"Москва и МО",regionId:MOW,ownerUserId:objectManager,createdByUserId:director,teamId:OPS,assigneeUserIds:[objectManager,regional],targetStart:"01.06",coverage:96,required:47,filled:45,deficit:2,risk:"normal",revenueForecast:4850000,marginForecast:18.4},
 {id:"80000000-0000-4000-8000-000000000003",organizationId:ORG,name:"Завод Воротынск",code:"KLG-FB-01",client:"FormaBath",clientId:clients[1].id,status:"active",region:"Калужская область",regionId:KLG,ownerUserId:regional,createdByUserId:director,teamId:OPS,assigneeUserIds:[regional],targetStart:"10.04",coverage:100,required:31,filled:31,deficit:0,risk:"normal",revenueForecast:3760000,marginForecast:16.2},
 {id:"80000000-0000-4000-8000-000000000004",organizationId:ORG,name:"Склад Юг",code:"MOW-CP-01",client:"CityPack",clientId:clients[2].id,status:"risk",region:"Москва и МО",regionId:MOW,ownerUserId:objectManager,createdByUserId:director,teamId:OPS,assigneeUserIds:[objectManager,regional],targetStart:"15.07",coverage:82,required:28,filled:23,deficit:5,risk:"critical",revenueForecast:2410000,marginForecast:10.8},
 {id:"80000000-0000-4000-8000-000000000005",organizationId:ORG,name:"Склад Калуга",code:"KLG-FB-02",client:"FormaBath",clientId:clients[1].id,status:"active",region:"Калужская область",regionId:KLG,ownerUserId:regional,createdByUserId:director,teamId:OPS,assigneeUserIds:[regional],targetStart:"20.05",coverage:93,required:15,filled:14,deficit:1,risk:"watch",revenueForecast:1540000,marginForecast:14.1},
];

export const needs = [
 {id:"83000000-0000-4000-8000-000000000001",organizationId:ORG,objectId:objects[0].id,object:"РЦ Север",clientId:clients[0].id,regionId:MOW,specialty:"Комплектовщик",required:24,filled:17,deficit:7,deadline:"10.09",status:"open",ownerUserId:recruiter,createdByUserId:objectManager,assigneeUserIds:[recruiter,objectManager,regional]},
 {id:"83000000-0000-4000-8000-000000000002",organizationId:ORG,objectId:objects[0].id,object:"РЦ Север",clientId:clients[0].id,regionId:MOW,specialty:"Грузчик",required:8,filled:5,deficit:3,deadline:"10.09",status:"open",ownerUserId:recruiter,createdByUserId:objectManager,assigneeUserIds:[recruiter,objectManager,regional]},
 {id:"83000000-0000-4000-8000-000000000003",organizationId:ORG,objectId:objects[4].id,object:"Склад Калуга",clientId:clients[1].id,regionId:KLG,specialty:"Сборщик мебели",required:5,filled:4,deficit:1,deadline:"04.09",status:"open",ownerUserId:recruiter,createdByUserId:regional,assigneeUserIds:[recruiter,regional]},
];

export const candidates = [
 {id:"85000000-0000-4000-8000-000000000001",organizationId:ORG,fullName:"Алексей Орлов",phone:"+7 900 000-10-01",source:"Telegram",stage:"call",stageLabel:"Созвон",need:"Комплектовщик",object:"РЦ Север",objectId:objects[0].id,clientId:clients[0].id,regionId:MOW,ownerUserId:recruiter,createdByUserId:recruiter,assigneeUserIds:[recruiter,objectManager],nextAction:"Сегодня 14:30"},
 {id:"85000000-0000-4000-8000-000000000002",organizationId:ORG,fullName:"Илья Котов",phone:"+7 900 000-10-02",source:"Referral",stage:"documents",stageLabel:"Документы",need:"Комплектовщик",object:"РЦ Север",objectId:objects[0].id,clientId:clients[0].id,regionId:MOW,ownerUserId:recruiter,createdByUserId:recruiter,assigneeUserIds:[recruiter,objectManager],nextAction:"Сегодня 11:00"},
 {id:"85000000-0000-4000-8000-000000000003",organizationId:ORG,fullName:"Сергей Волков",phone:"+7 900 000-10-03",source:"Job board",stage:"first_shift",stageLabel:"Первый выход",need:"Комплектовщик",object:"РЦ Север",objectId:objects[0].id,clientId:clients[0].id,regionId:MOW,ownerUserId:recruiter,createdByUserId:recruiter,assigneeUserIds:[recruiter,objectManager],nextAction:"Подтверждён"},
 {id:"85000000-0000-4000-8000-000000000004",organizationId:ORG,fullName:"Максим Титов",phone:"+7 900 000-10-04",source:"Telegram",stage:"new",stageLabel:"Новый",need:"Сборщик мебели",object:"Склад Калуга",objectId:objects[4].id,clientId:clients[1].id,regionId:KLG,ownerUserId:recruiter,createdByUserId:recruiter,assigneeUserIds:[recruiter,regional],nextAction:"Завтра"},
];

export const workers = [
 {id:"88000000-0000-4000-8000-000000000001",organizationId:ORG,fullName:"Сергей Волков",status:"active",origin:"Сергей Волков · Job board",originalRecruiter:"Ольга Новикова",object:"РЦ Север",objectId:objects[0].id,clientId:clients[0].id,regionId:MOW,createdByUserId:recruiter,ownerUserId:objectManager,assigneeUserIds:[objectManager,recruiter,regional],employment:"ТК",rate:390,rateUnit:"₽/ч",monthHours:88,accrued:35820,paid:5000,payable:30820},
 {id:"88000000-0000-4000-8000-000000000002",organizationId:ORG,fullName:"Павел Ильин",status:"active",origin:"Legacy import",originalRecruiter:"—",object:"Склад Юг",objectId:objects[3].id,clientId:clients[2].id,regionId:MOW,createdByUserId:objectManager,ownerUserId:objectManager,assigneeUserIds:[objectManager,regional],employment:"ГПХ",rate:365,rateUnit:"₽/ч",monthHours:76,accrued:27740,paid:10000,payable:17740},
];

export const shifts = [
 {id:"8c000000-0000-4000-8000-000000000001",organizationId:ORG,objectId:objects[0].id,object:"РЦ Север",clientId:clients[0].id,regionId:MOW,date:"29.08",kind:"День",time:"08:00–20:00",specialty:"Комплектовщик",demand:18,assigned:17,reserve:1,confirmed:16,deficit:1,cost:72930,status:"closed",ownerUserId:objectManager,createdByUserId:objectManager,assigneeUserIds:[objectManager,regional]},
 {id:"8c000000-0000-4000-8000-000000000002",organizationId:ORG,objectId:objects[0].id,object:"РЦ Север",clientId:clients[0].id,regionId:MOW,date:"31.08",kind:"День",time:"08:00–20:00",specialty:"Комплектовщик",demand:20,assigned:16,reserve:2,confirmed:14,deficit:4,cost:68640,status:"open",ownerUserId:objectManager,createdByUserId:objectManager,assigneeUserIds:[objectManager,regional]},
 {id:"8c000000-0000-4000-8000-000000000003",organizationId:ORG,objectId:objects[3].id,object:"Склад Юг",clientId:clients[2].id,regionId:MOW,date:"31.08",kind:"Ночь",time:"20:00–08:00",specialty:"Грузчик",demand:10,assigned:8,reserve:0,confirmed:7,deficit:2,cost:40150,status:"open",ownerUserId:objectManager,createdByUserId:objectManager,assigneeUserIds:[objectManager,regional]},
];

export const timesheet = {
 organizationId:ORG, objectId:objects[0].id, object:"РЦ Север", clientId:clients[0].id, regionId:MOW,
 period:"16–31 августа 2026", clientHours:80, internalHours:88, discrepancy:8, status:"На сверке",
 rows:[
  {workerId:workers[0].id,name:"Сергей Волков",days:{"27":11,"28":11,"29":11,"30":0,"31":null},total:33,client:30,night:0,overtime:3,rate:390,accrual:12870},
  {workerId:workers[1].id,name:"Павел Ильин",days:{"27":11,"28":null,"29":0,"30":11,"31":11},total:33,client:33,night:11,overtime:0,rate:365,accrual:12045},
  {workerId:"demo-w3",name:"Иван Беляев",days:{"27":11,"28":11,"29":11,"30":null,"31":null},total:33,client:17,night:0,overtime:0,rate:380,accrual:12540}
 ],
 issue:{id:"91000000-0000-4000-8000-000000000001",difference:3,worker:"Сергей Волков",date:"27.08",reason:"Клиент не подтвердил переработку",owner:"Алексей Волков",status:"Открыто"}
};

export const financeRows = [
 {id:"f1",organizationId:ORG,objectId:objects[0].id,object:"РЦ Север",clientId:clients[0].id,regionId:MOW,revenue:53658,workerCost:35820,expenses:13100,contribution:4738,marginPct:8.83,planMarginPct:18,ownerUserId:objectManager,createdByUserId:finance,assigneeUserIds:[objectManager,regional]},
 {id:"f2",organizationId:ORG,objectId:objects[1].id,object:"РЦ Восток",clientId:clients[0].id,regionId:MOW,revenue:4850000,workerCost:3290000,expenses:665000,contribution:895000,marginPct:18.45,planMarginPct:19,ownerUserId:objectManager,createdByUserId:finance,assigneeUserIds:[objectManager,regional]},
 {id:"f3",organizationId:ORG,objectId:objects[2].id,object:"Завод Воротынск",clientId:clients[1].id,regionId:KLG,revenue:3760000,workerCost:2680000,expenses:471000,contribution:609000,marginPct:16.2,planMarginPct:17,ownerUserId:regional,createdByUserId:finance,assigneeUserIds:[regional]},
];

export const tasks = [
 {id:"99000000-0000-4000-8000-000000000001",organizationId:ORG,title:"Закрыть дефицит комплектовщиков",status:"open",priority:"critical",ownerUserId:recruiter,assigneeUserIds:[recruiter],regionId:MOW,objectId:objects[0].id,clientId:clients[0].id,due:"05.09",entity:"РЦ Север · потребность",createdByUserId:regional},
 {id:"99000000-0000-4000-8000-000000000002",organizationId:ORG,title:"Разобрать расхождение табеля 3 часа",status:"open",priority:"high",ownerUserId:objectManager,assigneeUserIds:[objectManager],regionId:MOW,objectId:objects[0].id,clientId:clients[0].id,due:"Сегодня 15:00",entity:"РЦ Север · сверка",createdByUserId:finance},
 {id:"99000000-0000-4000-8000-000000000003",organizationId:ORG,title:"Проверить КП РЦ Север",status:"done",priority:"normal",ownerUserId:sales,assigneeUserIds:[sales],regionId:MOW,clientId:clients[0].id,due:"28.08",entity:"КП v1",createdByUserId:director,teamId:SALES},
];

export const activity = [
 {time:"30 авг · 11:00",actor:"Дмитрий Орлов",text:"Согласовал клиентский табель РЦ Север"},
 {time:"29 авг · 20:10",actor:"Алексей Волков",text:"Закрыл дневную смену: 17 назначено, 16 подтверждено"},
 {time:"28 авг · 16:30",actor:"Елена Котова",text:"Расчёт РЦ Север согласован и зафиксирован"},
 {time:"28 авг · 12:20",actor:"Ольга Новикова",text:"Сергей Волков переведён из кандидата в сотрудника"},
];
