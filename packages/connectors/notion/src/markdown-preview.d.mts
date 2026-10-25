export type NotionMarkdownLine={kind:"code"|"heading"|"quote"|"task"|"list"|"divider"|"paragraph";text:string};
export type NotionMarkdownPreview=Readonly<{version:"v1";format:"notion-enhanced-markdown";
  lines:NotionMarkdownLine[];truncated:boolean;unknownCount:number;
  lossy:true;mediaLinksSuppressed:true}>;
export function projectNotionMarkdown(raw:unknown,requestedId:string,
  options?:{maxLines?:number;maxCharacters?:number}):NotionMarkdownPreview;
