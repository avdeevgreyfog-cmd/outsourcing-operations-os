import {z} from "zod";

export const workerContactSchema=z.object({
  channel:z.enum(["phone","email","telegram","whatsapp","max","other"]),
  value:z.string().trim().min(1).max(240),
  label:z.string().trim().max(60).default(""),
}).strict().superRefine((contact,ctx)=>{
  if(contact.channel==="email"&&!z.string().email().safeParse(contact.value).success)ctx.addIssue({code:"custom",path:["value"],message:"Укажите корректную почту"});
  if((contact.channel==="phone"||contact.channel==="whatsapp")&&!/^\+?[\d\s()\-]{7,60}$/.test(contact.value))ctx.addIssue({code:"custom",path:["value"],message:"Укажите номер телефона"});
});
export const workerProfileSchema=z.object({
  fullName:z.string().trim().min(2,"Укажите ФИО сотрудника").max(240,"ФИО слишком длинное"),
  phone:z.string().trim().max(60).regex(/^\+?[\d\s()\-]{7,60}$/, "Укажите корректный телефон").nullable(),
  email:z.string().email("Укажите корректную почту").nullable(),
  contacts:z.array(workerContactSchema).max(12).optional(),
  revision:z.string().min(1).max(80),
}).strict();
export type WorkerContact=z.infer<typeof workerContactSchema>;
export type WorkerProfile={fullName:string;phone:string|null;email:string|null;contacts:WorkerContact[];revision:string;additionalContactsReady:boolean};
