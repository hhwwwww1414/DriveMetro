import { BASE_POS } from "../models/network";

export type LineInfo = { id: string; stations: string[] };
export type AiRoute = { path: string[]; length: number; description: string };

type AiSegment = { from: string; to: string; branch: string };

function segId(a: string, b: string){
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function buildMaps(lines: LineInfo[]){
  const segsByLine = new Map<string, Set<string>>();
  const intersections = new Map<string, Set<string>>();
  for(const l of lines){
    const set = new Set<string>();
    for(let i=0;i<l.stations.length-1;i++){
      const a = l.stations[i];
      const b = l.stations[i+1];
      set.add(segId(a,b));
      if(!intersections.has(a)) intersections.set(a, new Set());
      if(!intersections.has(b)) intersections.set(b, new Set());
      intersections.get(a)!.add(l.id);
      intersections.get(b)!.add(l.id);
    }
    segsByLine.set(l.id, set);
  }
  return { segsByLine, intersections };
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
  for(let i=0;i<lines.length;i++){
    const l1 = lines[i];
    for(let j=i+1;j<lines.length;j++){
      const l2 = lines[j];
      const common = l1.stations.filter(c => l2.stations.includes(c));
      if(common.length===0) continue;
      for(const city of common){
        if(!intersections.has(city)) intersections.set(city, []);
        const arr = intersections.get(city)!;
        if(!arr.includes(l1.id)) arr.push(l1.id);
        if(!arr.includes(l2.id)) arr.push(l2.id);
      }
    }
  }

  const linesText = lines.map(l => `${l.id}: ${l.stations.join(" → ")}`).join("\n");
  const intersectionsText = Array.from(intersections.entries())
    .map(([city, ids]) => `${city}: [${ids.join(", ")}]`)
    .join("\n");
  const allowedSegments = lines.flatMap(l => {
    const segs: Array<{ from: string; to: string; branch: string }> = [];
    for (let i = 0; i < l.stations.length - 1; i++) {
      segs.push({ from: l.stations[i], to: l.stations[i + 1], branch: l.id });
    }
    return segs;
  });
  const allowedSegmentsText = JSON.stringify(allowedSegments);

  const used = new Set<string>();
  lines.forEach(l => l.stations.forEach(s => used.add(s)));
  const positionsText = Array.from(used)
    .map(city => {
      const pos = BASE_POS[city];
      return pos ? `${city}: (${pos.x}, ${pos.y})` : "";
    })
    .filter(Boolean)
    .join("\n");

  return [
    `Построй 2-3 оптимальных маршрута из "${start}" в "${end}".`,
    "",
    "Правила:",
    "1. Используй ТОЛЬКО существующие ветки и станции из списков ниже.",
    "2. Каждый маршрут строится только по соседним станциям ветки: нельзя перескакивать через города.",
    "3. Можно двигаться по веткам в любом направлении.",
    "4. Переход между ветками разрешён только в городах‑пересечениях.",
    "5. Каждый сегмент {from,to,branch} обязан точно совпадать с одним из элементов allowedSegments (порядок городов не важен).",
    "6. Указывай ВСЕ промежуточные станции маршрута и не повторяй города в пределах одного маршрута.",
    `7. Маршрут обязан начинаться строго в "${start}" и заканчиваться строго в "${end}".`,
    "8. Для каждого перехода указывай ветку (branch), по которой он выполнен.",
    '9. Если маршрут построить нельзя, верни {"routes":[]}',
    "10. Ответ должен быть СТРОГО в формате JSON без дополнительного текста.",
    "",
    "Формат ответа:",
    '{"routes":[{"segments":[{"from":"Город1","to":"Город2","branch":"ID_ветки"}],"description":"..."}]}',
    "Пример:",
    '{"routes":[{"segments":[{"from":"Волгоград","to":"Элиста","branch":"MSK-VLG"},{"from":"Элиста","to":"Астрахань","branch":"VLG-ELI-AST-MAH"}],"description":"Пример оформления"}]}',
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
    "allowedSegments:",
    allowedSegmentsText,
    "",
    "Верни только JSON без пояснений.",
  ].join("\n");
}

// Строгая валидация: проверяем существование городов, сегментов и корректность переходов
function validateRoutes(raw: any, lines: LineInfo[], start: string, end: string): AiRoute[]{
  if(raw && Array.isArray(raw.routes)) raw = raw.routes;
  if(!Array.isArray(raw)) return [];

  const cities = new Set(Object.keys(BASE_POS));
  const { segsByLine, intersections } = buildMaps(lines);
  const valid: AiRoute[] = [];

  for(const r of raw){
    const segments: AiSegment[] | undefined = r?.segments;
    if(!Array.isArray(segments) || segments.length===0){
      console.warn("AI: отсутствуют сегменты", JSON.stringify(r)); continue;
    }

    let ok = true;
    const path: string[] = [segments[0].from];
    const visited = new Set<string>(path);
    for(let i=0;i<segments.length;i++){
      const seg = segments[i];
      if(!seg || typeof seg.from!=="string" || typeof seg.to!=="string" || typeof seg.branch!=="string"){
        console.warn("AI: некорректный формат сегмента", JSON.stringify(seg)); ok=false; break;
      }
      if(!cities.has(seg.from) || !cities.has(seg.to)){
        console.warn("AI: неизвестный город", JSON.stringify(seg)); ok=false; break;
      }
      const segSet = segsByLine.get(seg.branch);
      if(!segSet || !segSet.has(segId(seg.from, seg.to))){
        console.warn("AI: сегмент вне ветки", JSON.stringify(seg)); ok=false; break;
      }
      if(i>0){
        const prev = segments[i-1];
        if(prev.to !== seg.from){
          console.warn("AI: разрыв маршрута", JSON.stringify(prev), JSON.stringify(seg)); ok=false; break;
        }
        if(prev.branch !== seg.branch){
          const inter = intersections.get(seg.from);
          if(!inter || !inter.has(prev.branch) || !inter.has(seg.branch)){
            console.warn("AI: недопустимая смена ветки", seg.from, prev.branch, seg.branch); ok=false; break;
          }
        }
      }
      if(visited.has(seg.to)){
        console.warn("AI: повтор города", seg.to);
        ok=false; break;
      }
      visited.add(seg.to);
      path.push(seg.to);
    }

    if(!ok) continue;

    if(path[0] !== start || path[path.length-1] !== end){
      console.warn("AI: неверное начало/конец маршрута", JSON.stringify(path)); continue;
    }

    const length = computeLength(path);
    if(length === Infinity) continue;

    valid.push({
      path,
      length,
      description: r.description ?? "Маршрут от ИИ",
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
    console.log("AI raw response", JSON.stringify(parsed));
    return validateRoutes(parsed, lines, start, end);
  }catch(err){
    console.error("AI route error", err);
    return [];
  }
}
