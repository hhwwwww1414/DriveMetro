import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";

type XY = { x:number; y:number };
type LineStyle = 'solid' | 'dashed' | 'dotted';
type LineDef = { id: string; name: string; style: LineStyle; color: string; path: string[] };

const GRID = 120;
const STORAGE_VISIBLE = 'metro_lines_visibility_v1';

// --- Базовые координаты станций ---
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

function route(path:string[]):string[]{
  const out:string[]=[];
  for(const name of path){ if(!BASE_POS[name]) continue; if(REMOVED_FROM_ROUTES.has(name)) continue; if(out.length===0||out[out.length-1]!==name) out.push(name); }
  return out;
}

function buildEdgesFromPath(path:string[]):Array<{a:string;b:string}>{
  const edges:Array<{a:string;b:string}>=[];
  for(let i=0;i<path.length-1;i++){ const a=path[i], b=path[i+1]; if(a!==b) edges.push({a,b}); }
  return edges;
}

// --- Коридоры ---
type Corridor = {
  id: string;
  name: string;
  color: string;
  trunk: string[];
  variants: { id:string; name:string; style:LineStyle; path:string[] }[];
  feeders?: { id:string; name:string; path:string[]; style?:LineStyle }[];
};

function compileCorridorsToLines(corridors:Corridor[]){
  const lines:LineDef[]=[]; const groups:Record<string,string[]>={};
  corridors.forEach(c=>{
    const ids:string[]=[];
    if(c.trunk.length>=2){ const id=`${c.id}-trunk`; lines.push({id,name:c.name,style:'solid',color:c.color,path:route(c.trunk)}); ids.push(id); }
    c.variants.forEach(v=>{ const id=`${c.id}-var-${v.id}`; lines.push({id,name:v.name,style:v.style,color:c.color,path:route(v.path)}); ids.push(id); });
    c.feeders?.forEach(f=>{ const id=`${c.id}-fd-${f.id}`; lines.push({id,name:f.name,style:f.style??'solid',color:c.color,path:route(f.path)}); ids.push(id); });
    groups[c.id]=ids;
  });
  return {lines, groups};
}

const CORRIDORS:Corridor[]=[
  {
    id:'north-gas',
    name:'Сургут → Москва',
    color:'#009A49',
    trunk:['Сургут','Тюмень','Екатеринбург','Пермь'],
    variants:[
      {id:'kir',name:'через Киров',style:'dashed',path:['Пермь','Киров','Ярославль','Москва']},
      {id:'kaz',name:'через Казань',style:'dotted',path:['Пермь','Ижевск','Казань','Чебоксары','Нижний Новгород','Владимир','Москва']},
    ],
    feeders:[
      {id:'nurg',name:'Новый Уренгой → Сургут',path:['Новый Уренгой','Сургут']},
      {id:'khm',name:'Ханты-Мансийск → Сургут',path:['Ханты-Мансийск','Сургут']},
      {id:'nvv',name:'Нижневартовск → Сургут',path:['Нижневартовск','Сургут']},
    ]
  },
  {
    id:'north',
    name:'Москва → Мурманск',
    color:'#00B7FF',
    trunk:['Медвежьегорск','Мурманск'],
    variants:[
      {id:'spb',name:'через Санкт-Петербург',style:'dashed',path:['Москва','Тверь','Великий Новгород','Санкт-Петербург','Петрозаводск','Медвежьегорск']},
      {id:'yar',name:'через Ярославль',style:'dotted',path:['Москва','Ярославль','Вологда','Медвежьегорск']},
    ]
  },
  {
    id:'elista',
    name:'Москва → Элиста',
    color:'#F40009',
    trunk:['Москва','Тамбов','Волгоград','Элиста'],
    variants:[
      {id:'vlk',name:'на Владикавказ',style:'solid',path:['Элиста','Невинномысск','Минеральные Воды','Нальчик','Владикавказ']},
      {id:'grz',name:'через Будённовск',style:'solid',path:['Элиста','Будённовск','Грозный','Махачкала']},
      {id:'ast',name:'через Астрахань',style:'solid',path:['Элиста','Астрахань','Махачкала']},
    ]
  },
  {
    id:'east',
    name:'Омск → Владивосток',
    color:'#7ED957',
    trunk:['Омск','Кемерово','Красноярск','Иркутск','Улан-Удэ','Чита','Сковородино','Свободный','Благовещенск','Биробиджан','Хабаровск','Уссурийск','Владивосток'],
    variants:[],
  },
  {
    id:'south-coast',
    name:'Ростов → Крым',
    color:'#BDBDBD',
    trunk:['Симферополь','Севастополь'],
    variants:[
      {id:'mariupol',name:'через Мариуполь',style:'dashed',path:['Волгоград','Ростов-на-Дону','Мариуполь','Мелитополь','Симферополь']},
      {id:'krasnodar',name:'через Краснодар',style:'dotted',path:['Ростов-на-Дону','Краснодар','Керчь','Симферополь']},
    ],
    feeders:[
      {id:'vlg-rst',name:'Волгоград → Ростов',path:['Волгоград','Ростов-на-Дону']},
      {id:'srt-vrn-rst',name:'Саратов → Ростов',style:'dashed',path:['Саратов','Воронеж','Ростов-на-Дону']},
    ]
  },
  {
    id:'siberia',
    name:'Сибирские ответвления',
    color:'#8B4513',
    trunk:[],
    variants:[
      {id:'nsk-galt',name:'Новосибирск → Горно-Алтайск',style:'solid',path:['Новосибирск','Барнаул','Бийск','Горно-Алтайск']},
      {id:'tom-novk',name:'Томск → Новокузнецк',style:'solid',path:['Томск','Кемерово','Новокузнецк']},
      {id:'krs-kyz',name:'Красноярск → Кызыл',style:'solid',path:['Красноярск','Абакан','Кызыл']},
      {id:'cht-mag',name:'Сковородино → Магадан',style:'solid',path:['Сковородино','Якутск','Магадан']},
    ]
  }
];

const {lines:LINES, groups:CORRIDOR_GROUPS} = compileCorridorsToLines(CORRIDORS);

function buildEdges(line:LineDef){ return buildEdgesFromPath(line.path).map(e=>({ ...e, lineId: line.id })); }

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
    setVisible(v=>{ const ids=CORRIDOR_GROUPS[cid]; const allOn=ids.every(id=>v[id]!==false); const next={...v}; ids.forEach(id=>next[id]=!allOn); return next; });
  },[]);
  const showAll = useCallback(()=>{ const v:Record<string,boolean>={}; for(const l of LINES) v[l.id]=true; setVisible(v); },[]);
  const hideAll = useCallback(()=>{ const v:Record<string,boolean>={}; for(const l of LINES) v[l.id]=false; setVisible(v); },[]);
  const invertAll = useCallback(()=>{ const v:Record<string,boolean>={}; for(const l of LINES) v[l.id]=!(visible[l.id]!==false); setVisible(v); },[visible]);

  const pos = BASE_POS;
  const svgRef = useRef<SVGSVGElement>(null);
  const labels = useMemo(()=>placeLabels(stations,pos,13,scale),[scale]);

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

  const selfTest = useMemo(()=>{
    const errors:string[]=[];
    for(const l of LINES){ if(l.path.length<2) errors.push(`Линия ${l.id} слишком короткая`); for(const n of l.path){ if(!pos[n]) errors.push(`Нет координат для ${n}`); }}
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
          <h3 className="font-bold text-base mb-2 text-gray-800">Коридоры</h3>
          <CorridorLegend corridors={CORRIDORS} groups={CORRIDOR_GROUPS} visible={visible} toggleLine={toggleLine} toggleCorridor={toggleCorridor} showAll={showAll} hideAll={hideAll} invertAll={invertAll} />
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

function CorridorLegend({corridors,groups,visible,toggleLine,toggleCorridor,showAll,hideAll,invertAll}:{corridors:Corridor[]; groups:Record<string,string[]>; visible:Record<string,boolean>; toggleLine:(id:string)=>void; toggleCorridor:(id:string)=>void; showAll:()=>void; hideAll:()=>void; invertAll:()=>void;}){
  const activeCount = Object.keys(visible).filter(id=>visible[id]!==false).length;
  return (<>
    <div className="flex items-center gap-2 text-xs mb-2">
      <button onClick={showAll} className="px-2 py-0.5 border rounded hover:bg-gray-50">Показать все</button>
      <button onClick={hideAll} className="px-2 py-0.5 border rounded hover:bg-gray-50">Скрыть все</button>
      <button onClick={invertAll} className="px-2 py-0.5 border rounded hover:bg-gray-50">Инвертировать</button>
      <div className="ml-auto text-gray-600">Видно: {activeCount}/{Object.keys(visible).length}</div>
    </div>
    <div className="space-y-3">
      {corridors.map(c=>{
        const ids=groups[c.id]; const allOn=ids.every(id=>visible[id]!==false); const someOn=ids.some(id=>visible[id]!==false);
        return (
          <div key={c.id} className="text-sm">
            <div className="flex items-center gap-2" style={{opacity: someOn?1:0.4}}>
              <input type="checkbox" checked={allOn} ref={el=>{if(el) el.indeterminate=!allOn && someOn;}} onChange={()=>toggleCorridor(c.id)} />
              <div className="w-4 h-4" style={{background:c.color}} />
              <div className="font-medium">{c.name}{c.variants.length>0?` (${c.variants.length} вариант${c.variants.length>1?'ов':''})`:''}</div>
            </div>
            <div className="ml-6 mt-1 space-y-1">
              {c.trunk.length>=2 && (
                <div className="flex items-center gap-2" style={{opacity:visible[`${c.id}-trunk`]!==false?1:0.4}}>
                  <input type="checkbox" checked={visible[`${c.id}-trunk`]!==false} onChange={()=>toggleLine(`${c.id}-trunk`)} />
                  <div className="w-8 h-0 border-b-4" style={{borderColor:c.color,borderBottomStyle:'solid'}} />
                  <div className="text-xs">Ствол</div>
                </div>
              )}
              {c.variants.map(v=> (
                <div key={v.id} className="flex items-center gap-2" style={{opacity:visible[`${c.id}-var-${v.id}`]!==false?1:0.4}}>
                  <input type="checkbox" checked={visible[`${c.id}-var-${v.id}`]!==false} onChange={()=>toggleLine(`${c.id}-var-${v.id}`)} />
                  <div className="w-8 h-0 border-b-4" style={{borderColor:c.color,borderBottomStyle:v.style==='solid'?'solid':(v.style==='dashed'?'dashed':'dotted')}} />
                  <div className="text-xs" title={v.path.join(' → ')}>{v.name}</div>
                </div>
              ))}
              {c.feeders?.map(f=> (
                <div key={f.id} className="flex items-center gap-2" style={{opacity:visible[`${c.id}-fd-${f.id}`]!==false?1:0.4}}>
                  <input type="checkbox" checked={visible[`${c.id}-fd-${f.id}`]!==false} onChange={()=>toggleLine(`${c.id}-fd-${f.id}`)} />
                  <div className="w-8 h-0 border-b-4" style={{borderColor:c.color,borderBottomStyle:f.style==='dashed'?'dashed':(f.style==='dotted'?'dotted':'solid')}} />
                  <div className="text-xs" title={f.path.join(' → ')}>{f.name}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  </>);
}

