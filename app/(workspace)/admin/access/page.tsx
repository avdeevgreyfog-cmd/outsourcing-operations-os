import {requireActor} from "@/lib/auth/server";
import {listAccessUsers,listAudit} from "@/lib/data/service";
import {PageHeader,Section,Status} from "@/components/UI";
import {AccessEditor} from "@/components/AccessEditor";
import {hasCapability} from "@/lib/core/access.mjs";

export default async function Access(){
  const actor=await requireActor();
  const users=await listAccessUsers(actor);
  const audit=hasCapability(actor.access,"audit.read")?await listAudit(actor):[];
  const currentIsOwner=users.some(item=>item.membershipId===actor.membershipId&&item.isOwner);
  return <>
    <PageHeader
      eyebrow="Администрирование"
      title="Пользователи и доступ"
      subtitle="Системные полномочия отдельно от должности; рабочие права наследуются из должностного профиля, процессных ролей и области данных."
      breadcrumbs={[{label:"Администрирование"},{label:"Пользователи и права"}]}
    />
    <Section title="Редактор доступа" note="Изменения сохраняются сервером и попадают в журнал. Для штатной работы права лучше задавать должности, а не сотруднику.">
      <AccessEditor
        users={users}
        demo={actor.demo}
        canManageSystemAccess={hasCapability(actor.access,"admin.system_access.manage")}
        currentIsOwner={currentIsOwner}
      />
    </Section>
    {audit.length>0&&<Section title="Последние высокорисковые изменения">
      <table className="data-table">
        <thead><tr><th>Время</th><th>Пользователь</th><th>Действие</th><th>Запись</th><th>Комментарий</th></tr></thead>
        <tbody>{audit.map(x=><tr key={x.id}><td>{x.createdAt}</td><td className="cell-title">{x.actor}</td><td><Status tone="info">{x.action}</Status></td><td>{x.record}</td><td>{x.summary??"—"}</td></tr>)}</tbody>
      </table>
    </Section>}
  </>;
}
