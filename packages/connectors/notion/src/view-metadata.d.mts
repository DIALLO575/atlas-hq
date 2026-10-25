export type NotionViewMetadata={
  id:string;name:string;type:string;url:string|null;
  databaseId:string;sourceId:string|null;hasFilter:boolean;sortCount:number;
  quickFilterCount:number;hasGrouping:boolean;layoutConfigured:boolean;
};
export function projectNotionViewMetadata(raw:unknown,args:{
  viewId:string;sourceKind:"database"|"data_source";resourceId:string
}):NotionViewMetadata;
