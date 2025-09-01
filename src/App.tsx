import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { BASE_POS, segmentsFromStations, getSegment, type XY, buildEdgesFromPath, findPath } from "./models/network";

type LineStyle = 'solid' | 'dashed' | 'dotted';
type LineDef = { id: string; name: string; style: LineStyle; color: string; segments: string[] };

const GRID = 120;
const STORAGE_VISIBLE = 'metro_lines_visibility_v1';

const stations = Object.keys(BASE_POS);
const REMOVED_FROM_ROUTES = new Set<string>(["Калининград","Кострома"]);

// --- Геометрия и утилиты ---
function unitPerp(ax:number, ay:number, bx:number, by:number){
  const dx=bx-ax, dy=by-ay; const len=Math.hypot(dx,dy)||1; return {px:-dy/len, py:dx/len};
}
function edgeKey(a:string,b:string){ return a<b?`${a}__${b}`:`${b}__${a}`; }
function estimateTextSize(text:string, fontSize=13){
  const w=Math.ceil(text.length*fontSize*0.62), h=Math.ceil(fontSize*1.25); return {w,h};
}

type LabelPlacement = { x:number; y:number; anchor:'start'|'end' };
function placeLabels(names:string[], pos:Record<string,XY>, fontSize=13, scale=1){
  const placed:Record<string,LabelPlacement>={}; const rects:Array<{x:number;y:number;w:number;h:number}>=[];
  const entries = names.map(n=>[n,pos[n]] as const).sort((a,b)=>(a[1].y-b[1].y)||(a[1].x-b[1].x));
  const collide=(r:{x:number;y:number;w:number;h:number})=>rects.some(q=>!(r.x+r.w<q.x||q.x+q.w<r.x||r.y+r.h<q.y||q.y+q.h<r.y));
  const mk=(name:string,x:number,y:number,anchor:'start'|'end')=>{ const {w,h}=estimateTextSize(name,fontSize); const pad=3*scale; const rx=anchor==='start'?x:x-w*scale; const ry=y-h*scale+4*scale; return {rect:{x:rx-pad,y:ry-pad,w:w*scale+pad*2,h:h*scale+pad*2}}; };
  for(const [name,p] of entries){ let chosen:LabelPlacement|undefined; const base=20*scale; const radii=[base,base*1.4,base*1.8,base*2.2,base*2.6];
    for(const d of radii){ const cands:LabelPlacement[]=[{x:p.x+d,y:p.y-d*0.5,anchor:'start'},{x:p.x+d,y:p.y+d*0.8,anchor:'start'},{x:p.x-d,y:p.y+d*0.8,anchor:'end'},{x:p.x-d,y:p.y-d*0.5,anchor:'end'},{x:p.x,y:p.y-d*1.2,anchor:'start'},{x:p.x,y:p.y+d*1.2,anchor:'start'}];
      for(const c of cands){ const {rect}=mk(name,c.x,c.y,c.anchor); if(!collide(rect)){ rects.push(rect); chosen=c; break; } }
      if(chosen) break; }
    if(!chosen){ chosen={x:p.x+base*3.2,y:p.y+base*3.2,anchor:'start'}; const {rect}=mk(name,chosen.x,chosen.y,chosen.anchor); rects.push(rect); }
    placed[name]=chosen; }
  return placed;
}

const distinctColor = (i:number)=>`hsl(${(i*137.508)%360}, 72%, 45%)`;

function route(path:string[]):string[]{
  const out:string[]=[];
  for(const name of path){ if(!BASE_POS[name]) continue; if(REMOVED_FROM_ROUTES.has(name)) continue; if(out.length===0||out[out.length-1]!==name) out.push(name); }
  return out;
}


// --- Ветки ---
const RAW_LINES: Omit<LineDef,'color'>[] = [
  // Основные коридоры
  { id:'MSK-VLG', name:'Москва → Элиста (через Тамбов / Волгоград)', style:'solid', segments: segmentsFromStations(route(['Москва','Тамбов','Волгоград','Элиста']))},
  { id:'MSK-RST', name:'Москва → Владикавказ (через Воронеж / Ростов / Невинномысск / Минеральные Воды / Нальчик)', style:'solid', segments: segmentsFromStations(route(['Москва','Воронеж','Ростов-на-Дону','Невинномысск','Минеральные Воды','Нальчик','Владикавказ']))},
  { id:'MSK-ORSK', name:'Москва → Орск (через Рязань / Пензу / Тольятти / Оренбург)', style:'solid', segments: segmentsFromStations(route(['Москва','Рязань','Пенза','Тольятти','Оренбург','Орск']))},
  
  // Южные / Крым
  { id:'VLG-RST-PURPLE', name:'Волгоград → Ростов-на-Дону', style:'dashed', segments: segmentsFromStations(route(['Волгоград','Ростов-на-Дону']))}, 
  { id:'RST-MAR-CRIMEA-PINK', name:'Ростов-на-Дону → Мариуполь → Мелитополь → Симферополь → Севастополь', style:'dashed', segments: segmentsFromStations(route(['Ростов-на-Дону','Мариуполь','Мелитополь','Симферополь','Севастополь']))},
  { id:'RST-KRD-PURPLE', name:'Ростов-на-Дону → Краснодар', style:'dotted', segments: segmentsFromStations(route(['Ростов-на-Дону','Краснодар']))},
  { id:'MSK-RSTDN', name:'Москва → Ростов', style:'solid', segments: segmentsFromStations(route(['Москва','Воронеж','Ростов-на-Дону']))},
  { id:'RST-KRD', name:'Ростов-на-Дону → Краснодар', style:'solid', segments: segmentsFromStations(route(['Ростов-на-Дону','Краснодар']))},
  { id:'KRD-CRIMEA-PINK', name:'Краснодар → Керчь → Симферополь → Севастополь', style:'dotted', segments: segmentsFromStations(route(['Краснодар','Керчь','Симферополь','Севастополь']))},
  { id:'SRT-VRN-RST', name:'Саратов → Воронеж → Ростов-на-Дону', style:'dashed', segments: segmentsFromStations(route(['Саратов','Воронеж','Ростов-на-Дону']))},
  { id:'VLG-ELI-CAUC-PURPLE', name:'Волгоград → Элиста → Невинномысск → Минеральные Воды → Нальчик → Владикавказ', style:'solid', segments: segmentsFromStations(route(['Волгоград','Элиста','Невинномысск','Минеральные Воды','Нальчик','Владикавказ']))},
  { id:'VLG-ELI-GRZ-MAH', name:'Элиста → Будённовск → Грозный → Махачкала', style:'solid', segments: segmentsFromStations(route(['Элиста','Будённовск','Грозный','Махачкала']))},
  { id:'VLG-ELI-AST-MAH', name:'Элиста → Астрахань → Махачкала', style:'solid', segments: segmentsFromStations(route(['Элиста','Астрахань','Махачкала']))},
  { id:'VLG-ELI-GRZ-MAH-BLUE', name:'Элиста → Будённовск → Грозный → Махачкала', style:'solid', segments: segmentsFromStations(route(['Элиста','Будённовск','Грозный','Махачкала']))},
  { id:'VLG-ELI-AST-MAH-BLUE', name:'Элиста → Астрахань → Махачкала', style:'solid', segments: segmentsFromStations(route(['Элиста','Астрахань','Махачкала']))},
  // Красное продление на восток
  { id:'VLG-SRT-UFA', name:'Волгоград → Тольятти (через Саратов)', style:'solid', segments: segmentsFromStations(route(['Волгоград','Саратов','Тольятти']))},
  { id:'MSK-NCH-SALAD', name:'Москва → Набережные Челны (через Владимир / Нижний Новгород / Чебоксары / Казань)', style:'solid', segments: segmentsFromStations(route(['Москва','Владимир','Нижний Новгород','Чебоксары','Казань','Набережные Челны']))},
  { id:'OMSK-NCH-IZH', name:'Омск → Набережные Челны (через Тюмень / Екатеринбург)', style:'dashed', segments: segmentsFromStations(route(['Омск','Тюмень','Екатеринбург','Набережные Челны']))},
  { id:'OMSK-NCH-IZH-GRAY', name:'Омск → Уфа (через Тюмень / Екатеринбург)', style:'solid', segments: segmentsFromStations(route(['Омск','Тюмень','Екатеринбург','Набережные Челны','Уфа']))},
  { id:'OMSK-NCH-UFA', name:'Омск → Набережные Челны (через Курган / Челябинск / Уфа)', style:'dotted', segments: segmentsFromStations(route(['Омск','Курган','Челябинск','Уфа','Набережные Челны']))},
  { id:'OMSK-VVO-GREY', name:'Омск → Владивосток (серая)', style:'solid', segments: segmentsFromStations(route(['Омск','Кемерово','Красноярск','Иркутск','Улан-Удэ','Чита','Сковородино','Свободный','Благовещенск','Биробиджан','Хабаровск','Уссурийск','Владивосток']))},
  { id:'OMSK-VVO-SALAD', name:'Омск → Владивосток (салатовая)', style:'solid', segments: segmentsFromStations(route(['Омск','Кемерово','Красноярск','Иркутск','Улан-Удэ','Чита','Сковородино','Свободный','Благовещенск','Биробиджан','Хабаровск','Уссурийск','Владивосток']))},
  { id:'OMSK-VLG-GREY', name:'Омск → Волгоград (через Курган / Челябинск / Уфа / Тольятти / Саратов)', style:'solid', segments: segmentsFromStations(route(['Омск','Курган','Челябинск','Уфа','Тольятти','Саратов','Волгоград']))},
  // Тёмно-коричневый северный блок
  { id:'SRG-EKB', name:'Сургут → Екатеринбург (через Тюмень)', style:'solid', segments: segmentsFromStations(route(['Сургут','Тюмень','Екатеринбург']))},
  { id:'EKB-MSK-KIR', name:'Екатеринбург → Москва (через Пермь / Киров / Ярославль)', style:'dashed', segments: segmentsFromStations(route(['Екатеринбург','Пермь','Киров','Ярославль','Москва']))},
  { id:'EKB-MSK-IZH', name:'Екатеринбург → Москва (через Пермь / Ижевск / Казань / Чебоксары / Нижний Новгород / Владимир)', style:'dotted', segments: segmentsFromStations(route(['Екатеринбург','Пермь','Ижевск','Казань','Чебоксары','Нижний Новгород','Владимир','Москва']))},
  { id:'SYK-KIR-YAR-MSK', name:'Сыктывкар → Киров → Ярославль → Москва', style:'solid', segments: segmentsFromStations(route(['Сыктывкар','Киров','Ярославль','Москва']))},
  // Север
  { id:'MSK-MUR-SPB', name:'Москва → Мурманск (через СПб / Петрозаводск / Медвежьегорск)', style:'dashed', segments: segmentsFromStations(route(['Москва','Тверь','Великий Новгород','Санкт-Петербург','Петрозаводск','Медвежьегорск','Мурманск']))},
  { id:'MSK-MUR-YAR', name:'Москва → Мурманск (через Ярославль / Вологду / Медвежьегорск)', style:'dotted', segments: segmentsFromStations(route(['Москва','Ярославль','Вологда','Медвежьегорск','Мурманск']))},
  { id:'YOL-CHB-NNOV-VLA-MSK', name:'Йошкар-Ола → Чебоксары → Нижний Новгород → Владимир → Москва', style:'solid', segments: segmentsFromStations(route(['Йошкар-Ола','Чебоксары','Нижний Новгород','Владимир','Москва']))},
  { id:'MSK-VLA-NNOV-CHB-KZN-ULY-TLT', name:'Москва → Владимир → Нижний Новгород → Чебоксары → Казань → Ульяновск → Тольятти', style:'solid', segments: segmentsFromStations(route(['Москва','Владимир','Нижний Новгород','Чебоксары','Казань','Ульяновск','Тольятти']))},
  // Северные/Сибирские короткие связи
  { id:'NRG-SRG', name:'Новый Уренгой → Сургут', style:'solid', segments: segmentsFromStations(route(['Новый Уренгой','Сургут']))},
  { id:'KHM-SRG', name:'Ханты-Мансийск → Сургут', style:'solid', segments: segmentsFromStations(route(['Ханты-Мансийск','Сургут']))},
  { id:'NVV-SRG', name:'Нижневартовск → Сургут', style:'solid', segments: segmentsFromStations(route(['Нижневартовск','Сургут']))},
  { id:'NSK-GALT', name:'Новосибирск → Горно-Алтайск (через Барнаул / Бийск)', style:'solid', segments: segmentsFromStations(route(['Новосибирск','Барнаул','Бийск','Горно-Алтайск']))},
  { id:'TOM-NOVK', name:'Томск → Новокузнецк (через Кемерово)', style:'solid', segments: segmentsFromStations(route(['Томск','Кемерово','Новокузнецк']))},
  { id:'KRS-KYZ', name:'Красноярск → Кызыл (через Абакан)', style:'solid', segments: segmentsFromStations(route(['Красноярск','Абакан','Кызыл']))},
  { id:'CHT-MAG', name:'Сковородино → Магадан (через Якутск)', style:'solid', segments: segmentsFromStations(route(['Сковородино','Якутск','Магадан']))},
];

const RAW_LINES_CLEAN = RAW_LINES.filter(Boolean) as Omit<LineDef,'color'>[];

// Цвета
const COLOR_OVERRIDES: Record<string,string> = {
  'VLG-SRT-UFA': '#F40009',
  'MSK-ORSK': '#BDBDBD',
  'MSK-NCH-SALAD': '#7ED957',
  'OMSK-NCH-IZH': '#7ED957',
  'OMSK-NCH-UFA': '#7ED957',
  'OMSK-VVO-SALAD': '#7ED957',
  'MSK-RSTDN': '#CC5500',
  'RST-KRD': '#CC5500',
  'SYK-KIR-YAR-MSK': '#8B4513',
  'SRG-EKB': '#009A49',
  'EKB-MSK-KIR': '#009A49',
  'EKB-MSK-IZH': '#009A49',
  'NRG-SRG': '#009A49',
  'KHM-SRG': '#009A49',
  'NVV-SRG': '#009A49',

  'YOL-CHB-NNOV-VLA-MSK': '#8B4513',
  'MSK-VLA-NNOV-CHB-KZN-ULY-TLT': '#8B4513',
  'MSK-VLG': '#1A73E8',
  'VLG-ELI-GRZ-MAH-BLUE': '#1A73E8',
  'VLG-ELI-AST-MAH-BLUE': '#1A73E8',
  'OMSK-NCH-IZH-GRAY': '#7E57C2',
  
  'MSK-MUR-SPB': '#00B7FF',
  'MSK-MUR-YAR': '#00B7FF',

  'VLG-ELI-CAUC-PURPLE': '#F40009',
  'VLG-ELI-GRZ-MAH': '#F40009',
  'VLG-ELI-AST-MAH': '#F40009',

  'MSK-RST': '#FF8F1F',

  'SRT-VRN-RST': '#7E57C2',
  'VLG-RST-PURPLE': '#7E57C2',
  'RST-MAR-CRIMEA-PINK': '#30d5c8',
  'RST-KRD-PURPLE': '#7E57C2',
  'KRD-CRIMEA-PINK': '#30d5c8',
  'OMSK-VVO-GREY': '#7E57C2',
  'OMSK-VLG-GREY': '#7E57C2',
  'CHT-MAG': '#8B4513',
  'KRS-KYZ': '#8B4513',
  'TOM-NOVK': '#8B4513',
  'NSK-GALT': '#8B4513'
};

const LINES: LineDef[] = RAW_LINES_CLEAN.map((l,i)=>(
  {
    ...l,
    color: COLOR_OVERRIDES[l.id] ?? distinctColor(i)
  }
));

// === Коридоры (группировка линий) ===
type Corridor = { id:string; name:string; color?:string; lineIds:string[] };
const CORRIDORS: Corridor[] = [
  { id:'C_NORTH_GREEN', name:'Новый Уренгой → Москва (зелёный)', color:'#009A49', lineIds:['SRG-EKB','EKB-MSK-KIR','EKB-MSK-IZH','NRG-SRG','KHM-SRG','NVV-SRG'] },
  { id:'C_MURMANSK_ICE', name:'Москва → Мурманск (ледяной)', color:'#00B7FF', lineIds:['MSK-MUR-SPB','MSK-MUR-YAR'] },
  { id:'C_MSK_ELI_BLUE', name:'Москва → Махачкала(M6-синий)', color:'#1A73E8', lineIds:['MSK-VLG', 'VLG-ELI-GRZ-MAH-BLUE','VLG-ELI-AST-MAH-BLUE'] },
  { id:'C_EAST_RED', name:'Кавказ → Тольятти(красный)', color:'#F40009', lineIds:['VLG-ELI-CAUC-PURPLE','VLG-ELI-GRZ-MAH','VLG-ELI-AST-MAH','VLG-SRT-UFA'] },
  { id:'C_EAST_SALAD', name:'Москва → Владивосток (салатовый)', color:'#7ED957', lineIds:['MSK-NCH-SALAD','OMSK-NCH-IZH','OMSK-NCH-UFA','OMSK-VVO-SALAD'] },
  { id:'C_SIB_SHORTS', name:'Сибирские ответвления (коричневый)', color:'#8B4513', lineIds:['NSK-GALT','TOM-NOVK','KRS-KYZ','CHT-MAG'] },
  { id:'C_VOLGA_BROWN', name:'Поволжье (коричневый)', color:'#8B4513', lineIds:['YOL-CHB-NNOV-VLA-MSK','MSK-VLA-NNOV-CHB-KZN-ULY-TLT'] },
  { id:'C_SOUTH_GREY', name:'Крым → Владивосток(фиолетовый)', color:'#7E57C2', lineIds:['VLG-RST-PURPLE','RST-MAR-CRIMEA-PINK','RST-KRD-PURPLE','KRD-CRIMEA-PINK','SRT-VRN-RST','OMSK-VVO-GREY','OMSK-VLG-GREY','OMSK-NCH-IZH-GRAY'] }
];

function buildEdges(line: LineDef){ return line.segments.map(id=>{ const s=getSegment(id); return s?{a:s.from,b:s.to,lineId:line.id}:undefined; }).filter(Boolean) as Array<{a:string;b:string;lineId:string}>; }

export default function MetroBranches(){
  const [scale,setScale]=useState(0.6);
  const [translateX,setTranslateX]=useState(300);
  const [translateY,setTranslateY]=useState(150);
  const [isDragging,setIsDragging]=useState(false);

  const [visible,setVisible]=useState<Record<string,boolean>>(()=>{
    try{ const raw=localStorage.getItem(STORAGE_VISIBLE); if(raw) return JSON.parse(raw); }catch{}
    const v:Record<string,boolean>={}; for(const l of LINES) v[l.id]=true; return v;
  });
  useEffect(()=>{ try{ localStorage.setItem(STORAGE_VISIBLE, JSON.stringify(visible)); }catch{} },[visible]);
  const activeLines = useMemo(()=> LINES.filter(l=> visible[l.id]!==false), [visible]);
  const toggleLine = useCallback((id:string)=>{ setVisible(v=>({...v,[id]:!(v[id]!==false)})); },[]);
  const toggleCorridor = useCallback((cid:string)=>{
    const ids = CORRIDORS.find(c=>c.id===cid)?.lineIds ?? [];
    setVisible(v=>{
      const allOn = ids.every(id=>v[id]!==false);
      const next={...v};
      ids.forEach(id=>next[id]=!allOn);
      return next;
    });
  },[]);
  const soloCorridor = useCallback((cid:string)=>{
    const ids = CORRIDORS.find(c=>c.id===cid)?.lineIds ?? [];
    setVisible(v=>{
      const next:Record<string,boolean>={};
      for(const l of LINES){ next[l.id] = ids.includes(l.id); }
      return next;
    });
  },[]);

  const pos = BASE_POS;
  const svgRef = useRef<SVGSVGElement>(null);
  const labels = useMemo(()=>placeLabels(stations,pos,13,scale),[scale]);

  const [startStation, setStartStation] = useState<string>("");
  const [endStation, setEndStation] = useState<string>("");

  const pathInfo = useMemo(() => {
    if(!startStation || !endStation) return { path: [], length: 0 };
    return findPath(startStation, endStation);
  }, [startStation, endStation]);

  const pathEdges = useMemo(() => buildEdgesFromPath(pathInfo.path), [pathInfo.path]);

  const containerWidth=1200, containerHeight=800;

  const handleZoom = useCallback((delta:number, centerX?:number, centerY?:number)=>{
    const newScale=Math.max(0.2, Math.min(3, scale+delta)); if(newScale===scale) return;
    const rect=svgRef.current?.getBoundingClientRect();
    const zx=centerX ?? (rect?rect.width/2:containerWidth/2);
    const zy=centerY ?? (rect?rect.height/2:containerHeight/2);
    const k=newScale/scale;
    const nx=zx+(translateX-zx)*k; const ny=zy+(translateY-zy)*k;
    setScale(newScale); setTranslateX(nx); setTranslateY(ny);
  },[scale,translateX,translateY]);

  const [lastMouse,setLastMouse]=useState({x:0,y:0});
  const handleWheel = useCallback((e:React.WheelEvent)=>{ e.preventDefault(); const rect=svgRef.current?.getBoundingClientRect(); if(!rect) return; const mx=e.clientX-rect.left; const my=e.clientY-rect.top; const delta=e.deltaY>0?-0.1:0.1; handleZoom(delta,mx,my); },[handleZoom]);
  const handleMouseDown = useCallback((e:React.MouseEvent)=>{ setIsDragging(true); setLastMouse({x:e.clientX,y:e.clientY}); },[]);
  const handleMouseMove = useCallback((e:React.MouseEvent)=>{ if(!isDragging) return; const dx=e.clientX-lastMouse.x; const dy=e.clientY-lastMouse.y; setTranslateX(p=>p+dx); setTranslateY(p=>p+dy); setLastMouse({x:e.clientX,y:e.clientY}); },[isDragging,lastMouse]);
  const handleMouseUp = useCallback(()=>{ setIsDragging(false); },[]);
  const resetView = useCallback(()=>{ setScale(0.6); setTranslateX(300); setTranslateY(150); },[]);

  const selfTest = useMemo(() => {
    const errors:string[]=[];
    for(const l of LINES){
      if(l.segments.length<1) errors.push(`Линия ${l.id} слишком короткая`);
      for(const sid of l.segments){
        const seg = getSegment(sid);
        if(!seg){ errors.push(`Нет сегмента ${sid}`); continue; }
        if(!pos[seg.from]) errors.push(`Нет координат для ${seg.from}`);
        if(!pos[seg.to]) errors.push(`Нет координат для ${seg.to}`);
      }
    }
    return {errors};
  },[]);

  return (
    <div className="w-full bg-white text-gray-900 min-h-screen">
      <div className="bg-white border-b p-3 flex items-center gap-2">
        <h1 className="text-xl font-semibold text-gray-800">Карта коридоров</h1>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <button onClick={()=>handleZoom(0.15)} className="w-8 h-8 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded text-lg">+</button>
          <button onClick={()=>handleZoom(-0.15)} className="w-8 h-8 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded text-lg">−</button>
          <button onClick={resetView} className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded">Сброс вида</button>
        </div>
      </div>

      <div className="flex">
        <div className="w-80 bg-white border-r p-3 h-screen overflow-y-auto">
          <div className="mb-4">
            <h3 className="font-bold text-base mb-2 text-gray-800">Маршрут</h3>
            <div className="space-y-2 text-sm">
              <select value={startStation} onChange={e=>setStartStation(e.target.value)} className="w-full border p-1 rounded">
                <option value="">Начальная станция</option>
                {stations.map(s=>(<option key={s} value={s}>{s}</option>))}
              </select>
              <select value={endStation} onChange={e=>setEndStation(e.target.value)} className="w-full border p-1 rounded">
                <option value="">Конечная станция</option>
                {stations.map(s=>(<option key={s} value={s}>{s}</option>))}
              </select>
              {pathInfo.path.length>1 && (
                <div className="pt-1">Протяжённость: {Math.round(pathInfo.length)}</div>
              )}
            </div>
          </div>
          <h3 className="font-bold text-base mb-2 text-gray-800">Коридоры</h3>
          <LegendCorridors CORRIDORS={CORRIDORS} LINES={LINES} visible={visible} toggleCorridor={toggleCorridor} soloCorridor={soloCorridor} toggleLine={toggleLine} />
          <div className="mt-4 border-t pt-3 text-xs">
            <div className="font-semibold text-gray-800 mb-1">Статус</div>
            {selfTest.errors.length>0 ? (
              <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 space-y-1">
                {selfTest.errors.map((e,i)=>(<div key={i}>• {e}</div>))}
              </div>
            ) : (
              <div className="p-2 bg-green-50 border border-green-200 rounded text-green-700">✓ Проверки пройдены</div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative">
          <svg
            ref={svgRef}
            width={containerWidth}
            height={containerHeight}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{cursor:isDragging?'grabbing':'grab'}}
            className="select-none w-full h-screen"
          >
            <rect width="100%" height="100%" fill="#fafafa" />
            <g transform={`translate(${translateX}, ${translateY}) scale(${scale})`}>
              <Grid />
              <RouteLines lines={activeLines} pos={pos} allLines={LINES} />
              {pathEdges.map((e,i)=>{
                const a=pos[e.a], b=pos[e.b];
                if(!a||!b) return null;
                return <line key={`path_${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#000" strokeWidth={10} strokeLinecap="round" />;
              })}
              <StationsAndLabels stations={stations} pos={pos} labels={labels} />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

function Grid(){
  const lines:JSX.Element[]=[];
  const minX=-800,maxX=3200,minY=-200,maxY=2000;
  for(let x=minX;x<=maxX;x+=GRID){ lines.push(<line key={`gx${x}`} x1={x} y1={minY} x2={x} y2={maxY} stroke="#e5e7eb" strokeWidth={1} />); }
  for(let y=minY;y<=maxY;y+=GRID){ lines.push(<line key={`gy${y}`} x1={minX} y1={y} x2={maxX} y2={y} stroke="#e5e7eb" strokeWidth={1} />); }
  return <g>{lines}</g>;
}

function RouteLines({lines,pos,allLines}:{lines:LineDef[]; pos:Record<string,XY>; allLines:LineDef[]}){
  const elems:JSX.Element[]=[]; const offsetStep=10; const grouped=new Map<string,Array<{a:string;b:string;lineId:string}>>();
  lines.flatMap(l=>buildEdges(l)).forEach(e=>{ const k=edgeKey(e.a,e.b); if(!grouped.has(k)) grouped.set(k,[]); grouped.get(k)!.push(e); });
  grouped.forEach((arr,k)=>{
    const A=pos[arr[0].a]; const B=pos[arr[0].b]; if(!A||!B) return; const {px,py}=unitPerp(A.x,A.y,B.x,B.y); const sorted=[...arr].sort((x,y)=>x.lineId.localeCompare(y.lineId)); const n=sorted.length;
    sorted.forEach((e,idx)=>{ const a=pos[e.a], b=pos[e.b]; if(!a||!b) return; const off=(idx-(n-1)/2)*offsetStep; const x1=a.x+px*off, y1=a.y+py*off, x2=b.x+px*off, y2=b.y+py*off; const line=allLines.find(L=>L.id===e.lineId)!; const dash=line.style==='solid'?undefined:(line.style==='dashed'?'12 8':'3 7'); elems.push(<line key={`${k}_${e.lineId}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={line.color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} opacity={0.95} />); });
  });
  return <>{elems}</>;
}

function StationsAndLabels({stations,pos,labels}:{stations:string[]; pos:Record<string,XY>; labels:Record<string,any>}){
  return <>
    {stations.map(name=>{ const p=pos[name]; return (<g key={name}><circle cx={p.x} cy={p.y} r={5} fill="#fff" stroke="#111" strokeWidth={2} /></g>); })}
    {stations.map(name=>{ const p=pos[name]; const lab=labels[name]; const {w,h}=estimateTextSize(name,13); return (
      <g key={`${name}_lab`}>
        <rect x={lab.anchor==='start'?lab.x-4:lab.x-w-4} y={lab.y-h-2} width={w+8} height={h+4} fill="rgba(255,255,255,0.95)" stroke="#e5e7eb" strokeWidth={1} rx={4} ry={4} />
        <text x={lab.x} y={lab.y} fontSize={13} textAnchor={lab.anchor} stroke="#fff" strokeWidth={3} paintOrder="stroke" fill="#111">{name}</text>
      </g>); })}
  </>;
}

function LegendCorridors({CORRIDORS, LINES, visible, toggleCorridor, soloCorridor, toggleLine}:{CORRIDORS:{id:string;name:string;color?:string;lineIds:string[]}[]; LINES:LineDef[]; visible:Record<string,boolean>; toggleCorridor:(id:string)=>void; soloCorridor:(id:string)=>void; toggleLine:(id:string)=>void;}){
  return (
    <>
      <div className="flex items-center gap-2 text-xs mb-2">
        <div className="ml-auto text-gray-600">Коридоров: {CORRIDORS.length}</div>
      </div>
      <div className="space-y-3">
        {CORRIDORS.map(c=>{
          const ids = c.lineIds.filter(id => LINES.some(l=>l.id===id));
          const onCount = ids.filter(id => visible[id] !== false).length;
          const allOn = onCount===ids.length && ids.length>0;
          const someOn = onCount>0 && onCount<ids.length;
          return (
            <div key={c.id} className="border rounded p-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={allOn} ref={el=>{ if(el) (el as HTMLInputElement).indeterminate = someOn; }} onChange={()=>toggleCorridor(c.id)} />
                <div className="w-3 h-3 rounded" style={{background:c.color ?? '#999'}} />
                <div className="font-semibold text-xs">{c.name}</div>
                <div className="ml-auto text-xs text-gray-600">{onCount}/{ids.length}</div>
                <button onClick={()=>soloCorridor(c.id)} className="ml-2 px-2 py-0.5 border rounded text-xs hover:bg-gray-50">Solo</button>
              </div>
              <div className="mt-2 space-y-1">
                {ids.map(id=>{
                  const l = LINES.find(x=>x.id===id)!;
                  const isOn = visible[id] !== false;
                  return (
                    <div key={id} className="flex items-center gap-2 text-xs" style={{opacity:isOn?1:0.4}}>
                      <input type="checkbox" checked={isOn} onChange={()=>toggleLine(id)} />
                      <div className="w-6 h-0 border-b-4" style={{borderColor:l.color, borderBottomStyle:l.style==='solid'?'solid':(l.style==='dashed'?'dashed':'dotted')}} />
                      <div title={l.name}>{l.name}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
