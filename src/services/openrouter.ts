import { BASE_POS } from "../models/network";

export type LineInfo = { id: string; stations: string[] };
export type AiRoute = { path: string[]; length: number; description: string };

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

function buildPrompt(start: string, end: string, lines: LineInfo[]): string {
  const intersections = new Map<string, string[]>();
  for (let i = 0; i < lines.length; i++) {
    const l1 = lines[i];
    for (let j = i + 1; j < lines.length; j++) {
      const l2 = lines[j];
      const common = l1.stations.filter((c) => l2.stations.includes(c));
      if (common.length === 0) continue;
      for (const city of common) {
        if (!intersections.has(city)) intersections.set(city, []);
        const arr = intersections.get(city)!;
        if (!arr.includes(l1.id)) arr.push(l1.id);
        if (!arr.includes(l2.id)) arr.push(l2.id);
      }
    }
  }

  const linesText = lines
    .map((l) => `${l.id}: ${l.stations.join(" → ")}`)
    .join("\n");

  const intersectionsText = Array.from(intersections.entries())
    .map(([city, ids]) => `${city}: [${ids.join(", ")}]`)
    .join("\n");

  const used = new Set<string>();
  lines.forEach((l) => l.stations.forEach((s) => used.add(s)));
  const positionsText = Array.from(used)
    .map((city) => {
      const pos = BASE_POS[city];
      return pos ? `${city}: (${pos.x}, ${pos.y})` : "";
    })
    .filter(Boolean)
    .join("\n");

  return [
    `Построй 2-3 оптимальных маршрута из "${start}" в "${end}".`,
    "",
    "КРИТИЧЕСКИ ВАЖНО:",
    "1. Используй ТОЛЬКО существующие ветки и станции",
    "2. Маршрут должен состоять ТОЛЬКО из станций, которые идут подряд на одной ветке",
    "3. Переходы между ветками ТОЛЬКО в городах-пересечениях",
    "4. В маршруте указывай ВСЕ промежуточные станции через которые проходит путь",
    "",
    "КООРДИНАТЫ ГОРОДОВ:",
    positionsText,
    "",
    "ВЕТКИ С ГОРОДАМИ:",
    linesText,
    "",
    "ПЕРЕСЕЧЕНИЯ ВЕТОК:",
    intersectionsText,
    "",
    "ПРИМЕР ПРАВИЛЬНОГО ОТВЕТА:",
    "Для Абакан→Владимир:",
    `{"routes":[{"route":["Абакан","Красноярск","Кемерово","Новосибирск","Омск","Тюмень","Екатеринбург","Набережные Челны","Казань","Чебоксары","Нижний Новгород","Владимир"],"branches":["KRS-KYZ","OMSK-VVO-GREY","OMSK-NCH-IZH","MSK-NCH-SALAD"],"description":"Через Красноярск и Екатеринбург"}]}`,
    "",
    "Верни СТРОГО JSON:"
  ].join("\n");
}

// Более мягкая валидация - проверяем только что все города существуют
function validateRoutes(raw: any, lines: LineInfo[]): AiRoute[]{
  if(raw && Array.isArray(raw.routes)) raw = raw.routes;
  if(!Array.isArray(raw)) return [];
  
  const cities = new Set(Object.keys(BASE_POS));
  const valid: AiRoute[] = [];
  
  for(const r of raw){
    if(!r || !Array.isArray(r.route) || r.route.length<2) continue;
    
    // Проверяем только что все города существуют
    if(r.route.some((c:string)=>!cities.has(c))) continue;
    
    const length = computeLength(r.route);
    if(length === Infinity) continue; // Если не удалось вычислить длину
    
    valid.push({ 
      path: r.route, 
      length, 
      description: r.description ?? "Маршрут от ИИ" 
    });
  }
  
  return valid;
}

export async function aiSuggestRoutes(start: string, end: string, lines: LineInfo[]): Promise<AiRoute[]> {
  const apiKey = (import.meta as any).env?.VITE_OPENROUTER_API_KEY || "";
  const prompt = buildPrompt(start, end, lines);

  try{
    const body = {
      model: "openai/gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Ты помощник по построению маршрутов. Отвечай строго JSON без дополнительных пояснений.",
        },
        { role: "user", content: prompt },
      ],
    };

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if(!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    let text = data.choices?.[0]?.message?.content || "";
    text = text.trim();
    if(text.startsWith("```")){
      text = text.replace(/^```json\s*/i, "").replace(/^```\w*\s*/i, "").replace(/```$/, "");
    }
    const parsed = JSON.parse(text);
    return validateRoutes(parsed, lines);
  }catch(err){
    console.error("AI route error", err);
    return [];
  }
}