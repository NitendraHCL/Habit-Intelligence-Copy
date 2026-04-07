export interface ChartConfig {
  visible: boolean;
  order: number;
}

export interface FilterConfig {
  [filterName: string]: boolean; // e.g. location: true, gender: false
}

export interface PageConfig {
  visible: boolean;
  charts: Record<string, ChartConfig>;
  filters: FilterConfig;
}

export interface DashboardConfig {
  pages: Record<string, PageConfig>; // keyed by page slug e.g. "/portal/ohc/utilization"
}

// Default config — all visible, default order
export function getDefaultPageConfig(): PageConfig {
  return {
    visible: true,
    charts: {},
    filters: {},
  };
}

export function getDefaultConfig(): DashboardConfig {
  return { pages: {} };
}
