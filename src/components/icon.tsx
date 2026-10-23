import type { SVGProps } from "react";

type IconName = "grip" | "chevron-left" | "chevron-right" | "rotate-ccw" | "grid" | "layers" | "activity" | "settings" | "search" | "bot" | "apps" | "inbox" | "link" | "spark" | "arrow-up-right" | "arrow-right" | "menu" | "close";

const paths: Record<IconName, React.ReactNode> = {
  grip: <><circle cx="8" cy="5" r="1"/><circle cx="16" cy="5" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="19" r="1"/><circle cx="16" cy="19" r="1"/></>,
  "chevron-left": <path d="m14 6-6 6 6 6"/>,
  "chevron-right": <path d="m10 6 6 6-6 6"/>,
  "rotate-ccw": <><path d="M3 11a9 9 0 1 1 2.5 6.2"/><path d="M3 4v7h7"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
  activity: <><path d="M3 12h4l3-8 4 16 3-8h4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.6.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.6-.9l-1.7.7-1.4-2.4L7.5 15a8 8 0 0 1 0-1.9L6 12l1.4-2.4 1.7.7a8 8 0 0 1 1.6-.9L11 7.6h2.8l.3 1.8a8 8 0 0 1 1.6.9l1.7-.7 1.4 2.4-1.5 1.1a8 8 0 0 1 .1 1.9Z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  bot: <><rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 3v4M8 12h.01M16 12h.01M9 16h6"/></>,
  apps: <><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></>,
  inbox: <><path d="M4 4h16l2 10v5H2v-5L4 4Z"/><path d="M2 14h5l2 3h6l2-3h5"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7"/></>,
  spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z"/><path d="m19 15 1 2.5 2 1-2 1-1 2.5-1-2.5-2-1 2-1 1-2.5Z"/></>,
  "arrow-up-right": <><path d="M7 17 17 7M7 7h10v10"/></>,
  "arrow-right": <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  close: <><path d="m18 6-12 12M6 6l12 12"/></>,
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>{paths[name]}</svg>;
}
