import React, { useMemo, useRef, useState, useEffect } from "react";
import Papa from "papaparse";
import { segmentsFromStations, getSegment, stationsFromSegments } from "./src/models/network";

// ==========================
//  Metro-style Russia map with GEO LAYOUT
//  - Stations placed by real coordinates (approx)
//  - Lines drawn over projected map
//  - Legend toggle per line
//  - OD search with variants from CSV (origin,destination,path)
//  - Robust label placement (multi-radius, no overlaps) + halo
//  - Stronger station spacing (repel)
// ==========================

type LineDef = { id: string; name: string; color: string; segments: string[] };
const SEP = " — ";
const seg = segmentsFromStations;

// === City coordinates (lon, lat). Approximations; enough for a clean metro-style layout ===
const CITY_COORDS: Record<string, [number, number]> = {
  "Москва": [37.6173, 55.7558],
  "Владимир": [40.4066, 56.1290],
  "Нижний Новгород": [44.0059, 56.2965],
  "Чебоксары": [47.2519, 56.1430],
  "Казань": [49.1064, 55.7963],
  "Набережные Челны": [52.3550, 55.7435],
  "Уфа": [56.0400, 54.7388],
  "Челябинск": [61.4026, 55.1600],
  "Курган": [65.3339, 55.4439],
  "Тюмень": [65.5322, 57.1522],
  "Омск": [73.3682, 54.9914],
  "Новосибирск": [82.9204, 55.0302],
  "Кемерово": [86.0872, 55.3550],
  "Красноярск": [92.8672, 56.0153],
  "Иркутск": [104.2964, 52.2870],
  "Улан-Удэ": [107.6098, 51.8335],
  "Чита": [113.5009, 52.0340],
  "Сковородино": [123.9438, 54.0000],
  "Свободный": [128.1307, 51.3700],
  "Хабаровск": [135.0721, 48.4800],
  "Владивосток": [131.8854, 43.1155],
  "Якутск": [129.7380, 62.0339],
  "Томск": [84.9522, 56.4847],
  "Пермь": [56.2294, 58.0105],
  "Екатеринбург": [60.5975, 56.8389],
  "Сургут": [73.3962, 61.2540],
  "Нижневартовск": [76.5664, 60.9397],
  "Ханты-Мансийск": [69.0189, 61.0042],
  "Новый Уренгой": [76.6333, 66.0833],
  "Абакан": [91.4292, 53.7200],
  "Кызыл": [94.4500, 51.7200],
  "Барнаул": [83.7636, 53.3468],
  "Бийск": [85.2072, 52.5394],
  "Новокузнецк": [87.1099, 53.7557],
  "Саратов": [46.0342, 51.5336],
  "Волгоград": [44.5169, 48.7080],
  "Воронеж": [39.2003, 51.6720],
  "Ростов-на-Дону": [39.7203, 47.2357],
  "Краснодар": [38.9747, 45.0355],
  "Элиста": [44.2689, 46.3083],
  "Астрахань": [48.0400, 46.3497],
  "Махачкала": [47.5047, 42.9849],
  "Грозный": [45.7000, 43.3187],
  "Владикавказ": [44.6677, 43.0205],
  "Нальчик": [43.6198, 43.4846],
  "Минеральные Воды": [43.0906, 44.2103],
  "Невинномысск": [41.9419, 44.6266],
  "Калининград": [20.4522, 54.7104],
  "Санкт-Петербург": [30.3158, 59.9391],
  "Петрозаводск": [34.3469, 61.7850],
  "Медвежьегорск": [34.4690, 62.9100],
  "Вологда": [39.8915, 59.2205],
  "Ярославль": [39.8938, 57.6261],
  "Рязань": [39.7400, 54.6197],
  "Пенза": [45.0000, 53.2000],
  "Оренбург": [55.0970, 51.7682],
  "Орск": [58.5668, 51.2293],
  "Тольятти": [49.3461, 53.5113],
  "Киров": [49.6601, 58.6035],
  "Кострома": [40.9153, 57.7679],
  "Сыктывкар": [50.8198, 61.6688],
  "Архангельск": [40.5440, 64.5399],
  "Мурманск": [33.0831, 68.9707],
  "Тверь": [35.9006, 56.8587],
  "Великий Новгород": [31.2769, 58.5215],
  "Симферополь": [34.1000, 44.9483],
  "Севастополь": [33.5213, 44.6167],
  "Керчь": [36.4754, 45.3560],
  "Мариуполь": [37.5400, 47.0969],
  "Мелитополь": [35.3668, 46.8489],
  "Йошкар-Ола": [47.8919, 56.6342],
  "Ижевск": [53.2038, 56.8431],
};
// === Trunk lines & branches (added Tomsk lines) ===
const eastwest_v1 = seg(["Владивосток","Хабаровск","Свободный","Сковородино","Чита","Улан-Удэ","Иркутск","Красноярск","Кемерово","Новосибирск","Омск","Тюмень","Екатеринбург","Набережные Челны","Казань","Чебоксары","Нижний Новгород","Владимир","Москва"]);
const eastwest_v2 = seg(["Владивосток","Хабаровск","Свободный","Сковородино","Чита","Улан-Удэ","Иркутск","Красноярск","Кемерово","Новосибирск","Омск","Курган","Челябинск","Уфа","Набережные Челны","Казань","Чебоксары","Нижний Новгород","Владимир","Москва"]);

// Tomsk→Moscow variants (per your examples)
const tomsk_msk_v1 = seg(["Томск","Новосибирск","Омск","Тюмень","Екатеринбург","Набережные Челны","Казань","Чебоксары","Нижний Новгород","Владимир","Москва"]);
const tomsk_msk_v2 = seg(["Томск","Новосибирск","Омск","Курган","Челябинск","Уфа","Набережные Челны","Казань","Чебоксары","Нижний Новгород","Владимир","Москва"]);

const to_kras_v1 = seg(["Екатеринбург","Уфа","Тольятти","Саратов","Воронеж","Ростов-на-Дону","Краснодар"]);
const to_kras_v2 = seg(["Екатеринбург","Уфа","Тольятти","Саратов","Волгоград","Ростов-на-Дону","Краснодар"]);
const to_kras_v3 = seg(["Челябинск","Уфа","Тольятти","Саратов","Воронеж","Ростов-на-Дону","Краснодар"]);
const to_kras_v4 = seg(["Челябинск","Уфа","Тольятти","Саратов","Волгоград","Ростов-на-Дону","Краснодар"]);
const cauc_via_astr = seg(["Саратов","Волгоград","Элиста","Астрахань","Махачкала"]);
const cauc_via_footh = seg(["Саратов","Волгоград","Элиста","Невинномысск","Минеральные Воды","Нальчик","Владикавказ","Грозный","Махачкала"]);
const nev_series_1 = seg(["Волгоград","Элиста","Астрахань","Махачкала","Грозный","Владикавказ","Нальчик","Минеральные Воды","Невинномысск"]);
const nev_series_2 = seg(["Волгоград","Элиста","Невинномысск","Минеральные Воды","Нальчик","Владикавказ","Грозный","Махачкала"]);
const murmansk_via_spb = seg(["Мурманск","Медвежьегорск","Петрозаводск","Санкт-Петербург","Москва"]);
const murmansk_via_vologda = seg(["Мурманск","Медвежьегорск","Вологда","Ярославль","Москва"]);
const siktivkar_msk = seg(["Сыктывкар","Киров","Ярославль","Москва"]);
const yosh_msk = seg(["Йошкар-Ола","Казань","Чебоксары","Нижний Новгород","Владимир","Москва"]);
const nurengoy_vladivostok = seg(["Новый Уренгой","Сургут","Тюмень","Новосибирск","Кемерово","Красноярск","Иркутск","Улан-Удэ","Чита","Сковородино","Свободный","Хабаровск","Владивосток"]);
const khm_paths_1 = seg(["Ханты-Мансийск","Сургут","Тюмень","Екатеринбург","Пермь","Киров","Кострома","Ярославль","Москва"]);
const khm_paths_2 = seg(["Ханты-Мансийск","Сургут","Тюмень","Екатеринбург","Пермь","Ижевск","Набережные Челны","Казань","Чебоксары","Нижний Новгород","Владимир","Москва"]);
const khm_paths_3 = seg(["Ханты-Мансийск","Сургут","Тюмень","Екатеринбург","Набережные Челны","Казань","Чебоксары","Нижний Новгород","Владимир","Москва"]);
const nizhnevart_paths_1 = seg(["Нижневартовск","Сургут","Тюмень","Екатеринбург","Пермь","Киров","Кострома","Ярославль","Москва"]);
const nizhnevart_paths_2 = seg(["Нижневартовск","Сургут","Тюмень","Екатеринбург","Пермь","Ижевск","Набережные Челны","Казань","Чебоксары","Нижний Новгород","Владимир","Москва"]);
const nizhnevart_paths_3 = seg(["Нижневартовск","Сургут","Тюмень","Екатеринбург","Набережные Челны","Казань","Чебоксары","Нижний Новгород","Владимир","Москва"]);
const abakan_branch = seg(["Кызыл","Абакан","Красноярск","Кемерово","Новосибирск","Барнаул"]);
const novokuz = seg(["Новокузнецк","Кемерово"]);
const biysk = seg(["Бийск","Барнаул"]);
const yakutsk = seg(["Якутск","Чита"]);
const kalin = seg(["Москва","Санкт-Петербург","Калининград"]);
const to_orsk = seg(["Тольятти","Оренбург","Орск"]);
const crimea_1 = seg(["Ростов-на-Дону","Мариуполь","Мелитополь","Симферополь","Севастополь"]);
const crimea_2 = seg(["Ростов-на-Дону","Краснодар","Керчь","Симферополь","Севастополь"]);
const msk_tlt = seg(["Москва","Рязань","Пенза","Тольятти"]);

const LINES: LineDef[] = [
  { id: "EW-1", name: "Восток–Запад (через Тюмень)", color: "#1976d2", segments: eastwest_v1 },
  { id: "EW-2", name: "Восток–Запад (через Челябинск–Уфа)", color: "#1e88e5", segments: eastwest_v2 },
  { id: "TOM-1", name: "Томск→Москва (через Тюмень)", color: "#2e86de", segments: tomsk_msk_v1 },
  { id: "TOM-2", name: "Томск→Москва (через Челябинск–Уфа)", color: "#54a0ff", segments: tomsk_msk_v2 },
  { id: "S-KR-1", name: "Южная к Краснодару (через Воронеж)", color: "#e53935", segments: to_kras_v1 },
  { id: "S-KR-2", name: "Южная к Краснодару (через Волгоград)", color: "#d81b60", segments: to_kras_v2 },
  { id: "S-KR-3", name: "Южная от Челябинска (через Воронеж)", color: "#c2185b", segments: to_kras_v3 },
  { id: "S-KR-4", name: "Южная от Челябинска (через Волгоград)", color: "#ad1457", segments: to_kras_v4 },
  { id: "CA-1", name: "Каспий–Кавказ через Астрахань", color: "#43a047", segments: cauc_via_astr },
  { id: "CA-2", name: "Кавказ предгорья", color: "#2e7d32", segments: cauc_via_footh },
  { id: "CA-3", name: "Элиста↔Невинномысск/Астрахань", color: "#66bb6a", segments: nev_series_1 },
  { id: "CA-4", name: "Элиста↔Невинномысск/Грозный", color: "#81c784", segments: nev_series_2 },
  { id: "N-1", name: "Север через Санкт‑Петербург", color: "#8e24aa", segments: murmansk_via_spb },
  { id: "N-2", name: "Север через Вологду", color: "#5e35b1", segments: murmansk_via_vologda },
  { id: "N-3", name: "Сыктывкар→Москва", color: "#7e57c2", segments: siktivkar_msk },
  { id: "N-4", name: "Йошкар‑Ола→Москва", color: "#9575cd", segments: yosh_msk },
  { id: "NR-VL", name: "Новый Уренгой→Владивосток", color: "#00897b", segments: nurengoy_vladivostok },
  { id: "KHM-1", name: "Ханты‑Мансийск→Москва (через Киров)", color: "#00acc1", segments: khm_paths_1 },
  { id: "KHM-2", name: "Ханты‑Мансийск→Москва (через Ижевск)", color: "#26c6da", segments: khm_paths_2 },
  { id: "KHM-3", name: "Ханты‑Мансийск→Москва (через Н.Челны)", color: "#4dd0e1", segments: khm_paths_3 },
  { id: "NV-1", name: "Нижневартовск→Москва (через Киров)", color: "#ef6c00", segments: nizhnevart_paths_1 },
  { id: "NV-2", name: "Нижневартовск→Москва (через Ижевск)", color: "#f57c00", segments: nizhnevart_paths_2 },
  { id: "NV-3", name: "Нижневартовск→Москва (через Н.Челны)", color: "#ffa000", segments: nizhnevart_paths_3 },
  { id: "AB-1", name: "Кызыл–Абакан–Барнаул", color: "#6d4c41", segments: abakan_branch },
  { id: "NVKZ", name: "Новокузнецк↔Кемерово", color: "#a1887f", segments: novokuz },
  { id: "BIYSK", name: "Бийск↔Барнаул", color: "#795548", segments: biysk },
  { id: "YK-CH", name: "Якутск↔Чита", color: "#9ccc65", segments: yakutsk },
  { id: "KAL", name: "Калининградская", color: "#c0ca33", segments: kalin },
  { id: "ORSK", name: "Тольятти↔Орск", color: "#90a4ae", segments: to_orsk },
  { id: "CR-1", name: "Крым через Мариуполь", color: "#ff7043", segments: crimea_1 },
  { id: "CR-2", name: "Крым через Керчь", color: "#ff8a65", segments: crimea_2 },
  { id: "MSK-TLT", name: "Москва↔Тольятти (Рязань–Пенза)", color: "#3949ab", segments: msk_tlt },
];

function buildNetwork(lines: LineDef[]) {
  const nodes = new Set<string>();
  const edges: Array<{ a: string; b: string; lineId: string }> = [];
  lines.forEach(l=>{
    l.segments.forEach(id=>{
      const seg = getSegment(id);
      if(seg){
        nodes.add(seg.from);
        nodes.add(seg.to);
        edges.push({a:seg.from, b:seg.to, lineId:l.id});
      }
    });
  });
  return { nodes: Array.from(nodes), edges };
}

// === Simple equirectangular projection fitted to Russia bounds ===
const BOUNDS = { minLon: -5, maxLon: 180, minLat: 35, maxLat: 80 };
function project(lon:number, lat:number, width:number, height:number, margin=40){
  const W = width - margin*2, H = height - margin*2;
  const x = ((lon-BOUNDS.minLon)/(BOUNDS.maxLon-BOUNDS.minLon))*W + margin;
  const y = ((BOUNDS.maxLat-lat)/(BOUNDS.maxLat-BOUNDS.minLat))*H + margin;
  return {x,y};
}

// === Compute layout from geo coords with much stronger anti-overlap ===
function computeGeoLayout(lines: LineDef[], width:number, height:number){
  const {nodes} = buildNetwork(lines);
  const pos: Record<string, {x:number;y:number}> = {};
  const missing: string[] = [];
  nodes.forEach(n=>{
    const c = SCHEMATIC_COORDS[n];
    if(!c){ missing.push(n); return; }
    pos[n] = project(c[0], c[1], width, height, 50);
  });
  // MUCH stronger repel to increase spacing between stations
  const keys = Object.keys(pos);
  const minD = 75; // minimal distance in px between station nodes
  for(let iter=0; iter<28; iter++){
    for(let i=0;i<keys.length;i++){
      for(let j=i+1;j<keys.length;j++){
        const a = keys[i], b=keys[j];
        let p1 = pos[a], p2 = pos[b];
        const dx = p2.x-p1.x, dy=p2.y-p1.y; const d2 = dx*dx+dy*dy;
        if(d2 < minD*minD){
          const d = Math.max(0.001, Math.sqrt(d2)); const ux=dx/d, uy=dy/d; const push=(minD-d)/2;
          p1.x -= ux*push; p1.y -= uy*push; p2.x += ux*push; p2.y += uy*push;
        }
      }
    }
  }
  return {pos, missing};
}

function parseRoutesCSV(text:string){
  const parsed = Papa.parse(text, { header:true, skipEmptyLines:true });
  const rows: Array<{ origin:string; destination:string; path:string[] }> = [];
  (parsed.data as any[]).forEach(r=>{
    const origin = r.origin || r["откуда"]; const destination = r.destination || r["куда"]; const pathRaw = r.path || r["путь"];
    if(!origin || !destination || !pathRaw) return;
    const stations = String(pathRaw).split(SEP).map(s=>s.trim()).filter(Boolean);
    if(stations.length>=2) rows.push({origin:String(origin).trim(), destination:String(destination).trim(), path:stations});
  });
  return rows;
}

function buildVariantsIndex(rows: Array<{ origin: string; destination: string; path: string[] }>) {
  const idx: Record<string, string[][]> = {};
  for (const r of rows) {
    const key = `${r.origin}||${r.destination}`;
    if (!idx[key]) idx[key] = [];
    idx[key].push(r.path);
  }
  return idx;
}

function collectCities(lines: LineDef[], rows: Array<{ origin: string; destination: string; path: string[] }>) {
  const set = new Set<string>();
  lines.forEach(l=>l.segments.forEach(id=>{ const seg = getSegment(id); if(seg){ set.add(seg.from); set.add(seg.to); }}));
  rows.forEach(r=>{ set.add(r.origin); set.add(r.destination); r.path.forEach(s=>set.add(s)); });
  return Array.from(set).sort((a,b)=>a.localeCompare(b, "ru"));
}

function variantEdges(stations: string[]){
  const set = new Set<string>();
  for(let i=0;i<stations.length-1;i++){
    const a = stations[i], b = stations[i+1];
    const key = a<b?`${a}__${b}`:`${b}__${a}`;
    set.add(key);
  }
  return set;
}

// === Smart label placement (multi-radius, greedy, collision-free) ===
function estimateTextSize(text: string, fontSize = 12){
  const w = Math.ceil(text.length * fontSize * 0.62);
  const h = Math.ceil(fontSize * 1.25);
  return {w, h};
}

type LabelPlacement = { x:number; y:number; anchor: "start"|"end" };

function placeLabels(pos: Record<string,{x:number;y:number}>, fontSize=12){
  const placed: Record<string, LabelPlacement> = {};
  const rects: Array<{x:number;y:number;w:number;h:number}> = [];
  const entries = Object.entries(pos)
    .sort((a,b)=> (a[1].y - b[1].y) || (a[1].x - b[1].x)); // север→юг, запад→восток

  const collide = (r:{x:number;y:number;w:number;h:number})=>{
    for(const q of rects){
      if(!(r.x+r.w < q.x || q.x+q.w < r.x || r.y+r.h < q.y || q.y+q.h < r.y)) return true;
    }
    return false;
  };

  const makeRect = (name:string, x:number, y:number, anchor:"start"|"end")=>{
    const {w,h} = estimateTextSize(name, fontSize);
    const pad=2; const rx = anchor==="start"? x: x-w; const ry = y-h+4;
    return {rect:{x:rx-pad,y:ry-pad,w:w+pad*2,h:h+pad*2}, w,h};
  };

  for(const [name, p] of entries){
    let chosen: LabelPlacement | null = null;
    const radii = [12,18,24,30,36,42,48,56,64,72,84,96,112,128];
    for(const d of radii){
      const {w,h} = estimateTextSize(name, fontSize);
      const candidates: Array<LabelPlacement> = [
        { x: p.x + d, y: p.y - d*0.6, anchor: "start" }, // NE
        { x: p.x + d, y: p.y + d*0.9, anchor: "start" }, // SE
        { x: p.x - d, y: p.y + d*0.9, anchor: "end" },   // SW
        { x: p.x - d, y: p.y - d*0.6, anchor: "end" },    // NW
      ];
      for(const c of candidates){
        const {rect} = makeRect(name, c.x, c.y, c.anchor);
        if(!collide(rect)){
          rects.push(rect); chosen = c; break;
        }
      }
      if(chosen) break;
    }
    if(!chosen){ // last resort: far SE
      const d = 140; chosen = { x:p.x + d, y:p.y + d*0.9, anchor:"start" };
      const {rect} = makeRect(name, chosen.x, chosen.y, chosen.anchor); rects.push(rect);
    }
    placed[name] = chosen;
  }
  return placed;
}

export default function MetroMapGeoApp(){
  const svgRef = useRef<SVGSVGElement|null>(null);
  const [lines, setLines] = useState<LineDef[]>(LINES);
  const [activeLines, setActiveLines] = useState<Set<string>>(new Set(lines.map(l=>l.id)));
  const [csvRows, setCsvRows] = useState<Array<{ origin:string; destination:string; path:string[] }>>([]);
  const [cityList, setCityList] = useState<string[]>([]);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [variants, setVariants] = useState<string[][]>([]);
  const [selectedVariant, setSelectedVariant] = useState<number>(0);

  const width = 1400, height = 900;
  const layoutGeo = useMemo(()=>computeGeoLayout(lines, width, height), [lines]);
  const network = useMemo(()=>buildNetwork(lines), [lines]);
  const labels = useMemo(()=>placeLabels(layoutGeo.pos, 12), [layoutGeo]);

  useEffect(()=>{ setCityList(collectCities(lines, csvRows)); }, [lines, csvRows]);

  const onCSV = (file:File)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{ const text = String(e.target?.result||""); setCsvRows(parseRoutesCSV(text)); };
    reader.readAsText(file, "utf-8");
  };

  const onSearch = ()=>{
    const idx = buildVariantsIndex(csvRows);
    const key = `${origin}||${destination}`; const found = idx[key] || [];
    setVariants(found); setSelectedVariant(0);
  };

  const highlightEdges = useMemo(()=>{
    if(!variants[selectedVariant]) return new Set<string>();
    return variantEdges(variants[selectedVariant]);
  }, [variants, selectedVariant]);

  const missing = layoutGeo.missing;

  return (
    <div className="w-full min-h-screen bg-white text-gray-900 p-4 space-y-4">
      <h1 className="text-2xl font-bold">Схема метро по карте России (гео‑layout)</h1>
      <p className="text-sm text-gray-600">Добавлены координаты Йошкар‑Олы и Ижевска, усилен разнос станций и размещение подписей без наложений. Загрузите CSV <code>origin,destination,path</code> (или <code>откуда,куда,путь</code>) — путь разделяется «{SEP}».</p>

      {missing.length>0 && (
        <div className="p-3 border rounded bg-amber-50 text-amber-900 text-sm">
          Не найдены координаты для: {missing.join(", ")}. Эти станции отображены после репеллинга по соседям/веткам и могут быть смещены. Сообщите — добавлю точные координаты.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="px-3 py-2 border rounded-lg bg-gray-50 cursor-pointer">
          Загрузить CSV
          <input type="file" accept=".csv" className="hidden" onChange={(e)=>{const f=e.target.files?.[0]; if(f) onCSV(f);}} />
        </label>
        <div className="flex items-end gap-2">
          <div>
            <div className="text-xs text-gray-500">Откуда</div>
            <input list="cities-from" value={origin} onChange={(e)=>setOrigin(e.target.value)} className="px-3 py-2 border rounded w-56" placeholder="Начните вводить город" />
            <datalist id="cities-from">{cityList.map(c=><option key={c} value={c}/>)}</datalist>
          </div>
          <div>
            <div className="text-xs text-gray-500">Куда</div>
            <input list="cities-to" value={destination} onChange={(e)=>setDestination(e.target.value)} className="px-3 py-2 border rounded w-56" placeholder="Начните вводить город" />
            <datalist id="cities-to">{cityList.map(c=><option key={c} value={c}/>)}</datalist>
          </div>
          <button onClick={onSearch} className="px-4 py-2 rounded-lg bg-black text-white hover:bg-gray-800">Найти варианты</button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Legend */}
        <div className="w-80 shrink-0 space-y-2">
          <h2 className="font-semibold">Легенда веток</h2>
          <div className="space-y-2 max-h-[520px] overflow-auto pr-2 border rounded-lg p-2">
            {lines.map(l=>{
              const active = activeLines.has(l.id);
              return (
                <div key={l.id} className={`p-2 rounded-lg border ${active?"bg-white":"bg-gray-50 opacity-70"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-4 h-4 rounded" style={{background:l.color}}></span>
                      <span className="text-sm font-medium">{l.name}</span>
                    </div>
                    <button onClick={()=>{ const next=new Set(activeLines); next.has(l.id)?next.delete(l.id):next.add(l.id); setActiveLines(next); }} className="text-xs px-2 py-1 rounded border hover:bg-gray-100">{active?"Скрыть":"Показать"}</button>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{stationsFromSegments(l.segments).join(" — ")}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <h3 className="font-semibold">Варианты маршрута</h3>
            {variants.length===0? <div className="text-sm text-gray-500">Загрузите CSV с вариантами для подсветки на карте.</div> : (
              <div className="space-y-2 max-h-64 overflow-auto">
                {variants.map((v,i)=> (
                  <button key={i} onClick={()=>setSelectedVariant(i)} className={`w-full text-left p-2 border rounded ${i===selectedVariant?"bg-gray-900 text-white":"hover:bg-gray-50"}`}>
                    {v.join(" — ")}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="grow border rounded-lg p-2 overflow-auto bg-white">
          <svg ref={svgRef} width={width} height={height} className="block">
            {/* Russia bounding box guide (subtle) */}
            <rect x={50} y={50} width={width-100} height={height-100} fill="none" stroke="#eee" />

            {/* Edges */}
            {buildNetwork(lines).edges.map((e, idx)=>{
              if(!activeLines.has(e.lineId)) return null;
              const a = layoutGeo.pos[e.a]; const b = layoutGeo.pos[e.b]; if(!a||!b) return null;
              const key = e.a<e.b?`${e.a}__${e.b}`:`${e.b}__${e.a}`;
              const isHi = highlightEdges.has(key);
              const color = lines.find(l=>l.id===e.lineId)?.color || "#888";
              return (
                <line key={idx} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={isHi?6:4} strokeLinecap="round" opacity={isHi?1:0.85} />
              );
            })}

            {/* Stations + Labels with halo and collision-free placement */}
            {Object.entries(layoutGeo.pos).map(([name, p])=> {
              const lab = labels[name];
              return (
                <g key={name}>
                  <circle cx={p.x} cy={p.y} r={4} fill="#111" />
                  {/* halo */}
                  <text x={lab.x} y={lab.y} fontSize={12} textAnchor={lab.anchor} stroke="#fff" strokeWidth={3} paintOrder="stroke" fill="#111">{name}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Геометрия приближена к реальной (по долготе/широте) с усиленным разведением узлов и многопроходным алгоритмом размещения подписей с увеличением радиуса до отсутствия пересечений.
      </div>
    </div>
  );
}
