import {requireActor} from "@/lib/auth/server";
import {OperationsLayout} from "@/components/operations/OperationsLayout";
import {TemplatesWorkspace} from "@/components/patterns/TemplatesWorkspace";
export default async function Templates(){await requireActor();return <OperationsLayout><TemplatesWorkspace/></OperationsLayout>}
