export interface RawAppointment {
  slotdate: string; // "YYYY-MM-DD"
  dow: number;      // 0=Sun, 1=Mon, ... 6=Sat
  hour: number;     // 0-23
  uhid: string;
  facility_name: string;
  speciality_name: string;
  patient_gender: string;
  age_years: number | null;
  relationship: string | null;
}

/** slotdate now arrives as "YYYY-MM-DD" from the API (TO_CHAR in SQL) — use as-is */
function toLocalDate(ts: string): string {
  return ts.slice(0, 10);
}

/** Parse "YYYY-MM-DD" into a Date for day-of-week / hour extraction */
function toLocalDateObj(ts: string): Date {
  // Parse as local date (no timezone shift)
  const [y, m, d] = ts.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export interface OHCFilters {
  dateFrom: string;
  dateTo: string;
  locations: string[];
  genders: string[];
  ageGroups: string[];
  specialties: string[];
  relations: string[];
}

function getAgeGroup(age: number | null): string | null {
  if (age == null) return null;
  if (age < 20) return "<20";
  if (age <= 35) return "20-35";
  if (age <= 40) return "36-40";
  if (age <= 60) return "41-60";
  return "61+";
}

function normalizeGender(g: string | null): "M" | "F" | "O" {
  if (!g) return "O";
  const l = g.trim().toLowerCase();
  if (l === "male" || l === "m") return "M";
  if (l === "female" || l === "f") return "F";
  return "O";
}

function matchesGenderFilter(gender: string | null, filterGenders: string[]): boolean {
  if (!filterGenders.length) return true;
  const norm = normalizeGender(gender);
  return filterGenders.some((fg) => {
    const l = fg.toLowerCase();
    if (l === "male") return norm === "M";
    if (l === "female") return norm === "F";
    return norm === "O";
  });
}

function matchesAgeFilter(age: number | null, filterAgeGroups: string[]): boolean {
  if (!filterAgeGroups.length) return true;
  const group = getAgeGroup(age);
  if (!group) return false;
  return filterAgeGroups.includes(group);
}

/** Filter rows by date, location, specialty, relation, gender, age — does NOT filter by stage */
export function filterRows(rows: RawAppointment[], filters: OHCFilters): RawAppointment[] {
  return rows.filter((r) => {
    const d = toLocalDate(r.slotdate);
    if (filters.dateFrom && d < filters.dateFrom) return false;
    if (filters.dateTo && d > filters.dateTo) return false;
    if (filters.locations.length && !filters.locations.includes(r.facility_name)) return false;
    if (filters.specialties.length && !filters.specialties.includes(r.speciality_name)) return false;
    if (filters.relations.length && (!r.relationship || !filters.relations.includes(r.relationship))) return false;
    if (!matchesGenderFilter(r.patient_gender, filters.genders)) return false;
    if (!matchesAgeFilter(r.age_years, filters.ageGroups)) return false;
    return true;
  });
}

function yoyChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

const SUNBURST_COLORS: Record<string, string> = { "<20": "#818cf8", "20-35": "#0d9488", "36-40": "#d4d4d8", "41-60": "#a78bfa", "61+": "#6366f1" };
const GENDER_COLORS: Record<string, string> = { M: "#0d9488", F: "#a78bfa", O: "#a1a1aa" };
const AGE_ORDER = ["<20", "20-35", "36-40", "41-60", "61+"];

export function aggregateUtilization(filtered: RawAppointment[], allRows: RawAppointment[], filters: OHCFilters) {
  // ── KPIs ──
  const totalConsults = filtered.length;
  const uniqueUhids = new Set(filtered.map((r) => r.uhid));
  const uniquePatients = uniqueUhids.size;

  // Repeat patients: uhid with >= 2 visits
  const uhidCounts = new Map<string, number>();
  for (const r of filtered) uhidCounts.set(r.uhid, (uhidCounts.get(r.uhid) || 0) + 1);
  let repeatPatients = 0;
  uhidCounts.forEach((count) => { if (count >= 2) repeatPatients++; });

  const locationSet = new Set(filtered.map((r) => r.facility_name).filter(Boolean));
  const locationCount = locationSet.size;
  const repeatRate = uniquePatients > 0 ? Math.round((repeatPatients / uniquePatients) * 100) : 0;

  // ── YoY ──
  let yoyConsults: number | null = null;
  let yoyUnique: number | null = null;
  let yoyRepeat: number | null = null;
  if (filters.dateFrom && filters.dateTo) {
    const from = new Date(filters.dateFrom);
    const to = new Date(filters.dateTo);
    const prevFrom = new Date(from);
    prevFrom.setFullYear(prevFrom.getFullYear() - 1);
    const prevTo = new Date(to);
    prevTo.setFullYear(prevTo.getFullYear() - 1);
    const prevFromStr = prevFrom.toISOString().slice(0, 10);
    const prevToStr = prevTo.toISOString().slice(0, 10);

    const prevFilters = { ...filters, dateFrom: prevFromStr, dateTo: prevToStr };
    const prevFiltered = filterRows(allRows, prevFilters);
    const prevTotal = prevFiltered.length;
    const prevUhids = new Set(prevFiltered.map((r) => r.uhid));
    const prevUnique = prevUhids.size;
    const prevUhidCounts = new Map<string, number>();
    for (const r of prevFiltered) prevUhidCounts.set(r.uhid, (prevUhidCounts.get(r.uhid) || 0) + 1);
    let prevRepeat = 0;
    prevUhidCounts.forEach((count) => { if (count >= 2) prevRepeat++; });

    yoyConsults = yoyChange(totalConsults, prevTotal);
    yoyUnique = yoyChange(uniquePatients, prevUnique);
    yoyRepeat = yoyChange(repeatPatients, prevRepeat);
  }

  // ── Specialty Treemap ──
  const specMap = new Map<string, number>();
  for (const r of filtered) {
    if (r.speciality_name) specMap.set(r.speciality_name, (specMap.get(r.speciality_name) || 0) + 1);
  }
  const specialtyTreemap = Array.from(specMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // ── Location x Specialty ──
  const locSpecMap = new Map<string, Map<string, number>>();
  for (const r of filtered) {
    if (!r.facility_name || !r.speciality_name) continue;
    if (!locSpecMap.has(r.facility_name)) locSpecMap.set(r.facility_name, new Map());
    const sm = locSpecMap.get(r.facility_name)!;
    sm.set(r.speciality_name, (sm.get(r.speciality_name) || 0) + 1);
  }
  const specTotals = new Map<string, number>();
  locSpecMap.forEach((sm) => sm.forEach((count, spec) => specTotals.set(spec, (specTotals.get(spec) || 0) + count)));
  const topSpecialties = Array.from(specTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s);

  const locationBySpecialty = Array.from(locSpecMap.entries()).map(([location, sm]) => {
    const obj: Record<string, unknown> = { location };
    for (const spec of topSpecialties) {
      if (sm.has(spec)) obj[spec] = sm.get(spec);
    }
    return obj;
  }).sort((a, b) => {
    const sum = (obj: Record<string, unknown>) =>
      Object.entries(obj).filter(([k]) => k !== "location").reduce((s, [, v]) => s + (typeof v === "number" ? v : 0), 0);
    return sum(b) - sum(a);
  });

  // ── Demographics ──
  const ageGenderMap = new Map<string, Map<string, { consults: number; patients: Set<string> }>>();
  for (const r of filtered) {
    const ag = getAgeGroup(r.age_years);
    if (!ag) continue;
    const g = normalizeGender(r.patient_gender);
    if (!ageGenderMap.has(ag)) ageGenderMap.set(ag, new Map());
    const gm = ageGenderMap.get(ag)!;
    if (!gm.has(g)) gm.set(g, { consults: 0, patients: new Set() });
    const entry = gm.get(g)!;
    entry.consults++;
    entry.patients.add(r.uhid);
  }

  const demographicSunburst = AGE_ORDER.filter((ag) => ageGenderMap.has(ag)).map((ag) => ({
    name: ag,
    itemStyle: { color: SUNBURST_COLORS[ag] || "#888" },
    children: (["M", "F", "O"] as const)
      .filter((g) => ageGenderMap.get(ag)?.has(g) && ageGenderMap.get(ag)!.get(g)!.consults > 0)
      .map((g) => ({
        name: g,
        value: ageGenderMap.get(ag)!.get(g)!.consults,
        itemStyle: { color: GENDER_COLORS[g] },
      })),
  }));

  const genderTotals: Record<string, number> = {};
  const ageGroupTotals: Record<string, number> = {};
  let highestCohort = { ageGroup: "", gender: "", count: 0, patients: 0 };
  ageGenderMap.forEach((gm, ag) => {
    gm.forEach((entry, g) => {
      genderTotals[g] = (genderTotals[g] || 0) + entry.consults;
      ageGroupTotals[ag] = (ageGroupTotals[ag] || 0) + entry.consults;
      if (entry.consults > highestCohort.count) {
        highestCohort = {
          ageGroup: ag,
          gender: g === "M" ? "Male" : g === "F" ? "Female" : "Others",
          count: entry.consults,
          patients: entry.patients.size,
        };
      }
    });
  });
  const topGenderEntry = Object.entries(genderTotals).sort((a, b) => b[1] - a[1])[0];
  const topAgeEntry = Object.entries(ageGroupTotals).sort((a, b) => b[1] - a[1])[0];
  const gl = (g: string) => g === "M" ? "Male" : g === "F" ? "Female" : "Others";

  const demographicStats = {
    totalConsults,
    uniquePatients,
    highestCohort: highestCohort.count > 0 ? highestCohort : null,
    topGender: topGenderEntry ? { gender: gl(topGenderEntry[0]), count: topGenderEntry[1] } : null,
    topAgeGroup: topAgeEntry ? { ageGroup: topAgeEntry[0], count: topAgeEntry[1] } : null,
  };

  // ── Peak Hours ──
  const peakMap = new Map<string, number>();
  for (const r of filtered) {
    if (!r.slotdate) continue;
    const dow = r.dow;  // 0=Sun from DB
    const hour = r.hour; // 0-23 from DB
    if (hour < 6 || hour > 22) continue;
    const key = `${dow}:${hour}`;
    peakMap.set(key, (peakMap.get(key) || 0) + 1);
  }
  const dowToChart: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
  const peakHoursData: [number, number, number][] = [];
  let peakMax = 0;
  let peakCell = { day: 0, hour: 0, count: 0 };
  peakMap.forEach((count, key) => {
    const [dowStr, hourStr] = key.split(":");
    const dow = Number(dowStr);
    const hour = Number(hourStr);
    const dayIdx = dowToChart[dow];
    if (dayIdx === undefined) return;
    const hourIdx = hour - 6;
    peakHoursData.push([hourIdx, dayIdx, count]);
    if (count > peakMax) { peakMax = count; peakCell = { day: dayIdx, hour: hourIdx, count }; }
  });
  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const HOUR_NAMES = ["6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM", "9 PM", "10 PM"];

  // ── Bubble chart: per specialty → location × ageGroup with gender split ──
  const bubbleMap = new Map<string, Map<string, { total: number; male: number; female: number }>>();
  for (const r of filtered) {
    if (!r.speciality_name || !r.facility_name) continue;
    const ag = getAgeGroup(r.age_years);
    if (!ag) continue;
    const g = normalizeGender(r.patient_gender);
    const key = `${r.facility_name}|||${ag}`;
    if (!bubbleMap.has(r.speciality_name)) bubbleMap.set(r.speciality_name, new Map());
    const specBubble = bubbleMap.get(r.speciality_name)!;
    if (!specBubble.has(key)) specBubble.set(key, { total: 0, male: 0, female: 0 });
    const entry = specBubble.get(key)!;
    entry.total++;
    if (g === "M") entry.male++;
    else if (g === "F") entry.female++;
  }

  const bubbleBySpecialty: Record<string, { location: string; ageGroup: string; total: number; malePercent: number; male: number; female: number }[]> = {};
  const bubbleSpecTotals = new Map<string, number>();
  bubbleMap.forEach((locAgeMap, spec) => {
    let specTotal = 0;
    const entries: { location: string; ageGroup: string; total: number; malePercent: number; male: number; female: number }[] = [];
    locAgeMap.forEach((entry, key) => {
      const [location, ageGroup] = key.split("|||");
      const malePercent = entry.total > 0 ? Math.round((entry.male / entry.total) * 100) : 0;
      entries.push({ location, ageGroup, total: entry.total, malePercent, male: entry.male, female: entry.female });
      specTotal += entry.total;
    });
    bubbleBySpecialty[spec] = entries;
    bubbleSpecTotals.set(spec, specTotal);
  });

  const bubbleSpecialties = Array.from(bubbleSpecTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([spec]) => spec);

  return {
    kpis: { totalConsults, uniquePatients, repeatPatients, locationCount, repeatRate, yoyConsults, yoyUnique, yoyRepeat },
    charts: {
      demographicSunburst,
      demographicStats,
      locationBySpecialty,
      topSpecialties,
      visitTrends: [] as unknown[],
      avgConsults: 0,
      specialtyTreemap,
      peakHours: {
        data: peakHoursData,
        max: peakMax,
        peakDay: DAY_NAMES[peakCell.day] || "",
        peakHour: HOUR_NAMES[peakCell.hour] || "",
        peakCount: peakCell.count,
      },
      serviceCategories: [],
      bubbleBySpecialty,
      bubbleSpecialties,
    },
    lastUpdated: new Date().toISOString(),
  };
}

export function aggregateVisitTrends(
  filtered: RawAppointment[],
  trendView: "weekly" | "monthly" | "yearly"
): { visitTrends: { period: string; totalConsults: number; uniquePatients: number }[]; avgConsults: number } {
  const periodMap = new Map<string, { count: number; uhids: Set<string> }>();

  for (const r of filtered) {
    let period: string;
    if (trendView === "weekly") {
      const d = toLocalDateObj(r.slotdate);
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const days = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
      const week = Math.ceil((days + jan1.getDay() + 1) / 7);
      period = `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
    } else if (trendView === "yearly") {
      period = r.slotdate.slice(0, 4);
    } else {
      period = r.slotdate.slice(0, 7);
    }

    if (!periodMap.has(period)) periodMap.set(period, { count: 0, uhids: new Set() });
    const entry = periodMap.get(period)!;
    entry.count++;
    entry.uhids.add(r.uhid);
  }

  const visitTrends = Array.from(periodMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, entry]) => ({
      period,
      totalConsults: entry.count,
      uniquePatients: entry.uhids.size,
    }));

  const avgConsults = visitTrends.length > 0
    ? Math.round(visitTrends.reduce((s, v) => s + v.totalConsults, 0) / visitTrends.length)
    : 0;

  return { visitTrends, avgConsults };
}

export function aggregateRepeatTrends(
  filtered: RawAppointment[],
  view: "weekly" | "monthly" | "yearly"
): { data: { label: string; repeatVisits: number; repeatPatients: number }[] } {
  // Find repeat uhids (>1 visit in filtered set)
  const uhidCounts = new Map<string, number>();
  for (const r of filtered) uhidCounts.set(r.uhid, (uhidCounts.get(r.uhid) || 0) + 1);
  const repeatUhids = new Set<string>();
  uhidCounts.forEach((count, uhid) => { if (count > 1) repeatUhids.add(uhid); });

  // Only keep rows from repeat patients
  const repeatRows = filtered.filter((r) => repeatUhids.has(r.uhid));

  const periodMap = new Map<string, { visits: number; uhids: Set<string> }>();

  for (const r of repeatRows) {
    let period: string;
    if (view === "weekly") {
      const d = toLocalDateObj(r.slotdate);
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const days = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
      const week = Math.ceil((days + jan1.getDay() + 1) / 7);
      period = `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
    } else if (view === "yearly") {
      period = r.slotdate.slice(0, 4);
    } else {
      period = r.slotdate.slice(0, 7);
    }

    if (!periodMap.has(period)) periodMap.set(period, { visits: 0, uhids: new Set() });
    const entry = periodMap.get(period)!;
    entry.visits++;
    entry.uhids.add(r.uhid);
  }

  const data = Array.from(periodMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, entry]) => ({
      label,
      repeatVisits: entry.visits,
      repeatPatients: entry.uhids.size,
    }));

  return { data };
}

export function extractFilterOptions(rows: RawAppointment[]) {
  const locations = new Set<string>();
  const specialties = new Set<string>();
  const relations = new Set<string>();
  for (const r of rows) {
    if (r.facility_name?.trim()) locations.add(r.facility_name);
    if (r.speciality_name) specialties.add(r.speciality_name);
    if (r.relationship?.trim()) relations.add(r.relationship);
  }
  return {
    genders: ["Male", "Female", "Others"],
    ageGroups: ["<20", "20-35", "36-40", "41-60", "61+"],
    locations: Array.from(locations).sort(),
    specialties: Array.from(specialties).sort(),
    relations: Array.from(relations).sort(),
  };
}

/** Aggregate emotional wellbeing data from Psychologist rows */
export function aggregateEmotionalWellbeing(allRows: RawAppointment[], filters: OHCFilters) {
  // Filter to Psychologist + apply date/location/gender/age filters
  const filtered = filterRows(allRows, filters).filter((r) => r.speciality_name === "Psychologist");

  // KPIs
  const totalConsults = filtered.length;
  const uniqueUhids = new Set(filtered.map((r) => r.uhid));
  const uniquePatients = uniqueUhids.size;
  const uhidCounts = new Map<string, number>();
  for (const r of filtered) uhidCounts.set(r.uhid, (uhidCounts.get(r.uhid) || 0) + 1);
  let repeatPatients = 0;
  uhidCounts.forEach((count) => { if (count >= 2) repeatPatients++; });

  // Demographics: age
  const ageMap = new Map<string, number>();
  for (const r of filtered) {
    const ag = getAgeGroup(r.age_years);
    if (ag) ageMap.set(ag, (ageMap.get(ag) || 0) + 1);
  }
  const age = Array.from(ageMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, count]) => ({ label, count }));

  // Demographics: gender
  const genderMap = new Map<string, number>();
  for (const r of filtered) {
    const g = normalizeGender(r.patient_gender);
    const label = g === "M" ? "Male" : g === "F" ? "Female" : "Others";
    genderMap.set(label, (genderMap.get(label) || 0) + 1);
  }
  const gender = Array.from(genderMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));

  // Demographics: location
  const locMap = new Map<string, number>();
  for (const r of filtered) {
    if (r.facility_name?.trim()) locMap.set(r.facility_name, (locMap.get(r.facility_name) || 0) + 1);
  }
  const location = Array.from(locMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));

  // Consult trends (monthly)
  const trendMap = new Map<string, { count: number; uhids: Set<string> }>();
  for (const r of filtered) {
    const period = r.slotdate.slice(0, 7);
    if (!trendMap.has(period)) trendMap.set(period, { count: 0, uhids: new Set() });
    const entry = trendMap.get(period)!;
    entry.count++;
    entry.uhids.add(r.uhid);
  }
  const consultTrends = Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, entry]) => ({
      period,
      totalConsults: entry.count,
      uniquePatients: entry.uhids.size,
    }));

  return {
    kpis: { totalConsults, uniquePatients, repeatPatients, totalEwbAssessed: 0 },
    charts: {
      demographics: { age, gender, location, shift: [] },
      consultTrends,
      criticalRisk: { suicidalThoughts: 0, attemptedSelfHarm: 0, previousAttempts: 0, totalCases: 0 },
      substanceUsePct: 0,
      sleepQuality: [],
      sleepDuration: [],
      alcoholHabit: [],
      smokingHabit: [],
      visitPattern: [],
      impressions: [],
      impressionSubcategories: {},
      impressionsByVisitBucket: {},
      anxietyScale: [],
      depressionScale: [],
      selfEsteemScale: [],
    },
  };
}

/** Aggregate repeat visits data from appointment rows */
export function aggregateRepeatVisits(allRows: RawAppointment[], filters: OHCFilters, minVisits: number = 2) {
  const filtered = filterRows(allRows, filters);

  // Count visits per uhid
  const uhidCounts = new Map<string, number>();
  for (const r of filtered) uhidCounts.set(r.uhid, (uhidCounts.get(r.uhid) || 0) + 1);

  // Repeat patients = uhid with minVisits+ visits
  const repeatUhids = new Map<string, number>();
  uhidCounts.forEach((count, uhid) => { if (count >= minVisits) repeatUhids.set(uhid, count); });

  const totalRepeatPatients = repeatUhids.size;
  const totalConsultsByRepeat = Array.from(repeatUhids.values()).reduce((s, c) => s + c, 0);
  const avgVisitFrequency = totalRepeatPatients > 0
    ? Math.round((totalConsultsByRepeat / totalRepeatPatients) * 10) / 10
    : 0;

  // Repeat rows only
  const repeatRows = filtered.filter((r) => repeatUhids.has(r.uhid));

  // Demographics: age groups
  const ageMap = new Map<string, number>();
  const seenAgeUhids = new Map<string, Set<string>>();
  for (const r of repeatRows) {
    const ag = getAgeGroup(r.age_years);
    if (!ag) continue;
    if (!seenAgeUhids.has(ag)) seenAgeUhids.set(ag, new Set());
    seenAgeUhids.get(ag)!.add(r.uhid);
  }
  seenAgeUhids.forEach((uhids, ag) => ageMap.set(ag, uhids.size));
  const ageGroups = ["<20", "20-35", "36-40", "41-60", "61+"]
    .filter((ag) => ageMap.has(ag))
    .map((ag) => ({ label: ag, value: ageMap.get(ag) || 0 }));

  // Demographics: gender
  const genderUhids = new Map<string, Set<string>>();
  for (const r of repeatRows) {
    const g = normalizeGender(r.patient_gender);
    const label = g === "M" ? "Male" : g === "F" ? "Female" : "Others";
    if (!genderUhids.has(label)) genderUhids.set(label, new Set());
    genderUhids.get(label)!.add(r.uhid);
  }
  const genderSplit = Array.from(genderUhids.entries())
    .map(([label, uhids]) => ({ name: label, value: uhids.size }))
    .sort((a, b) => b.value - a.value);

  // Demographics: location
  const locUhids = new Map<string, Set<string>>();
  for (const r of repeatRows) {
    if (!r.facility_name?.trim()) continue;
    if (!locUhids.has(r.facility_name)) locUhids.set(r.facility_name, new Set());
    locUhids.get(r.facility_name)!.add(r.uhid);
  }
  const locationDistribution = Array.from(locUhids.entries())
    .map(([name, uhids]) => ({ name, value: uhids.size }))
    .sort((a, b) => b.value - a.value);

  // Visit frequency distribution (2 visits, 3 visits, 4 visits, 5+ visits)
  const freqBuckets: Record<string, number> = {};
  repeatUhids.forEach((count) => {
    const bucket = count >= 5 ? "5+" : String(count);
    freqBuckets[bucket] = (freqBuckets[bucket] || 0) + 1;
  });
  const repeatVisitFrequency = ["2", "3", "4", "5+"]
    .filter((b) => freqBuckets[b])
    .map((bucket) => ({ visits: bucket, patients: freqBuckets[bucket] || 0 }));

  // Specialty treemap — repeat patients per specialty
  const specUhids = new Map<string, Set<string>>();
  for (const r of repeatRows) {
    if (!r.speciality_name) continue;
    if (!specUhids.has(r.speciality_name)) specUhids.set(r.speciality_name, new Set());
    specUhids.get(r.speciality_name)!.add(r.uhid);
  }
  const specialtyTreemap: Record<string, { name: string; value: number }[]> = {
    all: Array.from(specUhids.entries())
      .map(([name, uhids]) => ({ name, value: uhids.size }))
      .sort((a, b) => b.value - a.value),
  };

  return {
    kpis: {
      totalRepeatPatients,
      avgVisitFrequency,
      totalConsultsByRepeat,
      avgNps: 0, // needs NPS data
    },
    charts: {
      chronicVsAcute: { chronic: 0, acute: 0 }, // needs diagnosis data
      demographics: {
        ageGroups,
        genderSplit,
        locationDistribution,
      },
      repeatVisitFrequency,
      specialtyTreemap,
      treemapYears: ["all"],
      conditionTransitions: [],
      visitFrequencyNps: [],
      recurringConditions: { chronic: [], acute: [] },
      repeatUserSegments: [],
      sankeyFlow: { nodes: [], links: [] },
      vitalTotals: { v1: {}, v2: {}, v3: {} },
      cohortVisitFrequency: {},
      cohortYears: [],
    },
    lastUpdated: new Date().toISOString(),
  };
}
