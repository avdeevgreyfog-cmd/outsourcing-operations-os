import test from "node:test";
import assert from "node:assert/strict";
import {validTimesheetMonth,timesheetHours,summarizeWorkerTimesheet} from "../lib/operations/worker-timesheet.mjs";
import {workerContactLink} from "../lib/operations/worker-contact-links.mjs";

test("month selection accepts real months and rejects rollover and malformed periods",()=>{
 for(const month of ["2026-01","2026-09","2026-12"])assert(validTimesheetMonth(month));
 for(const month of ["2026-00","2026-13","2026-9","bad","2026-09-01"])assert(!validTimesheetMonth(month));
});
test("personal totals count day/night facts across objects without duplicate condition segments",()=>{
 const summary=summarizeWorkerTimesheet([{objectId:"a",object:"A",rows:[{dayCells:{1:11,2:"П",3:"НВ",4:"В"},nightCells:{5:"11,5"}},{dayCells:{1:11,6:4}}]},{objectId:"b",object:"B",rows:[{nightCells:{1:8,3:"?",4:"Б"}}]}]);
 assert.deepEqual(summary,{hours:34.5,shifts:4,dayShifts:2,nightShifts:2,workedDays:3});
 assert.equal(timesheetHours("?"),0);assert.equal(timesheetHours("П"),0);assert.equal(timesheetHours("НВ"),0);assert.equal(timesheetHours("11.5"),11.5);
});
test("contact links preserve independent numbers and never infer MAX links or execute unsafe URLs",()=>{
 assert.equal(workerContactLink({channel:"phone",value:"+7 (900) 123-45-67"}),"tel:+79001234567");
 assert.equal(workerContactLink({channel:"whatsapp",value:"+7 901 111-22-33"}),"https://wa.me/79011112233");
 assert.equal(workerContactLink({channel:"telegram",value:"@employee_name"}),"https://t.me/employee_name");
 for(const value of ["javascript:alert(1)","https://max.ru.evil.test/user","https://max.ru@evil.test/user","+7 900 123-45-67"])assert.equal(workerContactLink({channel:"max",value}),null);
 assert.equal(workerContactLink({channel:"max",value:"https://max.ru/u/provided-id"}),"https://max.ru/u/provided-id");
});

import {workerProfileSchema} from "../lib/operations/worker-profile-schema.ts";
test("profile writes validate independent channels and reject unrelated fields",()=>{
 const base={fullName:"Тестовый сотрудник",phone:"+7 900 123-45-67",email:null,revision:"version"};
 assert(workerProfileSchema.safeParse({...base,contacts:[{channel:"max",value:"+7 901 123-45-67",label:"Переписка"}]}).success);
 assert(!workerProfileSchema.safeParse({...base,contacts:[{channel:"email",value:"bad email"}]}).success);
 assert(!workerProfileSchema.safeParse({...base,status:"dismissed"}).success);
 assert(!workerProfileSchema.safeParse({...base,rate:100}).success);
 assert(!workerProfileSchema.safeParse({...base,phone:"not a phone"}).success);
});
