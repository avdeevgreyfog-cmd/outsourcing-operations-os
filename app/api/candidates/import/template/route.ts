import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentActor } from "@/lib/auth/server";
import { requireCapability } from "@/lib/access/server";

export async function GET(){
  const actor=await getCurrentActor();
  if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
  requireCapability(actor,"recruiting.candidate.import");
  const rows=[
    {
      "ФИО":"Иванов Иван Иванович",
      "Телефон":"+7 900 000-00-00",
      "Email":"",
      "Город":"Тула",
      "Telegram":"@username",
      "MAX":"",
      "WhatsApp":"",
      "Комментарий":"Пример строки — удалите перед загрузкой"
    }
  ];
  const sheet=XLSX.utils.json_to_sheet(rows,{header:["ФИО","Телефон","Email","Город","Telegram","MAX","WhatsApp","Комментарий"]});
  sheet["!cols"]=[{wch:32},{wch:20},{wch:28},{wch:18},{wch:20},{wch:20},{wch:20},{wch:44}];
  const book=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,sheet,"Кандидаты");
  const buffer=XLSX.write(book,{type:"buffer",bookType:"xlsx"});
  return new NextResponse(buffer,{
    headers:{
      "content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition":'attachment; filename="operis-candidates-import.xlsx"',
      "cache-control":"no-store",
    }
  });
}
