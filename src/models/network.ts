export type XY = { x: number; y: number };
export type Station = { id: string; x: number; y: number };
export type Segment = { id: string; from: string; to: string; length?: number };
export type Route = { id: string; name: string; segments: string[] };

export const BASE_POS: Record<string, XY> = {
  "Абакан": {x:1920, y:600},
  "Астрахань": {x:480, y:1320},
  "Барнаул": {x:1560, y:600},
  "Биробиджан": {x:2520, y:600},
  "Благовещенск": {x:2400, y:600},
  "Будённовск": {x:360, y:1320},
  "Владивосток": {x:2640, y:1200},
  "Владикавказ": {x:240, y:1440},
  "Владимир": {x:120, y:480},
  "Волгоград": {x:240, y:960},
  "Вологда": {x:0, y:240},
  "Воронеж": {x:-120, y:840},
  "Горно-Алтайск": {x:1680, y:720},
  "Грозный": {x:360, y:1440},
  "Екатеринбург": {x:960, y:360},
  "Ижевск": {x:720, y:360},
  "Иркутск": {x:2040, y:480},
  "Йошкар-Ола": {x:480, y:360},
  "Якутск": {x:2400, y:120},
  "Казань": {x:600, y:480},
  "Кемерово": {x:1680, y:480},
  "Керчь": {x:-360, y:1020},
  "Киров": {x:120, y:240},
  "Краснодар": {x:-240, y:1020},
  "Красноярск": {x:1920, y:480},
  "Курган": {x:1200, y:600},
  "Кызыл": {x:1920, y:720},
  "Магадан": {x:3000, y:240},
  "Мариуполь": {x:-240, y:960},
  "Махачкала": {x:480, y:1560},
  "Медвежьегорск": {x:-120, y:120},
  "Мелитополь": {x:-360, y:960},
  "Минеральные Воды": {x:0, y:1200},
  "Москва": {x:-120, y:480},
  "Мурманск": {x:-120, y:0},
  "Набережные Челны": {x:720, y:480},
  "Нальчик": {x:120, y:1320},
  "Невинномысск": {x:-120, y:1080},
  "Нижневартовск": {x:1440, y:120},
  "Нижний Новгород": {x:240, y:480},
  "Новокузнецк": {x:1680, y:600},
  "Новосибирск": {x:1560, y:480},
  "Новый Уренгой": {x:1200, y:0},
  "Омск": {x:1320, y:480},
  "Оренбург": {x:720, y:840},
  "Орск": {x:840, y:840},
  "Пенза": {x:360, y:720},
  "Пермь": {x:720, y:240},
  "Петрозаводск": {x:-240, y:240},
  "Ростов-на-Дону": {x:-120, y:960},
  "Рязань": {x:120, y:600},
  "Санкт-Петербург": {x:-240, y:360},
  "Саратов": {x:360, y:840},
  "Свободный": {x:2460, y:480},
  "Севастополь": {x:-600, y:1020},
  "Симферополь": {x:-480, y:1020},
  "Сковородино": {x:2400, y:480},
  "Сургут": {x:1200, y:120},
  "Сыктывкар": {x:240, y:120},
  "Тамбов": {x:120, y:720},
  "Тверь": {x:-120, y:420},
  "Тольятти": {x:600, y:720},
  "Томск": {x:1680, y:360},
  "Тюмень": {x:1200, y:360},
  "Улан-Удэ": {x:2160, y:480},
  "Уссурийск": {x:2640, y:960},
  "Уфа": {x:720, y:600},
  "Хабаровск": {x:2640, y:720},
  "Ханты-Мансийск": {x:960, y:120},
  "Чебоксары": {x:480, y:480},
  "Челябинск": {x:960, y:600},
  "Чита": {x:2280, y:480},
  "Элиста": {x:240, y:1080},
  "Ярославль": {x:0, y:360},
  "Великий Новгород": {x:-180, y:360},
  "Бийск": {x:1620, y:660}
};

const segmentMap = new Map<string, Segment>();

function segmentId(a: string, b: string){
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

export function buildEdgesFromPath(path: string[]): Array<{a:string;b:string}> {
  const edges: Array<{a:string;b:string}> = [];
  for(let i=0;i<path.length-1;i++){
    const a = path[i], b = path[i+1];
    if(a!==b) edges.push({a,b});
  }
  return edges;
}

export function segmentsFromStations(stations: string[]): string[] {
  return buildEdgesFromPath(stations).map(({a,b}) => {
    const id = segmentId(a,b);
    if(!segmentMap.has(id)) segmentMap.set(id, { id, from: a, to: b });
    return id;
  });
}

export function getSegment(id: string): Segment | undefined {
  return segmentMap.get(id);
}

export function stationsFromSegments(ids: string[]): string[] {
  if(ids.length === 0) return [];
  const first = getSegment(ids[0]);
  if(!first) return [];
  const result = [first.from, first.to];
  for(let i=1;i<ids.length;i++){
    const seg = getSegment(ids[i]);
    if(!seg) continue;
    const last = result[result.length-1];
    if(seg.from === last) result.push(seg.to);
    else if(seg.to === last) result.push(seg.from);
    else {
      result.push(seg.from, seg.to);
    }
  }
  return result;
}


function buildGraph(){
  const graph = new Map<string, Array<{to: string; weight: number}>>();
  segmentMap.forEach(seg => {
    const aPos = BASE_POS[seg.from];
    const bPos = BASE_POS[seg.to];
    if(!aPos || !bPos) return;
    const len = seg.length ?? Math.hypot(aPos.x - bPos.x, aPos.y - bPos.y);
    if(!graph.has(seg.from)) graph.set(seg.from, []);
    if(!graph.has(seg.to)) graph.set(seg.to, []);
    graph.get(seg.from)!.push({to: seg.to, weight: len});
    graph.get(seg.to)!.push({to: seg.from, weight: len});
  });
  return graph;
}

export function buildGraphFromLines(lines: Array<{segments: string[]}>): Map<string, Array<{to: string; weight: number}>> {
  const graph = new Map<string, Array<{to: string; weight: number}>>();
  const allSegments = new Set<string>();
  lines.forEach(line => line.segments.forEach(seg => allSegments.add(seg)));
  allSegments.forEach(segId => {
    const seg = getSegment(segId);
    if(!seg) return;
    const aPos = BASE_POS[seg.from];
    const bPos = BASE_POS[seg.to];
    if(!aPos || !bPos) return;
    const len = Math.hypot(aPos.x - bPos.x, aPos.y - bPos.y);
    if(!graph.has(seg.from)) graph.set(seg.from, []);
    if(!graph.has(seg.to)) graph.set(seg.to, []);
    graph.get(seg.from)!.push({to: seg.to, weight: len});
    graph.get(seg.to)!.push({to: seg.from, weight: len});
  });
  return graph;
}

export function findPaths(start: string, end: string, limit = 3): Array<{ path: string[]; length: number }> {
  if(start === end) return [{ path: [start], length: 0 }];
  const graph = buildGraph();
  const results: Array<{path:string[]; length:number}> = [];
  const queue: Array<{path:string[]; length:number}> = [{ path:[start], length:0 }];
  const best = new Map<string, number>();

  while(queue.length > 0 && results.length < limit){
    queue.sort((a,b)=>a.length-b.length);
    const cur = queue.shift()!;
    const last = cur.path[cur.path.length-1];
    if(last === end){
      results.push(cur);
      continue;
    }
    const neigh = graph.get(last) ?? [];
    for(const {to, weight} of neigh){
      if(cur.path.includes(to)) continue;
      const newLen = cur.length + weight;
      if(best.has(to) && best.get(to)! <= newLen) continue;
      best.set(to, newLen);
      queue.push({ path:[...cur.path, to], length: newLen });
    }
  }

  return results;
}

export function findPathsFromGraph(start: string, end: string, graph: Map<string, Array<{to: string; weight: number}>>, limit = 3): Array<{path:string[]; length:number}> {
  if(start === end) return [{ path: [start], length: 0 }];
  const results: Array<{path:string[]; length:number}> = [];
  const queue: Array<{path:string[]; length:number}> = [{ path:[start], length:0 }];
  const best = new Map<string, number>();
  while(queue.length > 0 && results.length < limit){
    queue.sort((a,b)=>a.length-b.length);
    const cur = queue.shift()!;
    const last = cur.path[cur.path.length-1];
    if(last === end){
      results.push(cur);
      continue;
    }
    const neigh = graph.get(last) ?? [];
    for(const {to, weight} of neigh){
      if(cur.path.includes(to)) continue;
      const newLen = cur.length + weight;
      if(best.has(to) && best.get(to)! <= newLen) continue;
      best.set(to, newLen);
      queue.push({ path:[...cur.path, to], length: newLen });
    }
  }
  return results;
}

export function findPath(start: string, end: string){
  const [best] = findPaths(start, end, 1);
  return best ?? { path: [], length: Infinity };
}
