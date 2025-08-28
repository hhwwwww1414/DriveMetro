import React, { useMemo, useState, useRef, useCallback } from "react";

// ==========================
// ПОЛНАЯ ИНТЕРАКТИВНАЯ КАРТА МАРШРУТОВ РОССИИ (исправленная)
// ✔ Исправлен краш "lines is not iterable": теперь все функции получают корректный массив lines
// ✔ Разделены ветки: «Москва→Тольятти (через Рязань, Пензу)» и «Тольятти→Волгоград (через Саратов)»
// ✔ Уникальные цвета для всех веток (без повторов) — автоматическая палитра HSL
// ✔ Пермь строго над Казанью; Воронеж и Тамбов выровнены по Y с Тольятти (пост‑сдвиг)
// ✔ Северная вертикаль: Тюмень ↑ Сургут ↑ Новый Уренгой; от Сургута ↔ Ханты‑Мансийск/Нижневартовск
// ✔ Новый Уренгой → Москва через Сургут, Тюмень, Екб, Пермь, Киров, Ярославль
// ✔ Ростов-на-Дону ↙ Краснодар (45°)
// ==========================

type LineDef = { id: string; name: string; color: string; stations: string[] };
type Move = 'L90'|'R90'|'U90'|'D90'|'UL45'|'UR45'|'DL45'|'DR45';

const GRID = 120; // базовый шаг сетки
const VEC: Record<Move,[number,number]> = {
  L90:[-GRID,0], R90:[GRID,0], U90:[0,-GRID], D90:[0,GRID],
  UL45:[-GRID,-GRID], UR45:[GRID,-GRID], DL45:[-GRID,GRID], DR45:[GRID,GRID]
};

// === БАЗОВЫЕ ЛИНИИ (без цвета) ===
// Старые маршруты
const NSK_MSK_BLUE_STATIONS = [
  "Новосибирск","Омск","Тюмень","Екатеринбург","Набережные Челны","Казань","Чебoksары","Нижний Новгород","Владимир","Москва"
].map(s=>s.replace('Чебoksары','Чебоксары'));
const NSK_MSK_BLUE_MOVES: Move[] = ['L90','UL45','L90','DL45','L90','L90','L90','L90','L90'];

const NSK_MSK_PINK_STATIONS = [
  "Новосибирск","Омск","Курган","Челябинск","Уфа","Набережные Челны","Казань","Чебоксары","Нижний Новгород","Владимир","Москва"
];
const NSK_MSK_PINK_MOVES: Move[] = ['L90','DL45','L90','L90','UL45','L90','L90','L90','L90','L90'];

const NSK_TLT_STATIONS = [
  "Новосибирск","Омск","Курган","Челябинск","Уфа","Тольятти"
];
const NSK_TLT_MOVES: Move[] = ['L90','DL45','L90','L90','DL45'];

// Новые маршруты север/северо‑запад
const MSK_MUR_SPB_STATIONS = ["Москва", "Санкт-Петербург", "Петрозаводск", "Медвежьегорск", "Мурманск"];
const MSK_MUR_SPB_MOVES: Move[] = ['UL45', 'U90', 'UR45', 'U90'];

const MSK_MUR_YAR_STATIONS = ["Москва", "Ярославль", "Вологда", "Медвежьегорск", "Мурманск"];
const MSK_MUR_YAR_MOVES: Move[] = ['UR45', 'U90', 'UL45', 'U90'];

// Юг
const MSK_RST_STATIONS = ["Москва", "Воронеж", "Ростов-на-Дону"];
const MSK_RST_MOVES: Move[] = ['D90', 'D90'];

const MSK_BUD_STATIONS = ["Москва", "Тамбов", "Волгоград", "Элиста", "Будённовск"];
const MSK_BUD_MOVES: Move[] = ['DR45', 'D90', 'D90', 'D90'];

const ELISTA_AST_STATIONS = ["Элиста", "Астрахань"];
const ELISTA_AST_MOVES: Move[] = ['R90'];

// Восток/Урал
const MSK_EKB_STATIONS = ["Москва","Ярославль","Киров","Пермь","Екатеринбург"];
const MSK_EKB_MOVES: Move[] = ['UR45', 'UR45', 'R90', 'DL45'];

// Северная вертикаль от Тюмени
const TYM_SURG_URNG_STATIONS = ["Тюмень", "Сургут", "Новый Уренгой"];
const TYM_SURG_URNG_MOVES: Move[] = ['U90','U90'];

const SURG_HM_STATIONS = ["Сургут", "Ханты-Мансийск"];
const SURG_HM_MOVES: Move[] = ['L90'];

const SURG_NVART_STATIONS = ["Сургут", "Нижневартовск"];
const SURG_NVART_MOVES: Move[] = ['R90'];

const URNG_MSK_STATIONS = [
  "Новый Уренгой","Сургут","Тюмень","Екатеринбург","Пермь","Киров","Ярославль","Москва"
];
const URNG_MSK_MOVES: Move[] = ['D90','D90','L90','L90','L90','L90','L90'];

// Ростов ↙ Краснодар
const RST_KRS_STATIONS = ["Ростов-на-Дону", "Краснодар"];
const RST_KRS_MOVES: Move[] = ['DL45'];

// Москва → Тольятти (отдельная ветка)
const MSK_TLT_STATIONS = ["Москва","Рязань","Пенза","Тольятти"]; 
const MSK_TLT_MOVES: Move[] = ['DR45','DR45','DL45'];

// Тольятти → Волгоград (через Саратов) — отдельная ветка
const TLT_VLG_STATIONS = ["Тольятти","Саратов","Волгоград"]; 
const TLT_VLG_MOVES: Move[] = ['DL45','R90'];

// === ВОСТОЧНОЕ ПРОДОЛЖЕНИЕ ОТ НОВОСИБИРСКА ДО ВЛАДИВОСТОКА ===
// Новосибирск → Кемерово (→90) → Красноярск (↗45) → Иркутск (↘45 — резкий спуск)
// → Улан-Удэ (→90) → Чита (→90) → Сковородино (→90) → Биробиджан (→90)
// → Хабаровск (↓90) → Уссурийск (↓90) → Владивосток (↓90)
const NSK_FE_STATIONS = [
  "Новосибирск","Кемерово","Красноярск","Иркутск","Улан-Удэ","Чита","Сковородино","Биробиджан","Хабаровск","Уссурийск","Владивосток"
];
const NSK_FE_MOVES: Move[] = ['R90','UR45','DR45','R90','R90','R90','R90','D90','D90','D90'];

// Ответвление от Сковородино вниз к Благовещенску
const SKV_BLG_STATIONS = ["Сковородино","Благовещенск"];
const SKV_BLG_MOVES: Move[] = ['D90'];

// Сводный список линий БЕЗ финальных цветов (мы их назначим автоматически)
const BASE_LINES: Omit<LineDef,'color'>[] = [
  // Старые
  { id: 'NSK-MSK-1', name: 'Новосибирск→Москва (через Тюмень/Екб)', stations: NSK_MSK_BLUE_STATIONS as string[] },
  { id: 'NSK-MSK-2', name: 'Новосибирск→Москва (через Курган/Челябинск)', stations: NSK_MSK_PINK_STATIONS as string[] },
  { id: 'NSK-TLT',   name: 'Новосибирск→Тольятти', stations: NSK_TLT_STATIONS as string[] },

  // Новые из Москвы
  { id: 'MSK-MUR-SPB', name: 'Москва→Мурманск (через СПб)', stations: MSK_MUR_SPB_STATIONS as string[] },
  { id: 'MSK-MUR-YAR', name: 'Москва→Мурманск (через Ярославль)', stations: MSK_MUR_YAR_STATIONS as string[] },
  { id: 'MSK-RST',     name: 'Москва→Ростов-на-Дону', stations: MSK_RST_STATIONS as string[] },
  { id: 'MSK-BUD',     name: 'Москва→Будённовск (через Элисту)', stations: MSK_BUD_STATIONS as string[] },
  { id: 'MSK-EKB',     name: 'Москва→Екатеринбург (через Ярославль)', stations: MSK_EKB_STATIONS as string[] },
  { id: 'ELISTA-AST',  name: 'Элиста→Астрахань', stations: ELISTA_AST_STATIONS as string[] },

  // Север/Урал
  { id: 'TYM-SURG-URNG', name: 'Тюмень↕Сургут↕Новый Уренгой', stations: TYM_SURG_URNG_STATIONS as string[] },
  { id: 'SURG-HM',       name: 'Сургут↔Ханты-Мансийск', stations: SURG_HM_STATIONS as string[] },
  { id: 'SURG-NVART',    name: 'Сургут↔Нижневартовск', stations: SURG_NVART_STATIONS as string[] },
  { id: 'URNG-MSK',      name: 'Новый Уренгой→Москва', stations: URNG_MSK_STATIONS as string[] },

  // Юг (доп.)
  { id: 'RST-KRS',       name: 'Ростов-на-Дону↙Краснодар', stations: RST_KRS_STATIONS as string[] },

  // Разделенные ветки Поволжья
  { id: 'MSK-TLT',       name: 'Москва→Тольятти (через Рязань, Пензу)', stations: MSK_TLT_STATIONS as string[] },
  { id: 'TLT-VLG',       name: 'Тольятти→Волгоград (через Саратов)', stations: TLT_VLG_STATIONS as string[] },
  // Восточное продолжение
  { id: 'NSK-FE',       name: 'Новосибирск→Владивосток (через Кемерово, Красноярск, Иркутск, Улан-Удэ, Читу, Сковородино, Биробиджан, Хабаровск, Уссурийск)', stations: NSK_FE_STATIONS as string[] },
  { id: 'SKV-BLG',      name: 'Сковородино↕Благовещенск', stations: SKV_BLG_STATIONS as string[] },
];

const MOVES_BY_ID: Record<string, Move[]> = {
  'NSK-MSK-1': NSK_MSK_BLUE_MOVES,
  'NSK-MSK-2': NSK_MSK_PINK_MOVES,
  'NSK-TLT':   NSK_TLT_MOVES,
  'MSK-MUR-SPB': MSK_MUR_SPB_MOVES,
  'MSK-MUR-YAR': MSK_MUR_YAR_MOVES,
  'MSK-RST':     MSK_RST_MOVES,
  'MSK-BUD':     MSK_BUD_MOVES,
  'MSK-EKB':     MSK_EKB_MOVES,
  'ELISTA-AST':  ELISTA_AST_MOVES,
  'TYM-SURG-URNG': TYM_SURG_URNG_MOVES,
  'SURG-HM':       SURG_HM_MOVES,
  'SURG-NVART':    SURG_NVART_MOVES,
  'URNG-MSK':      URNG_MSK_MOVES,
  'RST-KRS':       RST_KRS_MOVES,
  'MSK-TLT':       MSK_TLT_MOVES,
  'TLT-VLG':       TLT_VLG_MOVES,
  'NSK-FE':       NSK_FE_MOVES,
  'SKV-BLG':      SKV_BLG_MOVES,
};

const HUBS = new Set([
  "Москва", "Новосибирск", "Тольятти", "Казань", "Санкт-Петербург", 
  "Мурманск", "Ростов-на-Дону", "Астрахань", "Медвежьегорск", "Екатеринбург", "Пермь",
  // новые ключевые
  "Сургут", "Новый Уренгой", "Краснодар",
  // восток
  "Иркутск", "Красноярск", "Хабаровск", "Владивосток"
]);

// ===== Палитра уникальных цветов =====
function distinctColor(i:number){
  const hue = (i * 137.508) % 360; // золотой угол
  return `hsl(${hue}, 72%, 45%)`;
}
function withDistinctColors(base: Omit<LineDef,'color'>[]): LineDef[]{
  return base.map((l, i) => ({ ...l, color: distinctColor(i) }));
}

// ===== Утилиты =====
function computePositions(lines: LineDef[], moves: Record<string,Move[]>, origins: Record<string, {x:number;y:number}>){
  const pos: Record<string,{x:number;y:number}> = {};
  const ensure = (name:string, x:number,y:number)=>{
    if(!(name in pos)) pos[name] = {x,y};
    return pos[name];
  };

  for(const line of lines){
    const mv = moves[line.id];
    if(!mv) continue;
    const st = line.stations;
    if(st.length<2) continue;

    const startStation = st[0];
    const origin = origins[startStation] || origins['default'];
    const p0 = ensure(startStation, origin.x, origin.y);
    
    let cur = p0;
    for(let i=1;i<st.length;i++){
      const step = mv[i-1];
      const vec = VEC[step as Move];
      if(!vec) throw new Error(`Неизвестный ход "${step}" в ${line.id} @${i-1}`);
      const [dx,dy] = vec;
      const next = ensure(st[i], cur.x + dx, cur.y + dy);
      cur = next;
    }
  }
  return pos;
}

function buildEdges(line: LineDef, pos: Record<string,{x:number;y:number}>){
  const out: Array<{a:string;b:string;lineId:string}> = [];
  for(let i=0;i<line.stations.length-1;i++){
    const a = line.stations[i], b = line.stations[i+1];
    if(!pos[a] || !pos[b]) continue;
    out.push({a,b,lineId: line.id});
  }
  return out;
}

function edgeKey(a:string,b:string){ 
  return a<b? `${a}__${b}` : `${b}__${a}`;
}

function unitPerp(ax:number, ay:number, bx:number, by:number){
  const dx = bx-ax, dy = by-ay;
  const len = Math.hypot(dx,dy) || 1;
  return {px: -dy/len, py: dx/len};
}

function estimateTextSize(text:string, fontSize=13){
  const w=Math.ceil(text.length*fontSize*0.62), h=Math.ceil(fontSize*1.25);
  return {w,h};
}

type LabelPlacement = { x:number; y:number; anchor: 'start'|'end' };

function placeLabels(names:string[], pos:Record<string,{x:number;y:number}>, fontSize=13, scale=1){
  const placed: Record<string, LabelPlacement> = {};
  const rects: Array<{x:number;y:number;w:number;h:number}> = [];
  const entries = names.map(n=>[n,pos[n]] as const).sort((a,b)=>(a[1].y-b[1].y)||(a[1].x-b[1].x));
  
  const collide=(r:{x:number;y:number;w:number;h:number})=>rects.some(q=>!(r.x+r.w<q.x||q.x+q.w<r.x||r.y+r.h<q.y||q.y+q.h<r.y));
  
  const mk=(name:string,x:number,y:number,anchor:'start'|'end')=>{
    const {w,h}=estimateTextSize(name,fontSize);
    const pad=3*scale;
    const rx=anchor==='start'?x:x-w*scale;
    const ry=y-h*scale+4*scale;
    return {rect:{x:rx-pad,y:ry-pad,w:w*scale+pad*2,h:h*scale+pad*2}};
  };

  for(const [name,p] of entries){
    let chosen: LabelPlacement|undefined;
    const baseOffset = 24 * scale;
    const radii=[baseOffset, baseOffset*1.3, baseOffset*1.7, baseOffset*2.1, baseOffset*2.5, baseOffset*3];
    
    for(const d of radii){
      const cands: LabelPlacement[]=[
        {x:p.x+d,y:p.y-d*0.5,anchor:'start'},
        {x:p.x+d,y:p.y+d*0.8,anchor:'start'},
        {x:p.x-d,y:p.y+d*0.8,anchor:'end'},
        {x:p.x-d,y:p.y-d*0.5,anchor:'end'},
        {x:p.x,y:p.y-d*1.2,anchor:'start'},
        {x:p.x,y:p.y+d*1.2,anchor:'start'},
      ];
      
      for(const c of cands){
        const {rect}=mk(name,c.x,c.y,c.anchor);
        if(!collide(rect)){
          rects.push(rect);
          chosen=c;
          break;
        }
      }
      if(chosen) break;
    }
    
    if(!chosen){
      chosen={x:p.x+baseOffset*3.5,y:p.y+baseOffset*3.5,anchor:'start'};
      const {rect}=mk(name,chosen.x,chosen.y,chosen.anchor);
      rects.push(rect);
    }
    placed[name]=chosen;
  }
  return placed;
}

// ===== Самодиагностика и тесты =====
function runSelfTests(lines: LineDef[], pos: Record<string,{x:number;y:number}>){
  const messages: string[] = [];
  const errors: string[] = [];

  // 1) Валидация ходов
  for(const l of lines){
    const mv = MOVES_BY_ID[l.id];
    if(!mv){
      errors.push(`Нет последовательности ходов для линии ${l.id}`);
      continue;
    }
    if(mv.length !== l.stations.length - 1){
      errors.push(`Длина moves (${mv.length}) не равна stations-1 (${l.stations.length-1}) для ${l.id}`);
    }
    mv.forEach((m,i)=>{ if(!(m in VEC)) errors.push(`Неизвестный ход "${m}" в ${l.id} @${i}`); });
    messages.push(`✓ ${l.name}: ${l.stations.length} станций, ${mv.length} ходов`);
  }

  // 2) Дубли цветов запрещены
  const colorSet = new Set(lines.map(l=>l.color));
  if(colorSet.size !== lines.length){
    errors.push('Обнаружены повторяющиеся цвета линий — палитра должна быть уникальной.');
  } else {
    messages.push('✓ Все линии имеют уникальные цвета');
  }

  // 3) Общие участки (для параллельной отрисовки)
  const allEdges = lines.flatMap(l=>buildEdges(l, pos));
  const groups = new Map<string, string[]>();
  allEdges.forEach(e=>{
    const k=edgeKey(e.a,e.b);
    if(!groups.has(k)) groups.set(k,[]);
    groups.get(k)!.push(e.lineId);
  });
  const sharedEdges = Array.from(groups.entries()).filter(([,arr])=>arr.length>1);
  if(sharedEdges.length > 0){ messages.push(`✓ Найдено ${sharedEdges.length} общих участков`); }

  // 4) Воронеж/Тамбов выровнены с Тольятти
  if(pos["Воронеж"] && pos["Тамбов"] && pos["Тольятти"]){
    const d1 = Math.abs(pos["Воронеж"].y - pos["Тольятти"].y);
    const d2 = Math.abs(pos["Тамбов"].y - pos["Тольятти"].y);
    if(d1<1 && d2<1) messages.push('✓ Воронеж и Тамбов на одном уровне с Тольятти по Y');
    else errors.push(`Воронеж/Тамбов не выровнены по Y с Тольятти: ΔV=${d1.toFixed(1)}, ΔT=${d2.toFixed(1)}`);
  }

  // 5) Пермь строго над Казанью
  if(pos["Пермь"] && pos["Казань"]){
    const xDiff = Math.abs(pos["Пермь"].x - pos["Казань"].x);
    const yDiff = pos["Пермь"].y - pos["Казань"].y;
    if(xDiff<1 && yDiff<0) messages.push('✓ Пермь прямо над Казанью');
    else errors.push(`Пермь не строго над Казанью: ΔX=${xDiff.toFixed(0)}, ΔY=${yDiff.toFixed(0)}`);
  }

  // 6) Регрессионные мини‑тесты для новых веток
  const check = (id:string, expectLen:number)=>{
    const mv = MOVES_BY_ID[id];
    if(!mv) errors.push(`Нет moves для ${id}`);
    else if(mv.length !== expectLen-1) errors.push(`Несоответствие хода для ${id}: ожидалось ${expectLen-1}, получили ${mv.length}`);
    else messages.push(`✓ ${id}: корректное число ходов`);
  };
  check('MSK-TLT', MSK_TLT_STATIONS.length);
  check('TLT-VLG', TLT_VLG_STATIONS.length);

  return {messages, errors};
}

export default function CompleteMetroMap(){
  const [scale, setScale] = useState(0.6);
  const [translateX, setTranslateX] = useState(300);
  const [translateY, setTranslateY] = useState(150);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState({x:0, y:0});
  const [showLegend, setShowLegend] = useState(true);
  
  const svgRef = useRef<SVGSVGElement>(null);
  const containerWidth = 1200, containerHeight = 800;

  // Инициализируем линии с уникальными цветами ОДИН РАЗ
  const lines = useMemo(()=>withDistinctColors(BASE_LINES), []);
  
  // Определяем начальные позиции для разных маршрутов
  const origins = {
    'Новосибирск': {x: 1200, y: 500},
    'Москва': {x: 600, y: 400},
    'default': {x: 600, y: 400}
  } as const;
  
  const basePos = useMemo(()=>computePositions(lines, MOVES_BY_ID, origins), [lines]);

  // === ПОСТ-СДВИГ ЮЖНЫХ ВЕТОК ===
  const pos = useMemo(()=>{
    const p: Record<string,{x:number;y:number}> = Object.fromEntries(Object.entries(basePos).map(([k,v])=>[k,{...v}]));
    const have = (n:string)=>p[n]!==undefined;

    // Спускаем юг, чтобы Воронеж и Тамбов были на уровне Тольятти
    const southShiftSet = [
      'Воронеж','Ростов-на-Дону',
      'Тамбов','Волгоград','Элиста','Астрахань','Будённовск',
      'Краснодар',
    ];
    if(have('Тольятти') && have('Воронеж') && have('Тамбов')){
      const targetY = p['Тольятти'].y;
      const dVor = targetY - p['Воронеж'].y;
      const dTam = targetY - p['Тамбов'].y;
      const dY = Math.round((dVor + dTam) / 2);
      southShiftSet.forEach(name=>{ if(p[name]) p[name].y += dY; });
    }

    // Пермь строго над Казанью (совпадает X, Пермь выше)
    if (have('Пермь') && have('Казань')) {
      p['Пермь'].x = p['Казань'].x;
      if (p['Пермь'].y >= p['Казань'].y) {
        p['Пермь'].y = p['Казань'].y - GRID;
      }
    }
    return p;
  }, [basePos]);

  const stations = useMemo(()=>Array.from(new Set(lines.flatMap(l=>l.stations))), [lines]);
  const labels = useMemo(()=>placeLabels(stations, pos, 12, scale), [pos, scale]);

  // Навигация
  const handleZoom = useCallback((delta: number, centerX?: number, centerY?: number) => {
    const newScale = Math.max(0.2, Math.min(3, scale + delta));
    if (newScale === scale) return;
    const zoomCenterX = centerX ?? containerWidth / 2;
    const zoomCenterY = centerY ?? containerHeight / 2;
    const scaleFactor = newScale / scale;
    const newTranslateX = zoomCenterX + (translateX - zoomCenterX) * scaleFactor;
    const newTranslateY = zoomCenterY + (translateY - zoomCenterY) * scaleFactor;
    setScale(newScale);
    setTranslateX(newTranslateX);
    setTranslateY(newTranslateY);
  }, [scale, translateX, translateY, containerWidth, containerHeight]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    handleZoom(delta, mouseX, mouseY);
  }, [handleZoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setLastMouse({x: e.clientX, y: e.clientY});
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - lastMouse.x;
    const deltaY = e.clientY - lastMouse.y;
    setTranslateX(prev => prev + deltaX);
    setTranslateY(prev => prev + deltaY);
    setLastMouse({x: e.clientX, y: e.clientY});
  }, [isDragging, lastMouse]);

  const handleMouseUp = useCallback(() => { setIsDragging(false); }, []);
  const resetView = useCallback(() => { setScale(0.6); setTranslateX(300); setTranslateY(150); }, []);

  // Самотесты (важно: передаём lines!)
  const {messages, errors} = useMemo(()=>runSelfTests(lines, pos), [lines, pos]);

  return (
    <div className="w-full bg-gray-50 text-gray-900 min-h-screen">
      {/* Шапка */}
      <div className="bg-white shadow-sm border-b p-3">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-blue-900 mb-1">Обновленная карта железнодорожных маршрутов России</h1>
            <p className="text-sm text-gray-600 mb-2">
              Москва→Тольятти и Тольятти→Волгоград — отдельные ветки. Пермь над Казанью. Ростов↙Краснодар. Север до Нового Уренгоя.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <button onClick={() => handleZoom(0.15)} className="w-8 h-8 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded text-lg transition-colors">+</button>
                <button onClick={() => handleZoom(-0.15)} className="w-8 h-8 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded text-lg transition-colors">−</button>
              </div>
              <button onClick={resetView} className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded transition-colors">Сброс</button>
              <button onClick={() => setShowLegend(!showLegend)} className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-sm rounded transition-colors">{showLegend ? 'Скрыть легенду' : 'Легенду'}</button>
              <div className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">{Math.round(scale * 100)}%</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Легенда */}
        {showLegend && (
          <div className="w-72 bg-white shadow-sm border-r p-3 h-screen overflow-y-auto">
            <h3 className="font-bold text-base mb-3 text-gray-800">Маршруты</h3>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-blue-800 border-b pb-1">Старые маршруты:</div>
              {lines.slice(0, 3).map(line => (
                <div key={line.id} className="flex items-start gap-2 text-sm">
                  <div className="w-3 h-3 rounded mt-0.5 flex-shrink-0" style={{backgroundColor: line.color}}></div>
                  <div><div className="font-medium text-xs">{line.name}</div></div>
                </div>
              ))}
              <div className="text-sm font-semibold text-green-800 border-b pb-1 mt-4">Новые маршруты:</div>
              {lines.slice(3).map(line => (
                <div key={line.id} className="flex items-start gap-2 text-sm">
                  <div className="w-3 h-3 rounded mt-0.5 flex-shrink-0" style={{backgroundColor: line.color}}></div>
                  <div><div className="font-medium text-xs">{line.name}</div></div>
                </div>
              ))}
            </div>

            {/* Статус */}
            <div className="mt-4">
              <h4 className="font-semibold text-gray-700 mb-2 text-sm">Статус системы</h4>
              {errors.length > 0 ? (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-xs">
                  <div className="font-semibold text-red-800 mb-1">Ошибки:</div>
                  <ul className="space-y-1 text-red-700">{errors.map((e,i)=>(<li key={i}>• {e}</li>))}</ul>
                </div>
              ) : (
                <div className="p-2 bg-green-50 border border-green-200 rounded text-xs">
                  <div className="font-semibold text-green-800 mb-1">Проверки пройдены:</div>
                  <ul className="space-y-1 text-green-700">
                    {messages.slice(0, 6).map((m,i)=>(<li key={i}>• {m}</li>))}
                    {messages.length > 6 && <li className="text-green-600">• +{messages.length - 6} других</li>}
                  </ul>
                </div>
              )}
            </div>

            {/* Координаты/проверки */}
            <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs max-h-64 overflow-y-auto">
              <div className="font-semibold text-blue-800 mb-2">Координаты всех городов и станций:</div>
              <div className="text-blue-700 space-y-0.5 font-mono text-xs">
                {stations.sort().map(name => (
                  <div key={name} className="flex justify-between">
                    <span className="font-medium">{name}:</span>
                    <span>X={pos[name]?.x?.toFixed(0) || 'N/A'}, Y={pos[name]?.y?.toFixed(0) || 'N/A'}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-blue-300">
                <div className="font-semibold text-blue-800 mb-1">Проверка выравнивания:</div>
                {pos["Воронеж"] && pos["Тамбов"] && (
                  <div className={Math.abs(pos["Воронеж"].y - pos["Тамбов"].y) < 1 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                    Воронеж-Тамбов Y: {Math.abs(pos["Воронеж"].y - pos["Тамбов"].y).toFixed(1)}px
                  </div>
                )}
                {pos["Тольятти"] && pos["Воронеж"] && (
                  <div className={Math.abs(pos["Тольятти"].y - pos["Воронеж"].y) < 1 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                    Воронеж↔Тольятти Y: {Math.abs(pos["Тольятти"].y - pos["Воронеж"].y).toFixed(1)}px
                  </div>
                )}
                {pos["Тольятти"] && pos["Тамбов"] && (
                  <div className={Math.abs(pos["Тольятти"].y - pos["Тамбов"].y) < 1 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                    Тамбов↔Тольятти Y: {Math.abs(pos["Тольятти"].y - pos["Тамбов"].y).toFixed(1)}px
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Карта */}
        <div className="flex-1 overflow-hidden bg-white relative">
          <svg 
            ref={svgRef}
            width={containerWidth} 
            height={containerHeight}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            className="select-none w-full h-screen"
          >
            <rect width="100%" height="100%" fill="#fafafa" />

            <g transform={`translate(${translateX}, ${translateY}) scale(${scale})`}>
              {/* Линии маршрутов (с параллельным смещением для общих участков) */}
              {(() => {
                const allEdges = lines.flatMap(l => buildEdges(l, pos));
                const groups = new Map<string, Array<{a:string;b:string;lineId:string}>>();
                allEdges.forEach(e=>{ const k=edgeKey(e.a,e.b); if(!groups.has(k)) groups.set(k,[]); groups.get(k)!.push(e); });
                const offsetStep = 12;
                const elems: JSX.Element[] = [];
                groups.forEach((arr, k)=>{
                  arr.sort((x,y)=> x.lineId.localeCompare(y.lineId));
                  const n = arr.length;
                  arr.forEach((e, idx)=>{
                    const A = pos[e.a], B = pos[e.b];
                    const {px,py} = unitPerp(A.x,A.y,B.x,B.y);
                    const off = (idx - (n-1)/2) * offsetStep;
                    const x1 = A.x + px*off, y1 = A.y + py*off;
                    const x2 = B.x + px*off, y2 = B.y + py*off;
                    const color = lines.find(l=>l.id===e.lineId)!.color;
                    elems.push(
                      <line key={`${k}_${e.lineId}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
                    );
                  });
                });
                return elems;
              })()}

              {/* Станции */}
              {stations.map(name=>{
                const p = pos[name];
                const isHub = HUBS.has(name);
                return (<circle key={name} cx={p.x} cy={p.y} r={isHub ? 7 : 5} fill="#fff" stroke={isHub ? "#1e40af" : "#374151"} strokeWidth={isHub ? 3 : 2} />);
              })}

              {/* Подписи */}
              {stations.map(name=>{
                const p = pos[name];
                const lab = labels[name];
                const isHub = HUBS.has(name);
                const {w,h} = estimateTextSize(name, 13);
                return (
                  <g key={`${name}_lab`}>
                    {isHub && (<rect x={lab.anchor==='start'? lab.x-4 : lab.x-w-4} y={lab.y-h-2} width={w+8} height={h+4} fill="rgba(255,255,255,0.95)" stroke="#3b82f6" strokeWidth={1.5} rx={4} ry={4} />)}
                    <text x={lab.x} y={lab.y} fontSize={13} textAnchor={lab.anchor} stroke="#fff" strokeWidth={3} paintOrder="stroke" fill={isHub ? "#1e40af" : "#111"} fontWeight={isHub ? 'bold' : 'normal'}>{name}</text>
                  </g>
                );
              })}

              {/* Стрелки направления (только на длинных сегментах) */}
              {lines.map(line => {
                const edges = buildEdges(line, pos);
                return edges.map((edge, idx) => {
                  const A = pos[edge.a], B = pos[edge.b];
                  const midX = (A.x + B.x) / 2;
                  const midY = (A.y + B.y) / 2;
                  const dx = B.x - A.x;
                  const dy = B.y - A.y;
                  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                  const distance = Math.hypot(dx, dy);
                  if (distance < GRID * 1.3) return null;
                  return (
                    <g key={`arrow_${edge.lineId}_${idx}`} transform={`translate(${midX}, ${midY}) rotate(${angle})`}>
                      <polygon points="-6,-3 6,0 -6,3" fill={lines.find(l=>l.id===edge.lineId)!.color} opacity={0.8} stroke="#fff" strokeWidth={1} />
                    </g>
                  );
                }).filter(Boolean);
              })}
            </g>
          </svg>

          {/* Мини-карта */}
          <div className="absolute top-3 right-3 w-40 h-24 bg-white border border-gray-300 rounded shadow-lg overflow-hidden">
            <svg width="100%" height="100%" viewBox="0 0 1400 900">
              <rect width="100%" height="100%" fill="#f8fafc" />
              {lines.map(line => {
                const edges = buildEdges(line, pos);
                return edges.map((edge, idx) => {
                  const A = pos[edge.a], B = pos[edge.b];
                  return (<line key={`mini_${line.id}_${idx}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={line.color} strokeWidth={2} opacity={0.8} />);
                });
              })}
              <rect x={-translateX / scale} y={-translateY / scale} width={containerWidth / scale} height={containerHeight / scale} fill="none" stroke="#ef4444" strokeWidth={3} opacity={0.8} strokeDasharray="8,4" />
            </svg>
            <div className="absolute bottom-0 left-1 text-xs text-gray-500 bg-white px-1">Обзор</div>
          </div>

          {/* Инфо-панель */}
          <div className="absolute bottom-3 left-3 bg-white border border-gray-300 rounded shadow-lg p-2 max-w-xs">
            <div className="text-xs">
              <div className="font-semibold text-gray-800 mb-1">Навигация:</div>
              <div className="text-gray-600 space-y-0.5">
                <div>🖱️ Перетаскивание — движение</div>
                <div>🎡 Колесико — зум</div>
                <div>➕➖ Кнопки — точный зум</div>
              </div>
              <div className="mt-2 pt-1 border-t border-gray-200">
                <div className="text-xs text-gray-500">Станций: {stations.length} • Маршрутов: {lines.length}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
