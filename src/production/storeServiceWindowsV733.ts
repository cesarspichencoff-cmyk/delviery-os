/**
 * TATÁ Comandas V7.33 — fixed store opening/service windows.
 *
 * A documented store rule may be confirmed ONCE and reused by calendar day.
 * No signatures, daily sign-off, service-state file or fake "real observation".
 * This pure resolver NEVER promotes a declared source_ref into proof of its
 * origin; consumers must verify the rule's provenance before installing it.
 *
 * "LUNCH"/"DINNER" is assigned only where the order's original LOCAL open
 * timestamp uniquely falls inside a single non-overlapping weekly window.
 * It is a REVIEW result, not watcher authorization or printer permission.
 */
export type MealServiceV733 = "LUNCH" | "DINNER";
export interface WeeklyServiceWindowV733 {
  weekday: number; // ISO/JS convention: Sunday=0 through Saturday=6
  service: MealServiceV733;
  from_local: string; // HH:mm:ss, inclusive
  until_local: string; // HH:mm:ss, exclusive; same day
}
export interface HolidayServiceWindowV733 {
  service: MealServiceV733;
  from_local: string; // HH:mm:ss inclusive
  until_local: string; // HH:mm:ss exclusive
}
export interface OfficialHolidayCalendarV733 {
  schema: "deliveryos.official-holiday-dates.v733";
  source_ref: string; // provenance reference, NOT automatic attestation
  from_local_date: string; // valid calendar start
  through_local_date: string; // valid calendar end
  dates: string[]; // exact legal holiday dates, not optional days off
}
export interface StoreServiceRuleV733 {
  schema: "deliveryos.store-service-windows.v733";
  store_id: string;
  revision: string;
  source_ref: string;
  evidence: "CURRENT_OPERATING_RULE_CONFIRMED";
  effective_from_local_date: string;
  windows: WeeklyServiceWindowV733[];
  holiday_calendar?: OfficialHolidayCalendarV733;
  holiday_windows?: HolidayServiceWindowV733[];
}
export interface StoreServiceOrderV733 {
  store_id: string;
  opened_at_local: string;
}
export interface StoreServiceReviewV733 {
  status: "RULE_MATCH_REVIEW_ONLY" | "BLOCKED";
  service: MealServiceV733 | null;
  source_ref: string | null;
  evidence: "HUMAN_CONFIRMED_RULE" | "UNKNOWN";
  reasons: string[];
  requires_daily_signature: false;
  verifies_rule_origin: false;
  authorizes_watcher_state: false;
  authorizes_print: false;
  effects: { sql_read: false; sql_write: false; service_write: false; print: false; spooler_write: false };
}
const EFFECTS = Object.freeze({sql_read:false,sql_write:false,service_write:false,
  print:false,spooler_write:false} as const);
function dateParts(day:string): {timestamp:number;weekday:number}|null {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
  const n=Date.parse(day+"T00:00:00Z");
  if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==day)return null;
  return {timestamp:n,weekday:new Date(n).getUTCDay()};
}
function secondsOfDay(h:string):number|null {
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(h))return null;
  const [a,b,c]=h.split(":").map(Number);
  return a*3600+b*60+c;
}
function localOrderStamp(stamp:string): {date:string;weekday:number;time:number}|null {
  const m=/^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)(?:\.(\d{1,7}))?$/.exec(stamp);
  if(!m)return null;
  const day=dateParts(m[1]),s=secondsOfDay(m[2]);
  if(!day||s===null)return null;
  // Seven-digit fractions preserve strict ordering across local timestamps.
  return {date:m[1],weekday:day.weekday,time:s*10000000+
    Number((m[3]||"").padEnd(7,"0"))};
}
export function reviewStoreServiceWindowsV733(rule:unknown,order:unknown):StoreServiceReviewV733 {
  const errors=new Set<string>();
  const a=(rule&&typeof rule==="object"&&!Array.isArray(rule)?rule:{} ) as Partial<StoreServiceRuleV733>;
  const b=(order&&typeof order==="object"&&!Array.isArray(order)?order:{} ) as Partial<StoreServiceOrderV733>;
  const deny=():StoreServiceReviewV733=>({status:"BLOCKED",service:null,source_ref:null,
    evidence:"UNKNOWN",reasons:[...errors].sort(),requires_daily_signature:false,
    verifies_rule_origin:false,authorizes_watcher_state:false,authorizes_print:false,
    effects:EFFECTS});
  if(a.schema!=="deliveryos.store-service-windows.v733")errors.add("RULE_SCHEMA_INVALID");
  if(typeof a.store_id!=="string"||!/^\d{4}$/.test(a.store_id))
    errors.add("RULE_STORE_INVALID");
  if(typeof a.revision!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{3,80}$/.test(a.revision))
    errors.add("RULE_REVISION_REQUIRED");
  if(typeof a.source_ref!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.:/-]{11,180}$/.test(a.source_ref))
    errors.add("RULE_SOURCE_NOT_IDENTIFIED");
  if(a.evidence!=="CURRENT_OPERATING_RULE_CONFIRMED")
    errors.add("RULE_NOT_CONFIRMED");
  const ruleEffective=typeof a.effective_from_local_date==="string"?
    dateParts(a.effective_from_local_date):null;
  if(!ruleEffective)errors.add("RULE_EFFECTIVE_DATE_INVALID");
  if(typeof b.store_id!=="string"||b.store_id!==a.store_id)
    errors.add("ORDER_STORE_MISMATCH");
  const opened=typeof b.opened_at_local==="string"?
    localOrderStamp(b.opened_at_local):null;
  if(!opened)errors.add("ORDER_TIMESTAMP_NOT_LOCAL_OR_INVALID");
  if(opened&&ruleEffective&&opened.date<a.effective_from_local_date!)
    errors.add("RULE_NOT_EFFECTIVE_FOR_ORDER");
  if(!Array.isArray(a.windows)||a.windows.length<1||a.windows.length>14)
    errors.add("RULE_WINDOWS_NOT_BOUNDED");
  const candidates:{service:MealServiceV733;from:number;until:number;weekday:number}[]=[];
  for(const entry of Array.isArray(a.windows)?a.windows.slice(0,15):[]){
    if(!entry||typeof entry!=="object"||Array.isArray(entry)){
      errors.add("RULE_WINDOW_INVALID");continue;
    }
    const w=entry as WeeklyServiceWindowV733;
    const start=secondsOfDay(w.from_local),end=secondsOfDay(w.until_local);
    if(!Number.isInteger(w.weekday)||w.weekday<0||w.weekday>6||
       !["LUNCH","DINNER"].includes(w.service)||start===null||end===null||
       start>=end){
      errors.add("RULE_WINDOW_INVALID_OR_CROSS_MIDNIGHT");continue;
    }
    candidates.push({weekday:w.weekday,service:w.service,
      from:start*10000000,until:end*10000000});
  }
  // Public holidays supersede the weekly schedule, including weekdays.
  // Absence of a complete, date-bounded calendar is not a holiday verdict.
  const usesHolidays=a.holiday_calendar!==undefined||a.holiday_windows!==undefined;
  const special:{service:MealServiceV733;from:number;until:number}[]=[];
  let holidayToday=false;
  if(usesHolidays){
    const h=a.holiday_calendar;
    if(!h||h.schema!=="deliveryos.official-holiday-dates.v733"||
       typeof h.source_ref!=="string"||
       !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{11,240}$/.test(h.source_ref))
      errors.add("HOLIDAY_CALENDAR_OR_SOURCE_INVALID");
    const start=h&&typeof h.from_local_date==="string"?dateParts(h.from_local_date):null;
    const end=h&&typeof h.through_local_date==="string"?dateParts(h.through_local_date):null;
    if(!start||!end||start.timestamp>end.timestamp)
      errors.add("HOLIDAY_CALENDAR_COVERAGE_INVALID");
    if(opened&&start&&end&&
       (opened.date<h!.from_local_date||opened.date>h!.through_local_date))
      errors.add("HOLIDAY_CALENDAR_NOT_VALID_FOR_ORDER");
    if(!h||!Array.isArray(h.dates)||h.dates.length<1||h.dates.length>400)
      errors.add("HOLIDAY_DATES_NOT_BOUNDED");
    else{
      const unique=new Set<string>();
      for(const raw of h.dates){
        const date=typeof raw==="string"?dateParts(raw):null;
        if(!date||unique.has(raw)||start&&date.timestamp<start.timestamp||
           end&&date&&date.timestamp>end.timestamp)
          errors.add("HOLIDAY_DATE_INVALID_OR_DUPLICATE");
        if(date)unique.add(raw);
      }
      if(opened)holidayToday=unique.has(opened.date);
    }
    if(!Array.isArray(a.holiday_windows)||
       a.holiday_windows.length!==2)
      errors.add("HOLIDAY_WINDOWS_REQUIRED");
    else{
      for(const w of a.holiday_windows){
        const lo=w&&secondsOfDay(w.from_local),hi=w&&secondsOfDay(w.until_local);
        if(!w||!["LUNCH","DINNER"].includes(w.service)||
           lo===null||hi===null||lo===undefined||hi===undefined||lo>=hi)
          errors.add("HOLIDAY_WINDOW_INVALID");
        else special.push({service:w.service,from:lo*10000000,until:hi*10000000});
      }
      if(special.length===2){
        if(special[0].service===special[1].service||
           Math.max(special[0].from,special[1].from)<
             Math.min(special[0].until,special[1].until))
          errors.add("HOLIDAY_WINDOWS_DUPLICATE_OR_OVERLAP");
      }
    }
  }
  for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
    const x=candidates[i],y=candidates[j];
    if(x.weekday===y.weekday&&Math.max(x.from,y.from)<Math.min(x.until,y.until))
      errors.add("RULE_WINDOWS_OVERLAP");
    if(x.weekday===y.weekday&&x.service===y.service)
      errors.add("RULE_DUPLICATE_SERVICE_DAY");
  }
  if(errors.size)return deny();
  const hit=holidayToday
    ? special.filter(w=>w.from<=opened!.time&&opened!.time<w.until)
    : candidates.filter(w=>w.weekday===opened!.weekday&&
       w.from<=opened!.time&&opened!.time<w.until);
  if(hit.length!==1){
    errors.add(hit.length>1?"AMBIGUOUS_SERVICE":"ORDER_OUTSIDE_DOCUMENTED_SERVICE_WINDOW");
    return deny();
  }
  return {status:"RULE_MATCH_REVIEW_ONLY",service:hit[0].service,
    source_ref:a.source_ref!,evidence:"HUMAN_CONFIRMED_RULE",reasons:[],
    requires_daily_signature:false,verifies_rule_origin:false,
    authorizes_watcher_state:false,authorizes_print:false,effects:EFFECTS};
}
