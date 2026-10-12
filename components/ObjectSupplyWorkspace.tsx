"use client";
import {useState} from "react";
import Link from "next/link";
import {Section,Status} from "@/components/UI";
import {ObjectPpeTemplatesWorkspace} from "@/components/ObjectPpeTemplatesWorkspace";
import type {WorkerRow} from "@/lib/data/service";
import type {HousingSiteRow,InventoryBalanceRow,InventoryItemRow,ObjectPpeTemplateRow,SupplyRequestRow} from "@/lib/operations/service";
import {rub} from "@/lib/ui/format";

type SpecialtyOption={id:string;name:string};

export function ObjectSupplyWorkspace({
  objectId,workers,balances,inventoryItems,templates,specialties,housing,requests,
  canAssets,canHousing,canProcurement,canManageAssets,demo,
}:{
  objectId:string;
  workers:WorkerRow[];
  balances:InventoryBalanceRow[];
  inventoryItems:InventoryItemRow[];
  templates:ObjectPpeTemplateRow[];
  specialties:SpecialtyOption[];
  housing:HousingSiteRow[];
  requests:SupplyRequestRow[];
  canAssets:boolean;
  canHousing:boolean;
  canProcurement:boolean;
  canManageAssets:boolean;
  demo:boolean;
}){
  const [view,setView]=useState<"issue"|"stock"|"norms"|"requests"|"housing">(canAssets?"issue":canProcurement?"requests":"housing");
  const missingWorkers=workers.filter(worker=>(worker.ppeMissingNames?.length??0)>0);
  const lowStock=balances.filter(row=>row.minQuantity>0&&row.usableQuantity<=row.minQuantity);
  const consumables=balances.filter(row=>row.category==="consumable");
  const individualStock=balances.filter(row=>row.category!=="consumable");
  const openRequests=requests.filter(row=>!["closed","rejected"].includes(row.status));

  return <div className="object-module-shell object-supply-workspace">
    <div className="object-supply-actions object-module-head">
      <div><h2>Обеспечение объекта</h2><p>Здесь — нормы, выдача и фактический запас этого объекта. Полные движения и управление складами остаются в общем контуре имущества.</p></div>
      <div className="page-actions">
        {canAssets&&<Link className="button" href={`/assets?object=${objectId}`}>Открыть полный склад</Link>}
        {canProcurement&&<Link className="button primary" href={`/procurement?object=${objectId}&create=1`}>Создать заявку</Link>}
      </div>
    </div>

    <div className="object-local-tabs" aria-label="Разделы обеспечения">
      {([["issue","Выдача сотрудникам",canAssets],["stock","Запасы",canAssets],["norms","Комплекты и нормы",canAssets],["requests","Заявки",canProcurement],["housing","Жильё",canHousing]] as const).filter(([, ,allowed])=>allowed).map(([key,label])=><button key={key} type="button" aria-pressed={view===key} className={view===key?"active":""} onClick={()=>setView(key)}>{label}</button>)}
    </div>
    <div className="object-context-line"><span>Дообеспечить сотрудников: <b>{missingWorkers.length}</b></span><span>Ниже минимума: <b>{lowStock.length}</b></span><span>Открытые заявки: <b>{openRequests.length}</b></span></div>
    <div hidden={view!=="issue"} className="object-view-content">
    {canAssets&&<Section title="Требует выдачи сотрудникам" note="Показываются индивидуально учитываемые позиции по комплекту специальности. Расходники с периодической выдачей планируются через тот же комплект.">
      <div className="request-table-wrap"><table className="data-table object-supply-workers">
        <thead><tr><th>Сотрудник</th><th>Специальность</th><th>Размеры</th><th>Выдано</th><th>Не хватает</th><th></th></tr></thead>
        <tbody>{missingWorkers.map(worker=><tr key={worker.id}>
          <td><Link className="cell-title" href={`/workers/${worker.id}`}>{worker.fullName}</Link></td>
          <td>{worker.specialty??"—"}</td>
          <td>{[worker.clothingSize&&`одежда ${worker.clothingSize}`,worker.shoeSize&&`обувь ${worker.shoeSize}`].filter(Boolean).join(" · ")||"—"}</td>
          <td className="num">{Number(worker.ppeIssuedCount??0)} / {Number(worker.ppeRequiredCount??0)}</td>
          <td><strong className="object-supply-missing">{worker.ppeMissingNames?.join(", ")??"—"}</strong></td>
          <td>{canManageAssets?<Link className="button" href={`/assets?worker=${worker.id}&action=issue`}>Выдать</Link>:<Link className="table-link" href={`/workers/${worker.id}?tab=assets`}>Карточка</Link>}</td>
        </tr>)}</tbody>
      </table>{!missingWorkers.length&&<div className="empty-inline">По текущим нормам все сотрудники обеспечены.</div>}</div>
    </Section>}

    </div>
    <div hidden={view!=="stock"} className="object-view-content">
    {canAssets&&<div className="workspace-grid object-supply-stock-grid">
      <Section title="Запас объекта" note="Размеры и варианты показываются отдельными строками.">
        <div className="request-table-wrap"><table className="data-table">
          <thead><tr><th>Позиция</th><th>Размер / вариант</th><th>Остаток</th><th>Минимум</th><th>Состояние</th></tr></thead>
          <tbody>{individualStock.slice(0,14).map(row=>{const low=row.minQuantity>0&&row.usableQuantity<=row.minQuantity;return <tr key={row.locationId+row.itemId+row.variant}>
            <td><strong className="cell-title">{row.item}</strong><span className="cell-sub">{row.location}</span></td>
            <td>{row.variant||"—"}</td><td className="num">{row.usableQuantity} {row.unit}<span className="cell-sub">новое {row.newQuantity} · б/у {row.goodQuantity}</span></td><td className="num">{row.minQuantity||"—"}</td>
            <td>{low&&canProcurement?<Link className="table-link" href={`/procurement?object=${objectId}&item=${row.itemId}&location=${row.locationId}&quantity=${encodeURIComponent(String(Math.max(row.minQuantity-row.usableQuantity,1)))}&create=1`}>Пополнить · {Math.max(row.minQuantity-row.usableQuantity,1)} {row.unit}</Link>:<Status tone={low?"warn":"good"}>{low?"Пополнить":"В норме"}</Status>}</td>
          </tr>})}</tbody>
        </table>{!individualStock.length&&<div className="empty-inline">Остатки индивидуального имущества на объекте пока не заведены.</div>}</div>
        <div className="section-actions"><Link className="button" href={`/assets?object=${objectId}`}>Все остатки и движения</Link></div>
      </Section>

      <Section title="Расходники объекта" note="Выдаются на объект без привязки к конкретному сотруднику.">
        <div className="request-table-wrap"><table className="data-table">
          <thead><tr><th>Расходник</th><th>Вариант</th><th>Остаток</th><th>Минимум</th><th></th></tr></thead>
          <tbody>{consumables.map(row=>{const low=row.minQuantity>0&&row.usableQuantity<=row.minQuantity;return <tr key={row.locationId+row.itemId+row.variant}>
            <td><strong className="cell-title">{row.item}</strong><span className="cell-sub">{row.location}</span></td>
            <td>{row.variant||"—"}</td><td className="num">{row.usableQuantity} {row.unit}<span className="cell-sub">новое {row.newQuantity} · б/у {row.goodQuantity}</span></td><td className="num">{row.minQuantity||"—"}</td>
            <td>{low&&canProcurement?<Link className="table-link" href={`/procurement?object=${objectId}&item=${row.itemId}&location=${row.locationId}&quantity=${encodeURIComponent(String(Math.max(row.minQuantity-row.usableQuantity,1)))}&create=1`}>Пополнить</Link>:<Status tone={low?"warn":"good"}>{low?"Мало":"В норме"}</Status>}</td>
          </tr>})}</tbody>
        </table>{!consumables.length&&<div className="empty-inline">Расходные материалы на объекте пока не заведены.</div>}</div>
      </Section>
    </div>}

    </div>
    <div hidden={view!=="norms"} className="object-view-content">
    {canAssets&&<Section title="Комплекты и нормы по специальностям объекта" note="Базовый комплект приходит из общего контура обеспечения; здесь можно создать локальное переопределение состава и периодов выдачи.">
      <ObjectPpeTemplatesWorkspace objectId={objectId} templates={templates} inventoryItems={inventoryItems} specialties={specialties} canManage={canManageAssets} demo={demo}/>
    </Section>}

    </div>
    <div hidden={view!=="requests"} className="object-view-content">
    {canProcurement&&<Section title="Заявки на обеспечение" note="Здесь только заявки этого объекта; обработка и согласование идут в общей очереди.">
      <div className="request-table-wrap"><table className="data-table">
        <thead><tr><th>Заявка</th><th>Тип</th><th>Количество</th><th>Сумма</th><th>Статус</th></tr></thead>
        <tbody>{requests.slice(0,10).map(row=><tr key={row.id}>
          <td><strong className="cell-title">{row.title}</strong><span className="cell-sub">{row.item??row.description??row.createdAt}</span></td>
          <td>{row.requestType==="purchase"?"Закупка":row.requestType==="payment"?"Оплата":row.requestType==="compensation"?"Компенсация":"Услуга"}</td>
          <td className="num">{row.quantity==null?"—":`${row.quantity} ${row.unit??""}`}</td>
          <td className="num">{row.amount==null?"—":rub(row.amount)}</td>
          <td><Status tone={row.status==="closed"?"good":row.status==="rejected"?"bad":row.status==="submitted"?"warn":"info"}>{row.approvalStatus==="pending"?"На согласовании":row.status==="draft"?"Черновик":row.status==="submitted"?"Подана":row.status==="approved"?"Согласована":row.status==="in_progress"?"В работе":row.status==="received"?"Исполнено":row.status==="closed"?"Закрыта":row.status==="rejected"?"Отклонена":"В работе"}</Status></td>
        </tr>)}</tbody>
      </table>{!requests.length&&<div className="empty-inline">У объекта пока нет заявок на обеспечение.</div>}</div>
      <div className="section-actions"><Link className="button primary" href={`/procurement?object=${objectId}&create=1`}>Новая заявка</Link><Link className="button" href={`/procurement?object=${objectId}`}>Открыть общую очередь</Link></div>
    </Section>}

    </div>
    <div hidden={view!=="housing"} className="object-view-content">
    {canHousing&&<Section title="Связанный контур · жильё" note="Жильё остаётся отдельным рабочим контуром обеспечения.">
      <div className="stack-list">{housing.map(row=><div className="stack-item" key={row.id}><div><strong>{row.name}</strong><small>{row.occupied} занято · {row.available} свободно · {rub(row.monthlyForecast)}/мес</small></div><Status tone={row.available>0?"good":"warn"}>{row.capacity} мест</Status></div>)}</div>
      {!housing.length&&<div className="empty-inline">Жильё к объекту не привязано.</div>}
      <div className="section-actions"><Link className="button" href={`/supply/housing?object=${objectId}`}>Открыть жильё</Link></div>
    </Section>}
    </div>
  </div>;
}
