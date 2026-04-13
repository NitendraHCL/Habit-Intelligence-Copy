// ── Built-in Dashboard Templates ──
// Global templates that can be cloned to any client.

import type { PageDefinition } from "@/lib/dashboard/types";

export const builtInTemplates: { name: string; config: PageDefinition }[] = [
  {
    name: "OHC Standard",
    config: {
      slug: "/portal/ohc/overview",
      title: "OHC Utilization Overview",
      subtitle: "Outpatient health center consultation analytics",
      icon: "Activity",
      navGroup: "OHC",
      filters: ["dateRange", "location", "gender", "ageGroup", "specialty"],
      sections: [
        {
          id: "kpis",
          type: "kpi_row",
          charts: ["total-consults", "unique-patients", "repeat-rate"],
        },
        {
          id: "trends",
          type: "full_width",
          charts: ["visit-trends"],
        },
        {
          id: "distributions",
          type: "chart_grid",
          columns: 2,
          charts: ["specialty-donut", "location-bar"],
        },
        {
          id: "details",
          type: "chart_grid",
          columns: 2,
          charts: ["demographics-sunburst", "peak-hours-heatmap"],
        },
      ],
      charts: {
        "total-consults": {
          id: "total-consults",
          type: "kpi",
          title: "Total Consultations",
          dataSource: {
            table: "aggregated_table.agg_appointment",
            where: { stage: { in: ["Completed", "Prescription Sent", "Re Open"] } },
          },
          transform: { metric: "count" },
          visualization: { format: "number" },
          thresholds: [
            { max: 1000, color: "#ef4444", label: "Low" },
            { max: 5000, color: "#f59e0b", label: "Medium" },
            { above: 5000, color: "#059669", label: "High" },
          ],
        },
        "unique-patients": {
          id: "unique-patients",
          type: "kpi",
          title: "Unique Patients",
          dataSource: {
            table: "aggregated_table.agg_appointment",
            where: { stage: { in: ["Completed", "Prescription Sent", "Re Open"] } },
          },
          transform: { metric: "count_distinct:uhid" },
          visualization: { format: "number" },
        },
        "repeat-rate": {
          id: "repeat-rate",
          type: "kpi",
          title: "Repeat Visit Rate",
          dataSource: {
            table: "aggregated_table.agg_appointment",
            where: { stage: { in: ["Completed", "Prescription Sent", "Re Open"] } },
          },
          transform: { metric: "count" },
          visualization: { format: "percentage" },
        },
        "visit-trends": {
          id: "visit-trends",
          type: "line",
          title: "Visit Trends",
          subtitle: "Monthly consultation trends",
          dataSource: {
            table: "aggregated_table.agg_appointment",
            where: { stage: { in: ["Completed", "Prescription Sent", "Re Open"] } },
          },
          transform: {
            groupBy: "month(slotstarttime)",
            metrics: [
              { key: "totalConsults", metric: "count", label: "Total Consults" },
              { key: "uniquePatients", metric: "count_distinct:uhid", label: "Unique Patients" },
            ],
            sort: "asc",
          },
          visualization: {
            colors: ["#4f46e5", "#0d9488"],
            showGrid: true,
            showLegend: true,
            strokeWidth: 2.5,
          },
          linkGroup: "main",
          receiveFilter: ["speciality_name"],
        },
        "specialty-donut": {
          id: "specialty-donut",
          type: "donut",
          title: "Visits by Specialty",
          subtitle: "Proportional distribution of consultations",
          dataSource: {
            table: "aggregated_table.agg_appointment",
            where: { stage: { in: ["Completed", "Prescription Sent", "Re Open"] } },
          },
          transform: {
            groupBy: "speciality_name",
            metric: "count",
            sort: "desc",
            limit: 8,
            groupRest: "Others",
          },
          visualization: { showLegend: true, innerRadius: "50%" },
          linkGroup: "main",
          emitFilter: { column: "speciality_name", on: "click" },
        },
        "location-bar": {
          id: "location-bar",
          type: "bar",
          title: "Consultations by Location",
          subtitle: "Volume per facility",
          dataSource: {
            table: "aggregated_table.agg_appointment",
            where: { stage: { in: ["Completed", "Prescription Sent", "Re Open"] } },
          },
          transform: {
            groupBy: "facility_name",
            metric: "count",
            sort: "desc",
            limit: 10,
            groupRest: "Others",
          },
          visualization: { orientation: "horizontal", showGrid: true },
          linkGroup: "main",
          emitFilter: { column: "facility_name", on: "click" },
        },
        "demographics-sunburst": {
          id: "demographics-sunburst",
          type: "sunburst",
          title: "Demographics",
          subtitle: "Age and gender distribution",
          dataSource: {
            table: "aggregated_table.agg_appointment",
            where: { stage: { in: ["Completed", "Prescription Sent", "Re Open"] } },
          },
          transform: {
            groupBy: "patient_gender",
            metric: "count",
          },
          linkGroup: "main",
          receiveFilter: ["speciality_name", "facility_name"],
        },
        "peak-hours-heatmap": {
          id: "peak-hours-heatmap",
          type: "heatmap",
          title: "Peak Consultation Hours",
          subtitle: "Hourly footfall by weekday",
          dataSource: {
            table: "aggregated_table.agg_appointment",
            where: { stage: { in: ["Completed", "Prescription Sent", "Re Open"] } },
          },
          transform: {
            groupBy: ["dow(slotstarttime)", "hour(slotstarttime)"],
            metric: "count",
          },
          visualization: {
            yLabels: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
          },
        },
      },
    },
  },
  {
    name: "Executive Summary",
    config: {
      slug: "/portal/executive-summary",
      title: "Executive Summary",
      subtitle: "High-level KPIs and trends for leadership review",
      icon: "Briefcase",
      navGroup: "MAIN",
      filters: ["dateRange"],
      sections: [
        {
          id: "kpis",
          type: "kpi_row",
          charts: ["exec-total", "exec-unique", "exec-locations", "exec-specialties"],
        },
        {
          id: "trend",
          type: "full_width",
          charts: ["exec-trend"],
        },
      ],
      charts: {
        "exec-total": {
          id: "exec-total",
          type: "kpi",
          title: "Total Consultations",
          dataSource: {
            table: "aggregated_table.agg_appointment",
            where: { stage: { in: ["Completed", "Prescription Sent", "Re Open"] } },
          },
          transform: { metric: "count" },
        },
        "exec-unique": {
          id: "exec-unique",
          type: "kpi",
          title: "Unique Patients",
          dataSource: {
            table: "aggregated_table.agg_appointment",
            where: { stage: { in: ["Completed", "Prescription Sent", "Re Open"] } },
          },
          transform: { metric: "count_distinct:uhid" },
        },
        "exec-locations": {
          id: "exec-locations",
          type: "kpi",
          title: "Active Locations",
          dataSource: {
            table: "aggregated_table.agg_appointment",
            where: { stage: { in: ["Completed", "Prescription Sent", "Re Open"] } },
          },
          transform: { metric: "count_distinct:facility_name" },
        },
        "exec-specialties": {
          id: "exec-specialties",
          type: "kpi",
          title: "Specialties",
          dataSource: {
            table: "aggregated_table.agg_appointment",
            where: { stage: { in: ["Completed", "Prescription Sent", "Re Open"] } },
          },
          transform: { metric: "count_distinct:speciality_name" },
        },
        "exec-trend": {
          id: "exec-trend",
          type: "area",
          title: "Monthly Consultation Volume",
          dataSource: {
            table: "aggregated_table.agg_appointment",
            where: { stage: { in: ["Completed", "Prescription Sent", "Re Open"] } },
          },
          transform: {
            groupBy: "month(slotstarttime)",
            metric: "count",
            sort: "asc",
          },
          visualization: {
            colors: ["#4f46e5"],
            showGrid: true,
            height: 300,
          },
        },
      },
    },
  },
];
