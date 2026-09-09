import {navigationManifest as baseNavigationManifest,filterNavigation,flattenNavigation} from "./navigation.mjs";

export const navigationManifest=baseNavigationManifest.map(section=>({
  ...section,
  groups:section.groups.map(group=>{
    let items=group.items.map(item=>{
      if(item.id!=="tenders")return item;
      const {status,...rest}=item;
      void status;
      return rest;
    });
    if(section.id==="organization"&&group.id==="management"&&!items.some(item=>item.id==="company-documents")){
      items=[{id:"company-documents",label:"Документы компании",href:"/organization/documents",capability:"company.document.read",keywords:"устав справки лицензии тендер документы"},...items];
    }
    return {...group,items};
  }),
}));

export {filterNavigation,flattenNavigation};
