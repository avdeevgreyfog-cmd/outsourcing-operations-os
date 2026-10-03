import Image from "next/image";

export type PersonAvatarKind="workerMan"|"workerWoman"|"officeMan"|"officeWoman";
export function PersonAvatar({kind="workerMan",size=34}:{kind?:PersonAvatarKind;size?:number}){
  return <Image className="operis-person-avatar" src={`/avatars/${kind}.png`} width={size} height={size} alt="" aria-hidden="true" unoptimized/>;
}
