export type NotionColumn={name:string;key:string;type:string;options:string[]};
export type NotionSourceRef={id:string;name:string};
export type NotionSourceSchema={dataSourceId:string;columns:NotionColumn[];
 truncated:boolean;propertyCount:number};
export type NotionSourceRow={id:string;title:string;url:string|null;
 cells:Array<{name:string;value:string}>};
export function projectNotionDatabaseSources(raw:unknown,id:string):
 {databaseId:string;results:NotionSourceRef[];truncated:boolean};
export function projectNotionDataSourceSchema(raw:unknown,id:string):NotionSourceSchema;
export function projectNotionDataSourceRows(raw:unknown,id:string,schema:NotionSourceSchema,
 options?:{maxRows?:number}):{dataSourceId:string;results:NotionSourceRow[];
 hasMore:boolean;nextCursor:string|null;truncated:boolean;columns:NotionColumn[]};
