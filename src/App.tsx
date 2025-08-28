import React, { useMemo, useState, useRef, useCallback } from "react";

// ==========================
// ПОЛНАЯ ИНТЕРАКТИВНАЯ КАРТА МАРШРУТОВ РОССИИ
// - Все старые маршруты (Новосибирск-Москва и Новосибирск-Тольятти)
// - Новые маршруты (Москва-Мурманск через СПб и через Ярославль)
// - Исправленный маршрут Москва-Будённовск (через Элисту, не Астрахань)
// - Полная интерактивность: зум, панорамирование, навигация
// - Строго 90°/45° углы, параллельные линии для общих сегментов
// ==========================

type LineDef = { id: string; name: string; color: string; stations: string[] };
type Move = 'L90'|'R90'|'U90'|'D90'|'UL45'|'UR45'|'DL45'|'DR45';

const GRID = 120; // базовый шаг в пикселях
const VEC: Record<Move,[number,number]> = {
  L90:[-GRID,0], R90:[GRID,0], U90:[0,-GRID], D90:[0,GRID],
  UL45:[-GRID,-GRID], UR45:[GRID,-GRID], DL45:[-GRID,GRID], DR45:[GRID,GRID]
};

// === СТАРЫЕ МАРШРУТЫ (Новосибирск-Москва и Новосибирск-Тольятти) ===
const NSK_MSK_BLUE_STATIONS = [
  "Новосибирск","Омск","Тюмень","Екатеринбург","Набережные Челны","Казань","Чебоксары","Нижний Новгород","Владимир","Москва"
];
const NSK_MSK_BLUE_MOVES: Move[] = ['L90','UL45','L90','DL45','L90','L90','L90','L90','L90'];

const NSK_MSK_PINK_STATIONS = [
  "Новосибирск","Омск","Курган","Челябинск","Уфа","Набережные Челны","Казань","Чебоксары","Нижний Новгород","Владимир","Москва"
];
const NSK_MSK_PINK_MOVES: Move[] = ['L90','DL45','L90','L90','UL45','L90','L90','L90','L90','L90'];

const NSK_TLT_STATIONS = [
  "Новосибирск","Омск","Курган","Челябинск","Уфа","Тольятти"
];
const NSK_TLT_MOVES: Move[] = ['L90','DL45','L90','L90','DL45'];

// === НОВЫЕ МАРШРУТЫ ===
// Москва → Мурманск (через СПб, Петрозаводск, Медвежьегорск)
const MSK_MUR_SPB_STATIONS = ["Москва", "Санкт-Петербург", "Петрозаводск", "Медвежьегорск", "Мурманск"];
const MSK_MUR_SPB_MOVES: Move[] = ['UL45', 'U90', 'UR45', 'U90'];

// Москва → Мурманск (через Ярославль, Вологда, Медвежьегорск)
const MSK_MUR_YAR_STATIONS = ["Москва", "Ярославль", "Вологда", "Медвежьегорск", "Мурманск"];
const MSK_MUR_YAR_MOVES: Move[] = ['UR45', 'U90', 'UL45', 'U90'];

// Москва → Ростов-на-Дону (через Воронеж)
const MSK_RST_STATIONS = ["Москва", "Воронеж", "Ростов-на-Дону"];
const MSK_RST_MOVES: Move[] = ['D90', 'D90'];

// Москва → Будённовск (ИСПРАВЛЕНО: через Элисту, а не Астрахань)
const MSK_BUD_STATIONS = ["Москва", "Тамбов", "Волгоград", "Элиста", "Будённовск"];
const MSK_BUD_MOVES: Move[] = ['DR45', 'D90', 'D90', 'D90']; // Элиста → Будённовск (вниз)

// Дополнительная ветка: Элиста → Астрахань (для полноты карты)
const ELISTA_AST_STATIONS = ["Элиста", "Астрахань"];
const ELISTA_AST_MOVES: Move[] = ['R90']; // Элиста → Астрахань (вправо)

const LINES: LineDef[] = [
  // Старые маршруты
  { id: 'NSK-MSK-1', name: 'Новосибирск→Москва (через Тюмень/Екб)', color: '#1f77b4', stations: NSK_MSK_BLUE_STATIONS },
  { id: 'NSK-MSK-2', name: 'Новосибирск→Москва (через Курган/Челябинск)', color: '#d62728', stations: NSK_MSK_PINK_STATIONS },
  { id: 'NSK-TLT', name: 'Новосибирск→Тольятти', color: '#ff7f0e', stations: NSK_TLT_STATIONS },
  
  // Новые маршруты из Москвы
  { id: 'MSK-MUR-SPB', name: 'Москва→Мурманск (через СПб)', color: '#2ca02c', stations: MSK_MUR_SPB_STATIONS },
  { id: 'MSK-MUR-YAR', name: 'Москва→Мурманск (через Ярославль)', color: '#9467bd', stations: MSK_MUR_YAR_STATIONS },
  { id: 'MSK-RST', name: 'Москва→Ростов-на-Дону', color: '#8c564b', stations: MSK_RST_STATIONS },
  { id: 'MSK-BUD', name: 'Москва→Будённовск (через Элисту)', color: '#e377c2', stations: MSK_BUD_STATIONS },
  { id: 'ELISTA-AST', name: 'Элиста→Астрахань', color: '#17becf', stations: ELISTA_AST_STATIONS },
];

const MOVES_BY_ID: Record<string, Move[]> = {
  'NSK-MSK-1': NSK_MSK_BLUE_MOVES,
  'NSK-MSK-2': NSK_MSK_PINK_MOVES,
  'NSK-TLT': NSK_TLT_MOVES,
  'MSK-MUR-SPB': MSK_MUR_SPB_MOVES,
  'MSK-MUR-YAR': MSK_MUR_YAR_MOVES,
  'MSK-RST': MSK_RST_MOVES,
  'MSK-BUD': MSK_BUD_MOVES,
  'ELISTA-AST': ELISTA_AST_MOVES,
};

const HUBS = new Set([
  "Москва", "Новосибирск", "Тольятти", "Казань", "Санкт-Петербург", 
  "Мурманск", "Ростов-на-Дону", "Астрахань", "Медвежьегорск"
]);

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

    // Определяем начальную точку для каждого маршрута
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

// Самодиагностика
function runSelfTests(pos: Record<string,{x:number;y:number}>){
  const messages: string[] = [];
  const errors: string[] = [];
  
  for(const l of LINES){
    const mv = MOVES_BY_ID[l.id];
    if(!mv){
      errors.push(`Нет последовательности ходов для линии ${l.id}`);
      continue;
    }
    if(mv.length !== l.stations.length - 1){
      errors.push(`Длина moves (${mv.length}) не равна stations-1 (${l.stations.length-1}) для ${l.id}`);
    }
    mv.forEach((m,i)=>{
      if(!(m in VEC)) errors.push(`Неизвестный ход "${m}" в ${l.id} @${i}`);
    });
    messages.push(`✓ ${l.name}: ${l.stations.length} станций, ${mv.length} ходов`);
  }

  // Проверка общих участков
  const allEdges = LINES.flatMap(l=>buildEdges(l, pos));
  const groups = new Map<string, string[]>();
  allEdges.forEach(e=>{
    const k=edgeKey(e.a,e.b);
    if(!groups.has(k)) groups.set(k,[]);
    groups.get(k)!.push(e.lineId);
  });

  const sharedEdges = Array.from(groups.entries()).filter(([,arr])=>arr.length>1);
  if(sharedEdges.length > 0){
    messages.push(`✓ Найдено ${sharedEdges.length} общих участков с параллельными линиями`);
  }

  return {messages, errors};
}

export default function CompleteMetroMap(){
  const [scale, setScale] = useState(0.8);
  const [translateX, setTranslateX] = useState(200);
  const [translateY, setTranslateY] = useState(100);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState({x:0, y:0});
  const [showLegend, setShowLegend] = useState(true);
  
  const svgRef = useRef<SVGSVGElement>(null);
  const containerWidth = 1600, containerHeight = 1000;
  
  // Определяем начальные позиции для разных маршрутов
  const origins = {
    'Новосибирск': {x: 1200, y: 500}, // для старых маршрутов
    'Москва': {x: 600, y: 400},       // для новых маршрутов из Москвы
    'Элиста': {x: 0, y: 0},          // будет вычислена автоматически
    'default': {x: 600, y: 400}
  };
  
  const pos = useMemo(()=>computePositions(LINES, MOVES_BY_ID, origins), []);
  const stations = useMemo(()=>Array.from(new Set(LINES.flatMap(l=>l.stations))), []);
  const labels = useMemo(()=>placeLabels(stations, pos, 14, scale), [pos, scale]);

  // Управление зумом
  const handleZoom = useCallback((delta: number, centerX?: number, centerY?: number) => {
    const newScale = Math.max(0.3, Math.min(4, scale + delta));
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

  // Обработка колесика мыши
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    
    handleZoom(delta, mouseX, mouseY);
  }, [handleZoom]);

  // Обработка перетаскивания
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

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Сброс вида
  const resetView = useCallback(() => {
    setScale(0.8);
    setTranslateX(200);
    setTranslateY(100);
  }, []);

  // Самодиагностика
  const {messages, errors} = runSelfTests(pos);

  return (
    <div className="w-full min-h-screen bg-gray-50 text-gray-900">
      {/* Шапка */}
      <div className="bg-white shadow-sm border-b p-4">
        <div className="flex justify-between items-start max-w-full">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-blue-900 mb-2">
              Интерактивная карта железнодорожных маршрутов России
            </h1>
            <p className="text-sm text-gray-600 mb-2">
              Полная схема всех маршрутов со строгими углами 90°/45°. Используйте мышь для навигации: колесико для зума, перетаскивание для движения по карте.
            </p>
            
            {/* Панель управления */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => handleZoom(0.2)} 
                  className="w-9 h-9 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg transition-colors"
                >
                  +
                </button>
                <button 
                  onClick={() => handleZoom(-0.2)} 
                  className="w-9 h-9 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg transition-colors"
                >
                  −
                </button>
              </div>
              
              <button 
                onClick={resetView}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Сброс вида
              </button>
              
              <button 
                onClick={() => setShowLegend(!showLegend)}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {showLegend ? 'Скрыть легенду' : 'Показать легенду'}
              </button>
              
              <div className="text-sm text-gray-600 bg-gray-100 px-3 py-2 rounded-lg">
                Масштаб: <span className="font-medium">{Math.round(scale * 100)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Легенда */}
        {showLegend && (
          <div className="w-80 bg-white shadow-sm border-r p-4 h-screen overflow-y-auto">
            <h3 className="font-bold text-lg mb-4 text-gray-800">Маршруты</h3>
            
            <div className="space-y-3">
              <div className="text-sm font-semibold text-blue-800 border-b pb-1">Старые маршруты:</div>
              {LINES.slice(0, 3).map(line => (
                <div key={line.id} className="flex items-start gap-3 text-sm">
                  <div 
                    className="w-4 h-3 rounded mt-1 flex-shrink-0" 
                    style={{backgroundColor: line.color}}
                  ></div>
                  <div>
                    <div className="font-medium">{line.name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {line.stations.join(' → ')}
                    </div>
                  </div>
                </div>
              ))}
              
              <div className="text-sm font-semibold text-green-800 border-b pb-1 mt-6">Новые маршруты:</div>
              {LINES.slice(3).map(line => (
                <div key={line.id} className="flex items-start gap-3 text-sm">
                  <div 
                    className="w-4 h-3 rounded mt-1 flex-shrink-0" 
                    style={{backgroundColor: line.color}}
                  ></div>
                  <div>
                    <div className="font-medium">{line.name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {line.stations.join(' → ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Самодиагностика */}
            <div className="mt-6">
              <h4 className="font-semibold text-gray-700 mb-3">Статус системы</h4>
              {errors.length > 0 ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
                  <div className="font-semibold text-red-800 mb-2">Ошибки:</div>
                  <ul className="space-y-1 text-red-700">
                    {errors.map((e,i)=>(<li key={i}>• {e}</li>))}
                  </ul>
                </div>
              ) : (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                  <div className="font-semibold text-green-800 mb-2">Все проверки пройдены:</div>
                  <ul className="space-y-1 text-green-700">
                    {messages.slice(0, 5).map((m,i)=>(<li key={i}>• {m}</li>))}
                    {messages.length > 5 && <li className="text-green-600">• и ещё {messages.length - 5} проверок...</li>}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Основная карта */}
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
            {/* Фон с сеткой */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f0f0f0" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            <g transform={`translate(${translateX}, ${translateY}) scale(${scale})`}>
              {/* Линии маршрутов (с параллельными сегментами для общих участков) */}
              {(() => {
                const allEdges = LINES.flatMap(l => buildEdges(l, pos));
                const groups = new Map<string, Array<{a:string;b:string;lineId:string}>>();
                
                allEdges.forEach(e=>{
                  const k = edgeKey(e.a,e.b);
                  if(!groups.has(k)) groups.set(k,[]);
                  groups.get(k)!.push(e);
                });

                const offsetStep = 16; // расстояние между параллельными линиями
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
                    const color = LINES.find(l=>l.id===e.lineId)!.color;
                    
                    elems.push(
                      <line 
                        key={`${k}_${e.lineId}`} 
                        x1={x1} y1={y1} x2={x2} y2={y2} 
                        stroke={color} 
                        strokeWidth={10} 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        opacity={0.9}
                      />
                    );
                  });
                });
                return elems;
              })()}

              {/* Станции */}
              {stations.map(name=>{
                const p = pos[name];
                const isHub = HUBS.has(name);
                return (
                  <circle 
                    key={name} 
                    cx={p.x} cy={p.y} 
                    r={isHub ? 8 : 6} 
                    fill="#fff" 
                    stroke={isHub ? "#1e40af" : "#374151"} 
                    strokeWidth={isHub ? 3 : 2}
                  />
                );
              })}

              {/* Подписи станций */}
              {stations.map(name=>{
                const p = pos[name];
                const lab = labels[name];
                const isHub = HUBS.has(name);
                const {w,h} = estimateTextSize(name, 15);
                
                return (
                  <g key={`${name}_lab`}>
                    {isHub && (
                      <rect 
                        x={lab.anchor==='start'? lab.x-6 : lab.x-w-6} 
                        y={lab.y-h-3} 
                        width={w+12} 
                        height={h+6} 
                        fill="rgba(255,255,255,0.95)" 
                        stroke="#3b82f6" 
                        strokeWidth={2} 
                        rx={6} 
                        ry={6}
                        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
                      />
                    )}
                    <text 
                      x={lab.x} 
                      y={lab.y} 
                      fontSize={15} 
                      textAnchor={lab.anchor} 
                      stroke="#fff" 
                      strokeWidth={4} 
                      paintOrder="stroke" 
                      fill={isHub ? "#1e40af" : "#111"}
                      fontWeight={isHub ? 'bold' : 'normal'}
                      style={{filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))"}}
                    >
                      {name}
                    </text>
                  </g>
                );
              })}

              {/* Дополнительные элементы для красоты */}
              {/* Стрелки направления на длинных участках */}
              {LINES.map(line => {
                const edges = buildEdges(line, pos);
                return edges.map((edge, idx) => {
                  const A = pos[edge.a], B = pos[edge.b];
                  const midX = (A.x + B.x) / 2;
                  const midY = (A.y + B.y) / 2;
                  const dx = B.x - A.x;
                  const dy = B.y - A.y;
                  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                  
                  // Показываем стрелки только на длинных участках
                  const distance = Math.hypot(dx, dy);
                  if (distance < GRID * 1.5) return null;
                  
                  return (
                    <g key={`arrow_${edge.lineId}_${idx}`} transform={`translate(${midX}, ${midY}) rotate(${angle})`}>
                      <polygon 
                        points="-8,-4 8,0 -8,4" 
                        fill={line.color} 
                        opacity={0.7}
                        stroke="#fff"
                        strokeWidth={1}
                      />
                    </g>
                  );
                }).filter(Boolean);
              })}
            </g>
          </svg>

          {/* Мини-карта в углу */}
          <div className="absolute top-4 right-4 w-48 h-32 bg-white border-2 border-gray-300 rounded-lg shadow-lg overflow-hidden">
            <svg width="100%" height="100%" viewBox="0 0 1600 1000">
              <rect width="100%" height="100%" fill="#f8fafc" />
              
              {/* Упрощенные линии */}
              {LINES.map(line => {
                const edges = buildEdges(line, pos);
                return edges.map((edge, idx) => {
                  const A = pos[edge.a], B = pos[edge.b];
                  return (
                    <line 
                      key={`mini_${line.id}_${idx}`}
                      x1={A.x} y1={A.y} x2={B.x} y2={B.y} 
                      stroke={line.color} 
                      strokeWidth={3} 
                      opacity={0.8}
                    />
                  );
                });
              })}
              
              {/* Видимая область */}
              <rect 
                x={-translateX / scale} 
                y={-translateY / scale} 
                width={containerWidth / scale} 
                height={containerHeight / scale} 
                fill="none" 
                stroke="#ef4444" 
                strokeWidth={4} 
                opacity={0.8}
                strokeDasharray="10,5"
              />
            </svg>
            <div className="absolute bottom-1 left-1 text-xs text-gray-500 bg-white px-1 rounded">
              Обзор
            </div>
          </div>

          {/* Информационная панель */}
          <div className="absolute bottom-4 left-4 bg-white border border-gray-300 rounded-lg shadow-lg p-3 max-w-sm">
            <div className="text-sm">
              <div className="font-semibold text-gray-800 mb-2">Навигация:</div>
              <div className="text-gray-600 space-y-1">
                <div>🖱️ Перетаскивание мышью — движение по карте</div>
                <div>🎡 Колесико мыши — приближение/отдаление</div>
                <div>➕➖ Кнопки — точный контроль зума</div>
                <div>🔄 Сброс вида — возврат к исходному масштабу</div>
              </div>
              <div className="mt-3 pt-2 border-t border-gray-200">
                <div className="text-xs text-gray-500">
                  Всего станций: {stations.length} • Маршрутов: {LINES.length}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
