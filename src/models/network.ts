export type XY = { x: number; y: number };
export type Station = { id: string; x: number; y: number };
export type Segment = { id: string; from: string; to: string; length?: number };
export type Route = { id: string; name: string; segments: string[] };

export const BASE_POS: Record<string, XY> = {
  "Абакан": {x:115, y:55},
  "Архангельск": {x:30, y:70},
  "Астрахань": {x:40, y:40},
  "Барнаул": {x:105, y:55},
  "Бийск": {x:100, y:50},
  "Великий Новгород": {x:15, y:60},
  "Владивосток": {x:175, y:35},
  "Владикавказ": {x:45, y:35},
  "Владимир": {x:30, y:60},
  "Волгоград": {x:35, y:45},
  "Вологда": {x:30, y:65},
  "Воронеж": {x:25, y:50},
  "Грозный": {x:35, y:35},
  "Екатеринбург": {x:60, y:60},
  "Ижевск": {x:80, y:60},
  "Иркутск": {x:130, y:50},
  "Йошкар-Ола": {x:75, y:60},
  "Казань": {x:40, y:55},
  "Калининград": {x:-5, y:55},
  "Кемерово": {x:100, y:55},
  "Керчь": {x:50, y:40},
  "Киров": {x:50, y:60},
  "Кострома": {x:65, y:60},
  "Краснодар": {x:25, y:40},
  "Красноярск": {x:110, y:55},
  "Курган": {x:70, y:55},
  "Кызыл": {x:115, y:50},
  "Мариуполь": {x:30, y:45},
  "Махачкала": {x:40, y:35},
  "Медвежьегорск": {x:20, y:70},
  "Мелитополь": {x:20, y:45},
  "Минеральные Воды": {x:45, y:40},
  "Москва": {x:25, y:55},
  "Мурманск": {x:15, y:80},
  "Набережные Челны": {x:50, y:55},
  "Нальчик": {x:50, y:35},
  "Невинномысск": {x:30, y:40},
  "Нижневартовск": {x:85, y:65},
  "Нижний Новгород": {x:35, y:60},
  "Новокузнецк": {x:120, y:55},
  "Новосибирск": {x:95, y:55},
  "Новый Уренгой": {x:85, y:75},
  "Омск": {x:80, y:55},
  "Оренбург": {x:50, y:50},
  "Орск": {x:60, y:50},
  "Пенза": {x:35, y:55},
  "Пермь": {x:55, y:60},
  "Петрозаводск": {x:20, y:65},
  "Ростов-на-Дону": {x:25, y:45},
  "Рязань": {x:30, y:55},
  "Санкт-Петербург": {x:10, y:65},
  "Саратов": {x:35, y:50},
  "Свободный": {x:170, y:50},
  "Севастополь": {x:15, y:40},
  "Симферополь": {x:20, y:40},
  "Сковородино": {x:160, y:55},
  "Сургут": {x:80, y:65},
  "Сыктывкар": {x:45, y:65},
  "Тверь": {x:20, y:60},
  "Тольятти": {x:45, y:55},
  "Томск": {x:100, y:60},
  "Тюмень": {x:70, y:60},
  "Улан-Удэ": {x:135, y:50},
  "Уфа": {x:55, y:55},
  "Хабаровск": {x:180, y:45},
  "Ханты-Мансийск": {x:75, y:65},
  "Чебоксары": {x:40, y:60},
  "Челябинск": {x:60, y:55},
  "Чита": {x:145, y:50},
  "Элиста": {x:35, y:40},
  "Якутск": {x:170, y:65},
  "Ярославль": {x:45, y:60}
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
