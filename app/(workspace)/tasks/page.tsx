import {requireActor} from "@/lib/auth/server";
import {listTasks} from "@/lib/data/service";
import {PageHeader,Section,Status} from "@/components/UI";
import {TaskQuickActions} from "@/components/TaskQuickActions";
import {hasCapability} from "@/lib/core/access.mjs";

const priorityLabels:Record<string,string>={low:"Низкий",normal:"Обычный",high:"Высокий",critical:"Критический"};
const statusLabels:Record<string,string>={open:"Открыта",in_progress:"В работе",done:"Выполнена",cancelled:"Отменена",blocked:"Заблокирована"};

export default async function Tasks(){
  const actor=await requireActor();
  const rows=await listTasks(actor);
  const canEdit=hasCapability(actor.access,"task.edit");
  return <>
    <PageHeader eyebrow="Рабочее пространство" title="Мои задачи" subtitle="Сроки и поручения, связанные с рабочими сущностями." breadcrumbs={[{label:"Главная"},{label:"Мои задачи"}]}/>
    <Section><table className="data-table"><thead><tr><th>Задача</th><th>Контекст</th><th>Срок</th><th>Приоритет</th><th>Статус</th>{canEdit&&<th>Действия</th>}</tr></thead><tbody>{rows.map(x=><tr key={x.id}><td className="cell-title">{x.title}</td><td>{x.entity??"—"}</td><td>{x.due??"—"}</td><td><Status tone={x.priority==="critical"?"bad":x.priority==="high"?"warn":"neutral"}>{priorityLabels[x.priority]??x.priority}</Status></td><td><Status tone={x.status==="done"?"good":x.status==="cancelled"?"neutral":"info"}>{statusLabels[x.status]??x.status}</Status></td>{canEdit&&<td><TaskQuickActions id={x.id} status={x.status} canEdit={canEdit}/></td>}</tr>)}</tbody></table></Section>
  </>;
}
