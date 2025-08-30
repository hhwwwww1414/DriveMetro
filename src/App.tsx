import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";

// ==========================
// ЭТАЛОННЫЕ ТОЧКИ + МИНИМАЛЬНЫЙ НАБОР ВЕТОК + РЕЖИМ РЕДАКТИРОВАНИЯ ТОЧЕК
// — используем только города из BASE_POS; пропущенные в маршрутах — перескакиваем
// — уникальные цвета/стили для веток; параллельные общие участки разводим
// — Режим правки: перетаскивание со снапом, ручной ввод X/Y, импорт/экспорт JSON,
//   локальное сохранение в localStorage, сетка
// ==========================

type XY = { x:number; y:number };

type LineStyle = 'solid' | 'dashed' | 'dotted';

type LineDef = { id: string; name: string; style: LineStyle; color: string; path: string[] };

const GRID = 120;
const STORAGE_KEY = 'metro_pos_overrides_v2';
const STORAGE_VISIBLE = 'metro_lines_visibility_v1';

// --- Базовые (эталонные) координаты ---
const BASE_POS: Record<string, XY> = {
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
  "Екатеринбург": {x:840, y:360},
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

const stations = Object.keys(BASE_POS);

// Города, которые исключаем из маршрутов (по твоему требованию)
const REMOVED_FROM_ROUTES = new Set<string>(["Калининград","Кострома"]);

// ---- Геометрия линий ----
function unitPerp(ax:number, ay:number, bx:number, by:number){
  const dx = bx-ax, dy = by-ay; const len = Math.hypot(dx,dy) || 1; return {px: -dy/len, py: dx/len};
}
function edgeKey(a:string,b:string){ return a<b? `${a}__${b}` : `${b}__${a}`; }

function estimateTextSize(text:string, fontSize=13){
  const w=Math.ceil(text.length*fontSize*0.62), h=Math.ceil(fontSize*1.25);
  return {w,h};
}

type LabelPlacement = { x:number; y:number; anchor: 'start'|'end' };
function placeLabels(names:string[], pos:Record<string,XY>, fontSize=13, scale=1){
  const placed: Record<string, LabelPlacement> = {}; const rects: Array<{x:number;y:number;w:number;h:number}> = [];
  const entries = names.map(n=>[n,pos[n]] as const).sort((a,b)=>(a[1].y-b[1].y)||(a[1].x-b[1].x));
  const collide=(r:{x:number;y:number;w:number;h:number})=>rects.some(q=>!(r.x+r.w<q.x||q.x+q.w<r.x||r.y+r.h<q.y||q.y+q.h<r.y));
  const mk=(name:string,x:number,y:number,anchor:'start'|'end')=>{ const {w,h}=estimateTextSize(name,fontSize); const pad=3*scale; const rx=anchor==='start'?x:x-w*scale; const ry=y-h*scale+4*scale; return {rect:{x:rx-pad,y:ry-pad,w:w*scale+pad*2,h:h*scale+pad*2}}; };
  for(const [name,p] of entries){ let chosen: LabelPlacement|undefined; const base=20*scale; const radii=[base, base*1.4, base*1.8, base*2.2, base*2.6];
    for(const d of radii){ const cands: LabelPlacement[]=[
      {x:p.x+d,y:p.y-d*0.5,anchor:'start'},
      {x:p.x+d,y:p.y+d*0.8,anchor:'start'},
      {x:p.x-d,y:p.y+d*0.8,anchor:'end'},
      {x:p.x-d,y:p.y-d*0.5,anchor:'end'},
      {x:p.x,y:p.y-d*1.2,anchor:'start'},
      {x:p.x,y:p.y+d*1.2,anchor:'start'},
    ];
      for(const c of cands){ const {rect}=mk(name,c.x,c.y,c.anchor); if(!collide(rect)){ rects.push(rect); chosen=c; break; } } if(chosen) break; }
    if(!chosen){ chosen={x:p.x+base*3.2,y:p.y+base*3.2,anchor:'start'}; const {rect}=mk(name,chosen.x,chosen.y,chosen.anchor); rects.push(rect); }
    placed[name]=chosen; }
  return placed; }

// Helpers
const distinctColor = (i:number)=>`hsl(${(i*137.508)%360}, 72%, 45%)`;
const snap = (v:number, step:number)=> Math.round(v/step)*step;

function route(path: string[]): string[]{
  const out: string[] = [];
  for(const name of path){ if(!BASE_POS[name]) continue; if(REMOVED_FROM_ROUTES.has(name)) continue; if(out.length===0 || out[out.length-1]!==name) out.push(name); }
  return out;
}

function buildEdgesFromPath(path: string[]): Array<{a:string;b:string}>{
  const edges: Array<{a:string;b:string}> = [];
  for(let i=0;i<path.length-1;i++){ const a=path[i], b=path[i+1]; if(a!==b) edges.push({a,b}); }
  return edges;
}

// --- Минимальный набор веток (на базе твоих CSV-маршрутов) ---
const RAW_LINES: Omit<LineDef,'color'>[] = [
  // ТОЛЬКО МАГИСТРАЛИ МЕЖДУ КРУПНЫМИ ХАБАМИ
  // Новосибирск → Москва (вариант 1: через Тюмень/Екатеринбург/НЧ)
  { id:'NSK-MSK-A', name:'Новосибирск → Москва (через Тюмень / Екатеринбург / НЧ)', style:'solid', path: route(['Новосибирск','Омск','Тюмень','Екатеринбург','Набережные Челны','Казань','Чебоксары','Нижний Новгород','Владимир','Москва']) },
  // Новосибирск → Москва (вариант 2: через Курган/Челябинск/Уфа/НЧ)
  { id:'NSK-MSK-B', name:'Новосибирск → Москва (через Курган / Челябинск / Уфа / НЧ)', style:'solid', path: route(['Новосибирск','Омск','Курган','Челябинск','Уфа','Набережные Челны','Казань','Чебоксары','Нижний Новгород','Владимир','Москва']) },
  // Новосибирск → Тольятти (через Курган/Челябинск/Уфа)
  { id:'NSK-TLT', name:'Новосибирск → Тольятти (через Курган / Челябинск / Уфа)', style:'solid', path: route(['Новосибирск','Омск','Курган','Челябинск','Уфа','Тольятти']) },
  // Москва → Ростов-на-Дону (через Воронеж)
  { id:'MSK-RST', name:'Москва → Владикавказ (через Воронеж / Ростов / Невинномысск / Минеральные Воды / Нальчик)', style:'solid', path: route(['Москва','Воронеж','Ростов-на-Дону','Невинномысск','Минеральные Воды','Нальчик','Владикавказ']) },
  // Москва → Волгоград (через Тамбов)
  { id:'MSK-VLG', name:'Москва → Элиста (через Тамбов / Волгоград)', style:'solid', path: route(['Москва','Тамбов','Волгоград','Элиста']) },
  // Тольятти → Волгоград (через Саратов)
  { id:'TLT-VLG', name:'Тольятти → Элиста (через Саратов / Волгоград)', style:'solid', path: route(['Тольятти','Саратов','Волгоград','Элиста']) },
  // Новосибирск → Ростов-на-Дону (сплошная: через Уфу / Тольятти / Саратов / Волгоград)
  { id:'NSK-RST-SOUTH', name:'Новосибирск → Ростов-на-Дону (через Уфу / Тольятти / Саратов / Волгоград)', style:'solid', path: route(['Новосибирск','Омск','Курган','Челябинск','Уфа','Тольятти','Саратов','Волгоград','Ростов-на-Дону']) },
  // Саратов → Воронеж → Ростов-на-Дону (оранжевая ветка)
  { id:'SRT-VRN-RST', name:'Саратов → Воронеж → Ростов-на-Дону', style:'solid', path: route(['Саратов','Воронеж','Ростов-на-Дону']) },
  // Краснодар → Ростов-на-Дону (оранжевая ветка)
  { id:'KRD-RST', name:'Краснодар → Ростов-на-Дону', style:'solid', path: route(['Краснодар','Ростов-на-Дону']) },

  // --- НОВЫЕ ВЕТКИ ПО ТВОЕМУ СПИСКУ ---
  // 1) Сургут → Москва (через Пермь / Ижевск / Казань)
  { id:'SRG-MSK-IZH', name:'Сургут → Москва (через Пермь / Ижевск / Казань)', style:'solid', path: route(['Сургут','Тюмень','Екатеринбург','Пермь','Ижевск','Казань','Чебоксары','Нижний Новгород','Владимир','Москва']) },
  // 2) Сургут → Москва (через Пермь / Киров / Ярославль)
  { id:'SRG-MSK-KIR', name:'Сургут → Москва (через Пермь / Киров / Ярославль)', style:'solid', path: route(['Сургут','Тюмень','Екатеринбург','Пермь','Киров','Ярославль','Москва']) },
  // 3) Москва → Мурманск (через СПб / Петрозаводск / Медвежьегорск)
  { id:'MSK-MUR-SPB', name:'Москва → Мурманск (через СПб / Петрозаводск / Медвежьегорск)', style:'solid', path: route(['Москва','Тверь','Великий Новгород','Санкт-Петербург','Петрозаводск','Медвежьегорск','Мурманск']) },
  // 4) Москва → Мурманск (через Ярославль / Вологду / Медвежьегорск)
  { id:'MSK-MUR-YAR', name:'Москва → Мурманск (через Ярославль / Вологду / Медвежьегорск)', style:'solid', path: route(['Москва','Ярославль','Вологда','Медвежьегорск','Мурманск']) },

  // --- ЮЖНЫЕ И КРЫМСКИЕ КОРИДОРЫ ---
  // 1) Ростов → Краснодар → Керчь → Симферополь → Севастополь
  { id:'RST-KRD-CRIMEA', name:'Ростов → Краснодар → Керчь → Симферополь → Севастополь', style:'solid', path: route(['Ростов-на-Дону','Краснодар','Керчь','Симферополь','Севастополь']) },
  // 2) Ростов → Мариуполь → Мелитополь → Симферополь → Севастополь
  { id:'RST-MAR-CRIMEA', name:'Ростов → Мариуполь → Мелитополь → Симферополь → Севастополь', style:'solid', path: route(['Ростов-на-Дону','Мариуполь','Мелитополь','Симферополь','Севастополь']) },
  // 3) Ростов → Невинномысск → Минеральные Воды → Нальчик → Владикавказ
    // 4) Волгоград → Элиста → Будённовск → Грозный → Махачкала
  { id:'VLG-ELI-GRZ-MAH', name:'Элиста → Будённовск → Грозный → Махачкала', style:'solid', path: route(['Элиста','Будённовск','Грозный','Махачкала']) },
  // 5) Волгоград → Элиста → Астрахань → Махачкала
  { id:'VLG-ELI-AST-MAH', name:'Элиста → Астрахань → Махачкала', style:'solid', path: route(['Элиста','Астрахань','Махачкала']) },
  // 6) Волгоград → Элиста → Невинномысск → Минеральные Воды → Нальчик → Владикавказ
  { id:'VLG-ELI-CAUC', name:'Элиста → Невинномысск → Минеральные Воды → Нальчик → Владикавказ', style:'solid', path: route(['Элиста','Невинномысск','Минеральные Воды','Нальчик','Владикавказ']) }
  ,
  // --- НОВЫЕ ВЕТКИ (ПО ЗАПРОСУ) ---
  // 1) Москва → Орск (через Рязань / Пензу / Тольятти / Оренбург)
  { id:'MSK-ORSK', name:'Москва → Орск (через Рязань / Пензу / Тольятти / Оренбург)', style:'solid', path: route(['Москва','Рязань','Пенза','Тольятти','Оренбург','Орск']) },
  // 2) Новый Уренгой → Сургут
  { id:'NRG-SRG', name:'Новый Уренгой → Сургут', style:'solid', path: route(['Новый Уренгой','Сургут']) },
  // 3) Ханты-Мансийск → Сургут
  { id:'KHM-SRG', name:'Ханты-Мансийск → Сургут', style:'solid', path: route(['Ханты-Мансийск','Сургут']) },
  // 4) Нижневартовск → Сургут
  { id:'NVV-SRG', name:'Нижневартовск → Сургут', style:'solid', path: route(['Нижневартовск','Сургут']) },
  // 5) Новосибирск → Горно-Алтайск (через Барнаул / Бийск)
  { id:'NSK-GALT', name:'Новосибирск → Горно-Алтайск (через Барнаул / Бийск)', style:'solid', path: route(['Новосибирск','Барнаул','Бийск','Горно-Алтайск']) },
  // 6) Томск → Новокузнецк (через Кемерово)
  { id:'TOM-NOVK', name:'Томск → Новокузнецк (через Кемерово)', style:'solid', path: route(['Томск','Кемерово','Новокузнецк']) },
  // 7) Красноярск → Кызыл (через Абакан)
  { id:'KRS-KYZ', name:'Красноярск → Кызыл (через Абакан)', style:'solid', path: route(['Красноярск','Абакан','Кызыл']) },
  // 8) Чита → Магадан (через Якутск)
  { id:'CHT-MAG', name:'Чита → Магадан (через Якутск)', style:'solid', path: route(['Чита','Якутск','Магадан']) },
  // 9) Новосибирск → Владивосток (через Кемерово, Красноярск, Иркутск, Улан-Удэ, Читу, Сковородино, Свободный, Биробиджан, Хабаровск, Уссурийск)
  { id:'NSK-VVO', name:'Новосибирск → Владивосток (восточный коридор)', style:'solid', path: route(['Новосибирск','Кемерово','Красноярск','Иркутск','Улан-Удэ','Чита','Сковородино','Свободный','Благовещенск','Биробиджан','Хабаровск','Уссурийск','Владивосток']) }
];

// Удаляем «дыры», чтобы не было undefined-линий
const RAW_LINES_CLEAN = RAW_LINES.filter(Boolean) as Omit<LineDef,'color'>[];

// Уникальные цвета для всех линий. При желании можно закреплять отдельные.
const COLOR_OVERRIDES: Record<string,string> = {
  // Единый цвет для "Элистинского коридора"
  'MSK-VLG': '#1A73E8',            // Москва → Элиста (через Тамбов / Волгоград)
  'VLG-ELI-AST-MAH': '#1A73E8',    // Элиста → Астрахань → Махачкала
  'VLG-ELI-GRZ-MAH': '#1A73E8',    // Элиста → Будённовск → Грозный → Махачкала

  // Жёлтый для объединённой ветки Москва → Владикавказ через Воронеж/Ростов/КМВ
  'MSK-RST': '#F6C026',

  // Фиксированный цвет южного транзита и ответвлений — ОРАНЖЕВЫЙ
  'NSK-RST-SOUTH': '#F97316',      // Новосибирск → Ростов-на-Дону
  'SRT-VRN-RST': '#F97316',        // Саратов → Воронеж → Ростов-на-Дону
  'KRD-RST': '#F97316',            // Краснодар → Ростов-на-Дону

  // Сохраняем фирменный фиолетовый
  'TLT-VLG': '#10B981'
};

const LINES: LineDef[] = RAW_LINES_CLEAN.map((l,i)=>({
  ...l,
  color: COLOR_OVERRIDES[l.id] ?? distinctColor(i)
}));

// --- Построение общих отрезков ---
function buildEdges(line: LineDef){ return buildEdgesFromPath(line.path).map(e=>({ ...e, lineId: line.id })); }

export default function MetroBranches(){
  const [scale, setScale] = useState(0.6);
  const [translateX, setTranslateX] = useState(300);
  const [translateY, setTranslateY] = useState(150);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStation, setDragStation] = useState<string|null>(null);
  const [selected, setSelected] = useState<string|null>(null);

  const [halfSnap, setHalfSnap] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [editMode, setEditMode] = useState(true);

  // Видимость веток
  const [visible, setVisible] = useState<Record<string, boolean>>(()=>{
    try { const raw = localStorage.getItem(STORAGE_VISIBLE); if(raw) return JSON.parse(raw); } catch {}
    const v: Record<string, boolean> = {}; for(const l of LINES){ if(!l) continue; v[l.id] = true; } return v;
  });
  useEffect(()=>{
    // гарантируем ключи для новых/переименованных линий
    setVisible(prev=>{ const next={...prev}; let changed=false; for(const l of LINES){ if(!l) continue; if(typeof next[l.id] !== 'boolean'){ next[l.id]=true; changed=true; } } return changed? next: prev; });
  },[]);
  useEffect(()=>{ try{ localStorage.setItem(STORAGE_VISIBLE, JSON.stringify(visible)); }catch{} },[visible]);
  const activeLines = useMemo(()=> LINES.filter(l => l && visible[l.id] !== false), [visible]);
  const toggleLine = useCallback((id:string)=>{ setVisible(v=> ({...v, [id]: !(v[id] !== false)})); },[]);
  const soloLine = useCallback((id:string)=>{ const v:Record<string,boolean>={}; for(const l of LINES) if(l) v[l.id] = (l.id===id); setVisible(v); },[]);
  const showAll = useCallback(()=>{ const v:Record<string,boolean>={}; for(const l of LINES) if(l) v[l.id]=true; setVisible(v); },[]);
  const hideAll = useCallback(()=>{ const v:Record<string,boolean>={}; for(const l of LINES) if(l) v[l.id]=false; setVisible(v); },[]);
  const invertAll = useCallback(()=>{ const v:Record<string,boolean>={}; for(const l of LINES) if(l) v[l.id]= !(visible[l.id] !== false); setVisible(v); },[visible]);

  // Позиции c учётом оверрайдов
  const [pos, setPos] = useState<Record<string, XY>>(()=> ({...BASE_POS}));

  // Загрузка/сохранение оверрайдов
  useEffect(()=>{
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw){ const overrides = JSON.parse(raw) as Record<string,XY>; setPos(p=> ({...p, ...overrides})); }
    }catch{ /* ignore */ }
  },[]);

  const saveOverrides = useCallback((next: Record<string,XY>)=>{
    const diff: Record<string,XY> = {};
    for(const k of stations){ const b=BASE_POS[k]; const n=next[k]; if(!b||!n) continue; if(b.x!==n.x||b.y!==n.y) diff[k]={x:n.x,y:n.y}; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diff));
  },[]);

  const svgRef = useRef<SVGSVGElement>(null);

  const labels = useMemo(()=>placeLabels(stations, pos, 13, scale), [pos, scale]);
  const containerWidth = 1200, containerHeight = 800;

  const screenToWorld = useCallback((sx:number, sy:number)=>{
    return { x: (sx - translateX)/scale, y: (sy - translateY)/scale };
  },[scale, translateX, translateY]);

  const handleZoom = useCallback((delta: number, centerX?: number, centerY?: number) => {
    const newScale = Math.max(0.2, Math.min(3, scale + delta)); if (newScale === scale) return;
    const rect = svgRef.current?.getBoundingClientRect();
    const zoomCenterX = centerX ?? (rect ? rect.width/2 : containerWidth/2);
    const zoomCenterY = centerY ?? (rect ? rect.height/2 : containerHeight/2);
    const scaleFactor = newScale / scale;
    const newTranslateX = zoomCenterX + (translateX - zoomCenterX) * scaleFactor;
    const newTranslateY = zoomCenterY + (translateY - zoomCenterY) * scaleFactor;
    setScale(newScale); setTranslateX(newTranslateX); setTranslateY(newTranslateY);
  }, [scale, translateX, translateY]);

  const [lastMouse, setLastMouse] = useState({x:0, y:0});

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault(); const rect = svgRef.current?.getBoundingClientRect(); if (!rect) return;
    const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top; const delta = e.deltaY > 0 ? -0.1 : 0.1; handleZoom(delta, mouseX, mouseY);
  }, [handleZoom]);

  const pickStationAt = useCallback((sx:number, sy:number)=>{
    const {x,y} = screenToWorld(sx, sy);
    let best: {name:string; d:number} | null = null;
    for(const name of stations){ const p = pos[name]; const d = Math.hypot(p.x-x, p.y-y); if(best==null || d<best.d) best={name, d}; }
    if(best && best.d <= 12) return best.name; // радиус выбора ~12px в мировых координатах
    return null;
  },[pos, screenToWorld]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if(editMode){
      const picked = pickStationAt(e.clientX, e.clientY);
      if(picked){ setSelected(picked); setDragStation(picked); return; }
    }
    setIsDragging(true);
    setLastMouse({x: e.clientX, y: e.clientY});
  }, [editMode, pickStationAt]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if(dragStation){
      const {x,y} = screenToWorld(e.clientX, e.clientY);
      const step = halfSnap ? GRID/2 : GRID;
      const nx = snap(x, step); const ny = snap(y, step);
      setPos(prev=>{ const next={...prev, [dragStation]: {x:nx, y:ny} }; saveOverrides(next); return next; });
      return;
    }
    if (!isDragging) return;
    const dx = e.clientX - lastMouse.x; const dy = e.clientY - lastMouse.y;
    setTranslateX(p=>p+dx); setTranslateY(p=>p+dy); setLastMouse({x: e.clientX, y: e.clientY});
  }, [dragStation, halfSnap, isDragging, lastMouse, screenToWorld, saveOverrides]);

  const handleMouseUp = useCallback(() => { setIsDragging(false); setDragStation(null); }, []);

  const resetView = useCallback(() => { setScale(0.6); setTranslateX(300); setTranslateY(150); }, []);

  const resetOverrides = useCallback(()=>{
    localStorage.removeItem(STORAGE_KEY);
    setPos({...BASE_POS});
  },[]);

  const importJSON = useCallback(()=>{
    const raw = prompt('Вставь JSON с оверрайдами позиций ("{"Город":{"x":..,"y":..}, ...}")');
    if(!raw) return;
    try{ const obj = JSON.parse(raw) as Record<string,XY>; const next={...pos, ...obj}; setPos(next); saveOverrides(next); }
    catch{ alert('Не удалось распарсить JSON'); }
  },[pos, saveOverrides]);

  const exportJSON = useCallback(()=>{
    const diff: Record<string,XY> = {};
    for(const k of stations){ const b=BASE_POS[k]; const n=pos[k]; if(!b||!n) continue; if(b.x!==n.x||b.y!==n.y) diff[k]={x:n.x,y:n.y}; }
    const txt = JSON.stringify(diff, null, 2);
    // Покажем в prompt, чтобы можно было быстро скопировать
    prompt('Скопируй JSON оверрайдов:', txt);
  },[pos]);

  const overridesCount = useMemo(()=>{
    let n=0; for(const k of stations){ const b=BASE_POS[k], p=pos[k]; if(!b||!p) continue; if(b.x!==p.x||b.y!==p.y) n++; } return n;
  },[pos]);

  // Простая самодиагностика (тесты)
  const selfTest = useMemo(()=>{
    const errors: string[] = [];
    const warns: string[] = [];
    // 1) у всех станций есть числовые координаты
    for(const k of stations){ const p = pos[k]; if(!p || typeof p.x!=="number" || typeof p.y!=="number") errors.push(`Нет координат для ${k}`); }
    // 2) у всех линий корректный путь (массив) и хотя бы 2 узла
    for(const L of LINES){
      if(!L || !Array.isArray(L.path)) { errors.push(`Линия ${L?.id ?? '<?>'} без корректного path`); continue; }
      if(L.path.length<2) errors.push(`Линия ${L.id} слишком короткая`);
    }
    // 3) у всех станций есть размещённая подпись
    const lblMissing = stations.filter(n=>!n || !pos[n] || !n.length).length; if(lblMissing>0) warns.push('Есть станции без подписи');
    // 4) нет NaN координат после оверрайдов
    for(const k of stations){ const p=pos[k]; if(Number.isNaN(p.x) || Number.isNaN(p.y)) errors.push(`NaN координаты у ${k}`); }

    // Доп. инварианты (регресс-тесты)
    const expectPath = (id:string, from:string, to:string, minLen:number)=>{
      const line = LINES.find(l=>l && l.id===id);
      if(!line) { errors.push(`Не найдена линия ${id}`); return; }
      if(line.path[0] !== from || line.path[line.path.length-1] !== to){
        errors.push(`Линия ${id} должна идти ${from}→${to}, сейчас ${line.path[0]}→${line.path[line.path.length-1]}`);
      }
      if(line.path.length < minLen){ errors.push(`Линия ${id} слишком короткая (ожидали ≥${minLen})`); }
    };
    expectPath('NSK-MSK-A','Новосибирск','Москва', 5);
    expectPath('NSK-MSK-B','Новосибирск','Москва', 5);
    expectPath('NSK-TLT','Новосибирск','Тольятти', 3);
    expectPath('MSK-RST','Москва','Владикавказ', 5);
    expectPath('MSK-VLG','Москва','Элиста', 2);
    expectPath('TLT-VLG','Тольятти','Элиста', 4);
    // Новые регресс-тесты для добавленных веток
    expectPath('SRG-MSK-IZH','Сургут','Москва', 6);
    expectPath('SRG-MSK-KIR','Сургут','Москва', 4);
    expectPath('MSK-MUR-SPB','Москва','Мурманск', 5);
    expectPath('MSK-MUR-YAR','Москва','Мурманск', 4);
    // Южные и крымские коридоры
    expectPath('RST-KRD-CRIMEA','Ростов-на-Дону','Севастополь', 4);
    expectPath('RST-MAR-CRIMEA','Ростов-на-Дону','Севастополь', 4);
        expectPath('VLG-ELI-GRZ-MAH','Элиста','Махачкала', 3);
    expectPath('VLG-ELI-AST-MAH','Элиста','Махачкала', 2);
    expectPath('VLG-ELI-CAUC','Элиста','Владикавказ', 4);
    // Новые проверки
    expectPath('MSK-ORSK','Москва','Орск', 5);
    expectPath('NRG-SRG','Новый Уренгой','Сургут', 2);
    expectPath('KHM-SRG','Ханты-Мансийск','Сургут', 2);
    expectPath('NVV-SRG','Нижневартовск','Сургут', 2);
    expectPath('NSK-GALT','Новосибирск','Горно-Алтайск', 4);
    expectPath('TOM-NOVK','Томск','Новокузнецк', 3);
    expectPath('KRS-KYZ','Красноярск','Кызыл', 3);
    expectPath('CHT-MAG','Чита','Магадан', 3);
    expectPath('NSK-VVO','Новосибирск','Владивосток', 8);
    expectPath('NSK-RST-SOUTH','Новосибирск','Ростов-на-Дону', 8);
    expectPath('SRT-VRN-RST','Саратов','Ростов-на-Дону', 3);
    expectPath('KRD-RST','Краснодар','Ростов-на-Дону', 2);
    // Доп. инвариант для восточного коридора: Свободный → Благовещенск → Биробиджан
    { const east = LINES.find(l=>l.id==='NSK-VVO'); if(east){ const p=east.path; const iS=p.indexOf('Свободный'), iB=p.indexOf('Благовещенск'), iBi=p.indexOf('Биробиджан'); if(iS<0||iB<0||iBi<0 || !(iS<iB && iB<iBi)) errors.push('NSK-VVO: Ожидается порядок Свободный→Благовещенск→Биробиджан'); } }

    return {errors, warns};
  },[pos]);

  return (
    <div className="w-full bg-white text-gray-900 min-h-screen">
      {/* Шапка */}
      <div className="bg-white border-b p-3 flex items-center gap-2">
        <h1 className="text-xl font-semibold text-gray-800">Карта веток по эталонным точкам</h1>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <button onClick={() => handleZoom(0.15)} className="w-8 h-8 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded text-lg">+</button>
          <button onClick={() => handleZoom(-0.15)} className="w-8 h-8 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded text-lg">−</button>
          <button onClick={resetView} className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded">Сброс вида</button>

          <label className="flex items-center gap-1 text-sm ml-2">
            <input type="checkbox" checked={editMode} onChange={e=>setEditMode(e.target.checked)} /> Режим правки
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={halfSnap} onChange={e=>setHalfSnap(e.target.checked)} /> Привязка GRID/2
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={showGrid} onChange={e=>setShowGrid(e.target.checked)} /> Показать сетку
          </label>

          <button onClick={exportJSON} className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-sm rounded">Экспорт</button>
          <button onClick={importJSON} className="px-3 py-1 bg-indigo-500 hover:bg-indigo-600 text-white text-sm rounded">Импорт</button>
          <button onClick={resetOverrides} className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded">Сброс правок</button>
          <div className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">Правок: {overridesCount}</div>
        </div>
      </div>

      <div className="flex">
        {/* Легенда */}
        <div className="w-80 bg-white border-r p-3 h-screen overflow-y-auto">
          <h3 className="font-bold text-base mb-2 text-gray-800">Ветки и стили</h3>
          <LegendControls LINES={LINES} visible={visible} toggleLine={toggleLine} soloLine={soloLine} showAll={showAll} hideAll={hideAll} invertAll={invertAll} />

          {/* Статус самодиагностики */}
          <div className="mt-4 border-t pt-3 text-xs">
            <div className="font-semibold text-gray-800 mb-1">Статус</div>
            {selfTest.errors.length>0 || selfTest.warns.length>0 ? (
              <div className="space-y-2">
                {selfTest.errors.length>0 && (
                  <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 space-y-1">
                    {selfTest.errors.map((e,i)=>(<div key={i}>• {e}</div>))}
                  </div>
                )}
                {selfTest.warns.length>0 && (
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-700 space-y-1">
                    {selfTest.warns.map((w,i)=>(<div key={i}>• {w}</div>))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-2 bg-green-50 border border-green-200 rounded text-green-700">✓ Проверки пройдены</div>
            )}
          </div>

          {/* Панель редактирования точки */}
          <PointEditor stations={stations} pos={pos} setPos={setPos} saveOverrides={saveOverrides} halfSnap={halfSnap} />
        </div>

        {/* Карта */}
        <div className="flex-1 overflow-hidden relative">
          <svg
            ref={svgRef}
            width={containerWidth}
            height={containerHeight}
            onWheel={handleWheel}
            onMouseDown={(e)=>{ /* сброс выбора при клике в пустоту */ if((e.target as HTMLElement).tagName==='svg') setSelected(null); handleMouseDown(e); }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: dragStation? 'grabbing' : (isDragging ? 'grabbing' : 'grab') }}
            className="select-none w-full h-screen"
          >
            <rect width="100%" height="100%" fill="#fafafa" />

            <g transform={`translate(${translateX}, ${translateY}) scale(${scale})`}>
              {/* Сетка */}
              {showGrid && <Grid />}

              {/* Линии маршрутов с разводкой параллельных */}
              <RouteLines lines={activeLines} pos={pos} allLines={LINES} />

              {/* Точки + подписи */}
              <StationsAndLabels stations={stations} pos={pos} labels={labels} editMode={editMode} selected={selected} setSelected={setSelected} />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

// === Вспомогательные подкомпоненты ===
function Grid(){
  const lines: JSX.Element[] = [];
  const minX = -800, maxX = 3200, minY = -200, maxY = 2000;
  for(let x=minX; x<=maxX; x+=GRID){ lines.push(<line key={`gx${x}`} x1={x} y1={minY} x2={x} y2={maxY} stroke="#e5e7eb" strokeWidth={1} />); }
  for(let y=minY; y<=maxY; y+=GRID){ lines.push(<line key={`gy${y}`} x1={minX} y1={y} x2={maxX} y2={y} stroke="#e5e7eb" strokeWidth={1} />); }
  return <g>{lines}</g>;
}

function RouteLines({lines, pos, allLines}:{lines:LineDef[]; pos:Record<string,XY>; allLines:LineDef[]}){
  const elems: JSX.Element[] = [];
  const offsetStep = 10;
  const grouped = new Map<string, Array<{a:string;b:string;lineId:string}>>();
  lines.flatMap(l=>buildEdges(l)).forEach(e=>{ const k=edgeKey(e.a,e.b); if(!grouped.has(k)) grouped.set(k,[]); grouped.get(k)!.push(e); });
  grouped.forEach((arr, k)=>{
    const A = pos[arr[0].a]; const B = pos[arr[0].b]; if(!A||!B) return;
    const {px,py} = unitPerp(A.x,A.y,B.x,B.y);
    const sorted = [...arr].sort((x,y)=>x.lineId.localeCompare(y.lineId));
    const n = sorted.length;
    sorted.forEach((e, idx)=>{
      const a = pos[e.a], b = pos[e.b]; if(!a||!b) return;
      const off = (idx - (n-1)/2) * offsetStep; const x1=a.x+px*off, y1=a.y+py*off; const x2=b.x+px*off, y2=b.y+py*off;
      const line = allLines.find(L=>L.id===e.lineId)!; const dash = line.style==='solid'? undefined : (line.style==='dashed'? '12 8' : '3 7');
      elems.push(<line key={`${k}_${e.lineId}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={line.color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} opacity={0.95} />);
    });
  });
  return <>{elems}</>;
}

function StationsAndLabels({stations, pos, labels, editMode, selected, setSelected}:{stations:string[]; pos:Record<string,XY>; labels:Record<string,any>; editMode:boolean; selected:string|null; setSelected:(s:string|null)=>void;}){
  return <>
    {stations.map(name=>{
      const p = pos[name];
      const isSelected = selected===name;
      return (
        <g key={name}>
          {isSelected && (<circle cx={p.x} cy={p.y} r={10} fill="none" stroke="#22c55e" strokeWidth={2} strokeDasharray="4 4" />)}
          <circle cx={p.x} cy={p.y} r={5} fill="#fff" stroke={isSelected? "#22c55e" : "#111"} strokeWidth={isSelected? 3 : 2} />
        </g>
      );
    })}

    {stations.map(name=>{
      const p = pos[name]; const lab = labels[name]; const {w,h} = estimateTextSize(name, 13);
      return (
        <g key={`${name}_lab`} onMouseDown={(e)=>{ if(!editMode) return; setSelected(name); e.stopPropagation(); }}>
          <rect x={lab.anchor==='start'? lab.x-4 : lab.x-w-4} y={lab.y-h-2} width={w+8} height={h+4} fill="rgba(255,255,255,0.95)" stroke="#e5e7eb" strokeWidth={1} rx={4} ry={4} />
          <text x={lab.x} y={lab.y} fontSize={13} textAnchor={lab.anchor} stroke="#fff" strokeWidth={3} paintOrder="stroke" fill="#111">{name}</text>
        </g>
      );
    })}
  </>;
}

function PointEditor({stations, pos, setPos, saveOverrides, halfSnap}:{stations:string[]; pos:Record<string,XY>; setPos:React.Dispatch<React.SetStateAction<Record<string,XY>>>; saveOverrides:(n:Record<string,XY>)=>void; halfSnap:boolean;}){
  const [selected, setSelected] = useState<string>('');
  return (
    <div className="mt-4 border-t pt-3">
      <h4 className="font-semibold text-gray-800 text-sm mb-2">Настройка точки</h4>
      <select value={selected} onChange={e=>setSelected(e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
        <option value="">— не выбрано —</option>
        {stations.sort().map(n=> (<option key={n} value={n}>{n}</option>))}
      </select>
      {selected && (
        <div className="mt-2 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <label className="w-16 text-gray-600">X</label>
            <input type="number" className="flex-1 border rounded px-2 py-1" value={pos[selected].x} onChange={e=>{ const v=Number(e.target.value); setPos(prev=>{ const next={...prev, [selected]:{...prev[selected], x:v}}; saveOverrides(next); return next; }); }} />
          </div>
          <div className="flex items-center gap-2">
            <label className="w-16 text-gray-600">Y</label>
            <input type="number" className="flex-1 border rounded px-2 py-1" value={pos[selected].y} onChange={e=>{ const v=Number(e.target.value); setPos(prev=>{ const next={...prev, [selected]:{...prev[selected], y:v}}; saveOverrides(next); return next; }); }} />
          </div>
          <div className="flex items-center gap-2">
            <button className="px-2 py-1 bg-gray-200 rounded" onClick={()=>{ const step = halfSnap? GRID/2: GRID; setPos(prev=>{ const p = prev[selected!]; const nx=Math.round(p.x/step)*step, ny=Math.round(p.y/step)*step; const next={...prev, [selected!]:{x:nx,y:ny}}; saveOverrides(next); return next; }); }}>Снап к сетке</button>
            <button className="px-2 py-1 bg-gray-200 rounded" onClick={()=>{ setPos(prev=>{ const next={...prev, [selected!]: {...BASE_POS[selected!]}}; saveOverrides(next); return next; }); }}>Сбросить к эталону</button>
          </div>
        </div>
      )}
    </div>
  );
}

function LegendControls({LINES, visible, toggleLine, soloLine, showAll, hideAll, invertAll}:{LINES:LineDef[]; visible:Record<string,boolean>; toggleLine:(id:string)=>void; soloLine:(id:string)=>void; showAll:()=>void; hideAll:()=>void; invertAll:()=>void;}){
  const activeCount = LINES.filter(l=> visible[l.id] !== false).length;
  return (
    <>
      <div className="flex items-center gap-2 text-xs mb-2">
        <button onClick={showAll} className="px-2 py-0.5 border rounded hover:bg-gray-50">Показать все</button>
        <button onClick={hideAll} className="px-2 py-0.5 border rounded hover:bg-gray-50">Скрыть все</button>
        <button onClick={invertAll} className="px-2 py-0.5 border rounded hover:bg-gray-50">Инвертировать</button>
        <div className="ml-auto text-gray-600">Видно: {activeCount}/{LINES.length}</div>
      </div>
      <div className="space-y-2">
        {LINES.map(l=> {
          const isOn = visible[l.id] !== false;
          return (
            <div key={l.id} className="flex items-center gap-2 text-sm" style={{opacity: isOn ? 1 : 0.4}}>
              <input type="checkbox" checked={isOn} onChange={()=>toggleLine(l.id)} />
              <div className="w-6 h-1.5" style={{background: l.style==='solid'? l.color : 'transparent', borderBottom: l.style==='solid'? 'none' : `2px ${l.style==='dashed'? 'dashed':'dotted'} ${l.color}`}} />
              <div className="font-medium text-xs" title={(l.path||[]).join(' → ')}>{l.name}</div>
              <button onClick={()=>soloLine(l.id)} className="ml-auto px-2 py-0.5 border rounded text-xs hover:bg-gray-50">Solo</button>
            </div>
          );
        })}
      </div>
    </>
  );
}
