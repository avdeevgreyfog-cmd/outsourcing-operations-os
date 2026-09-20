import { githubPagesStaticParams } from "@/lib/demo/static-params";
import { isGithubPagesDemo } from "@/lib/demo/pages";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { CandidateProfileWorkspace } from "@/components/CandidateProfileWorkspace";
import { getCandidateProfile, getRecruitingOptions } from "@/lib/recruiting/service";

export function generateStaticParams(){
  return isGithubPagesDemo() ? githubPagesStaticParams.candidates.map((id)=>({id})) : [];
}

export default async function CandidatePage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const actor=await requireActor();
  const [profile,options]=await Promise.all([getCandidateProfile(actor,id),getRecruitingOptions(actor)]);
  if(!profile&&!actor.demo)notFound();
  const latest=profile?.applications[0];
  return <>
    <PageHeader eyebrow="Кандидат" title={profile?.fullName??"Карточка кандидата"} subtitle={latest?`${latest.need} · ${latest.object??"объект не выбран"}`:"Единая карточка человека и его история подбора"} breadcrumbs={[{label:"Люди"},{label:"Подбор",href:"/recruiting"},{label:"Кандидаты",href:"/candidates"},{label:profile?.fullName??"Кандидат"}]}/>
    <CandidateProfileWorkspace profile={profile} exitReasons={options.exitReasons} candidateId={id} demo={actor.demo} canEdit={hasCapability(actor.access,"recruiting.candidate.edit")} canConvert={hasCapability(actor.access,"recruiting.candidate.convert")}/>
  </>;
}
