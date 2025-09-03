import { BASE_POS } from "../models/network";

export type LineInfo = { id: string; stations: string[] };
export type AiRoute = { path: string[]; length: number; description: string };

const MAIN_HUBS = ["Москва","Ростов-на-Дону","Тольятти","Волгоград","Уфа","Екатеринбург","Тюмень","Набережные Челны","Омск"];
const EXTRA_HUBS = ["Новосибирск","Санкт-Петербург","Казань"];

function segId(a: string, b: string){
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function buildSegmentSet(lines: LineInfo[]): Set<string>{
  const set = new Set<string>();
  for(const l of lines){
    for(let i=0;i<l.stations.length-1;i++){
      set.add(segId(l.stations[i], l.stations[i+1]));
    }
  }
  return set;
}

function computeLength(route: string[]): number{
  let len = 0;
  for(let i=1;i<route.length;i++){
    const a = BASE_POS[route[i-1]];
    const b = BASE_POS[route[i]];
    if(!a || !b) return Infinity;
    len += Math.hypot(a.x-b.x, a.y-b.y);
  }
  return len;
}

function validateRoutes(raw: any, lines: LineInfo[]): AiRoute[]{
  if(!Array.isArray(raw)) return [];
  const cities = new Set(Object.keys(BASE_POS));
  const segments = buildSegmentSet(lines);
  const valid: AiRoute[] = [];
  for(const r of raw){
    if(!r || !Array.isArray(r.route) || r.route.length<2) continue;
    if(r.route.some((c:string)=>!cities.has(c))) continue;
    let ok = true;
    for(let i=0;i<r.route.length-1;i++){
      const id = segId(r.route[i], r.route[i+1]);
      if(!segments.has(id)){ ok=false; break; }
    }
    if(!ok) continue;
    const length = computeLength(r.route);
    valid.push({ path: r.route, length, description: r.description ?? "" });
  }
  return valid;
}

export async function aiSuggestRoutes(start: string, end: string, lines: LineInfo[]): Promise<AiRoute[]> {
  const apiKey = (import.meta as any).env?.VITE_OPENROUTER_API_KEY || "";
  const linesText = lines.map(l=>`${l.id}: ${l.stations.join(" -> ")}`).join("\n");
  const prompt = [
    `Найди 2-3 оптимальных маршрута из ${start} в ${end}.`,
    "Используй только существующие ветки.",
    "Основные хабы: "+MAIN_HUBS.join(", "),
    "Дополнительные хабы: "+EXTRA_HUBS.join(", "),
    "Приоритетная ветка: Москва-Владивосток.",
    "Список веток с городами:",
    linesText,
    "Верни JSON массив с маршрутами формата:",
    '{"route":["Город1","Город2"],"branches":["ID_ветки"],"description":"..."}'
  ].join("\n");

  try{
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        ...(apiKey?{Authorization:`Bearer ${apiKey}`}:{})
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        response_format: { type: "json_object" },
    const parsed = JSON.parse(text);
    return validateRoutes(parsed, lines);
  }catch(err){
    console.error("AI route error", err);
    return [];
  }
}

