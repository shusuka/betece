import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import './App.css';

interface Saving {
  id: string;
  date: string;
  amountBTC: number;
  note: string;
  priceAtBuy: number;
  type: 'buy' | 'sell';
}

interface BTCData {
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  lastUpdated: string;
}

interface FearGreed {
  value: number;
  label: string;
}

interface CoinTicker {
  id: string;
  symbol: string;
  name: string;
  change: number;
  price: number;
  image: string;
}

const STORAGE_KEY = 'btc_savings_v1';
function formatIDR(v: number) { return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0,maximumFractionDigits:0}).format(v); }
function formatBTC(v: number) { return v.toFixed(8); }
function formatUSD(v: number) { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(v); }

const CANDY_COLORS = [
  { glow:'#ff6eb4', bg:'rgba(255,110,180,0.18)', border:'rgba(255,110,180,0.45)' },
  { glow:'#7c6fff', bg:'rgba(124,111,255,0.18)', border:'rgba(124,111,255,0.45)' },
  { glow:'#43e8d8', bg:'rgba(67,232,216,0.18)',  border:'rgba(67,232,216,0.45)'  },
  { glow:'#ffb347', bg:'rgba(255,179,71,0.18)',  border:'rgba(255,179,71,0.45)'  },
  { glow:'#a8ff78', bg:'rgba(168,255,120,0.18)', border:'rgba(168,255,120,0.45)' },
  { glow:'#ff7f7f', bg:'rgba(255,127,127,0.18)', border:'rgba(255,127,127,0.45)' },
];

function parseExcelDate(raw: any): string | null {
  if (!raw) return null;
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return new Date(d.y, d.m-1, d.d).toISOString();
  }
  if (typeof raw === 'string') {
    const c = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(c)) { const d=new Date(c); if(!isNaN(d.getTime())) return d.toISOString(); }
    const months: Record<string,number>={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
    const m2=c.match(/^(\d+)-([A-Za-z]+)\s*(\d{4})/);
    if(m2){const mo=months[m2[2].toLowerCase().slice(0,3)];if(mo!==undefined)return new Date(parseInt(m2[3]),mo,parseInt(m2[1])).toISOString();}
    const m3=c.match(/^(\d+)\s+([A-Za-z]+)\s+(\d{4})/);
    if(m3){const mo=months[m3[2].toLowerCase().slice(0,3)];if(mo!==undefined)return new Date(parseInt(m3[3]),mo,parseInt(m3[1])).toISOString();}
  }
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw.toISOString();
  return null;
}

function FearGreedGauge({ value, label }: FearGreed) {
  const angle = -90 + (value / 100) * 180;
  const getColor = (v: number) => v <= 25 ? '#f87171' : v <= 45 ? '#fb923c' : v <= 55 ? '#facc15' : v <= 75 ? '#a3e635' : '#4ade80';
  const color = getColor(value);
  const cx = 100, cy = 90, r = 70;
  const arcPath = (startDeg: number, endDeg: number, col: string) => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const x1 = cx + r * Math.cos(toRad(startDeg));
    const y1 = cy + r * Math.sin(toRad(startDeg));
    const x2 = cx + r * Math.cos(toRad(endDeg));
    const y2 = cy + r * Math.sin(toRad(endDeg));
    return <path d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`} stroke={col} strokeWidth="14" fill="none" strokeLinecap="round" />;
  };
  const needleRad = (angle * Math.PI) / 180;
  const nx = cx + 55 * Math.cos(needleRad);
  const ny = cy + 55 * Math.sin(needleRad);
  return (
    <div className="fg-gauge-wrap">
      <svg viewBox="0 0 200 110" className="fg-svg">
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} stroke="rgba(255,255,255,0.08)" strokeWidth="14" fill="none" />
        {arcPath(-180,-144,'#f87171')}
        {arcPath(-144,-108,'#fb923c')}
        {arcPath(-108, -72,'#facc15')}
        {arcPath(-72,  -36,'#a3e635')}
        {arcPath(-36,    0,'#4ade80')}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill={color} />
        <text x={cx} y={cy-10} textAnchor="middle" fill="#fff" fontSize="22" fontWeight="900" fontFamily="Nunito">{value}</text>
        <text x={cx} y={cy+6} textAnchor="middle" fill={color} fontSize="9" fontWeight="800" fontFamily="Nunito">{label.toUpperCase()}</text>
        <text x={cx-r} y={cy+18} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="7">Fear</text>
        <text x={cx+r} y={cy+18} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="7">Greed</text>
      </svg>
    </div>
  );
}

export default function App() {
  const [savings, setSavings] = useState<Saving[]>([]);
  const [btcData, setBtcData] = useState<BTCData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amountBTC: '', note: '', type: 'buy' as 'buy'|'sell' });
  const [usdToIdr, setUsdToIdr] = useState(16200);
  const [activeTab, setActiveTab] = useState<'dashboard'|'history'|'import'>('dashboard');
  const [priceError, setPriceError] = useState(false);
  const [fearGreed, setFearGreed] = useState<FearGreed|null>(null);
  const [topGainers, setTopGainers] = useState<CoinTicker[]>([]);
  const [topLosers, setTopLosers]   = useState<CoinTicker[]>([]);
  const [marketLoading, setMarketLoading] = useState(true);
  const [importStatus, setImportStatus] = useState<{type:'idle'|'success'|'error'|'preview',message:string,preview?:Saving[]}>({type:'idle',message:''});
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // edit state
  const [editId, setEditId] = useState<string|null>(null);
  const [editForm, setEditForm] = useState<{date:string,amountBTC:string,note:string,priceAtBuy:string,type:'buy'|'sell'}>({date:'',amountBTC:'',note:'',priceAtBuy:'',type:'buy'});

  const fetchBTCPrice = useCallback(async () => {
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_high=true&include_24hr_low=true');
      const data = await res.json();
      const btc = data.bitcoin;
      setBtcData({ price:btc.usd, change24h:btc.usd_24h_change, high24h:btc.usd_24h_high, low24h:btc.usd_24h_low, lastUpdated:new Date().toLocaleTimeString('id-ID') });
      setPriceError(false);
    } catch { setPriceError(true); } finally { setLoading(false); }
  }, []);

  const fetchMarket = useCallback(async () => {
    setMarketLoading(true);
    try {
      const [fgRes, coinsRes] = await Promise.all([
        fetch('https://api.alternative.me/fng/'),
        fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&sparkline=false&price_change_percentage=24h')
      ]);
      const fgData = await fgRes.json();
      if (fgData.data?.[0]) {
        setFearGreed({ value: parseInt(fgData.data[0].value), label: fgData.data[0].value_classification });
      }
      const coins = await coinsRes.json();
      const sorted = [...coins].sort((a:any,b:any) => b.price_change_percentage_24h - a.price_change_percentage_24h);
      const map = (c: any): CoinTicker => ({ id:c.id, symbol:c.symbol, name:c.name, change:c.price_change_percentage_24h, price:c.current_price, image:c.image });
      setTopGainers(sorted.slice(0,5).map(map));
      setTopLosers(sorted.slice(-5).reverse().map(map));
    } catch {}
    setMarketLoading(false);
  }, []);

  const fetchUSDToIDR = useCallback(async () => {
    try { const res=await fetch('https://api.exchangerate-api.com/v4/latest/USD'); const d=await res.json(); if(d.rates?.IDR) setUsdToIdr(d.rates.IDR); } catch {}
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      setSavings(parsed.map((s: any) => ({ ...s, type: s.type || 'buy' })));
    }
    fetchBTCPrice(); fetchMarket(); fetchUSDToIDR();
    const i1 = setInterval(fetchBTCPrice, 60000);
    const i2 = setInterval(fetchMarket, 300000);
    return () => { clearInterval(i1); clearInterval(i2); };
  }, [fetchBTCPrice, fetchMarket, fetchUSDToIDR]);

  const saveSavings = (data: Saving[]) => { setSavings(data); localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); };
  const addSaving = () => {
    if (!form.amountBTC || isNaN(Number(form.amountBTC)) || Number(form.amountBTC)<=0) return;
    saveSavings([{ id:Date.now().toString(), date:new Date().toISOString(), amountBTC:Number(form.amountBTC), note:form.note, priceAtBuy:btcData?.price||0, type:form.type }, ...savings]);
    setForm({ amountBTC:'', note:'', type:'buy' }); setShowForm(false);
  };
  const deleteSaving = (id: string) => saveSavings(savings.filter(s=>s.id!==id));

  const startEdit = (s: Saving) => {
    setEditId(s.id);
    setEditForm({
      date: new Date(s.date).toISOString().split('T')[0],
      amountBTC: String(s.amountBTC),
      note: s.note,
      priceAtBuy: String(s.priceAtBuy),
      type: s.type || 'buy',
    });
  };
  const saveEdit = () => {
    if (!editId) return;
    saveSavings(savings.map(s => s.id !== editId ? s : {
      ...s,
      date: new Date(editForm.date).toISOString(),
      amountBTC: Number(editForm.amountBTC),
      note: editForm.note,
      priceAtBuy: Number(editForm.priceAtBuy),
      type: editForm.type,
    }));
    setEditId(null);
  };

  // Excel import
  const parseExcelFile = (file: File) => {
    setImportStatus({ type:'idle', message:'Membaca file...' });
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type:'array', cellDates:false });
        const ws = wb.Sheets[wb.SheetNames.includes('Sheet1')?'Sheet1':wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header:1, defval:null });
        let dataStart = 7;
        for (let i=0;i<rows.length;i++) {
          if (String(rows[i][1]||'').includes('Jumlah')) { dataStart=i+1; break; }
        }
        const parsed: Saving[] = [];
        for (let i=dataStart;i<rows.length;i++) {
          const row=rows[i];
          const dateStr=parseExcelDate(row[0]);
          const btcAmt=parseFloat(String(row[1]));
          if (!dateStr||isNaN(btcAmt)||btcAmt<=0) continue;
          const hargaBeliIDR=parseFloat(String(row[2]||0));
          parsed.push({ id:`xl_${i}_${Date.now()}`, date:dateStr, amountBTC:btcAmt, note:row[8]&&String(row[8]).trim()?String(row[8]).trim():'', priceAtBuy:hargaBeliIDR>0?hargaBeliIDR/usdToIdr:0, type:'buy' });
        }
        if (parsed.length===0) { setImportStatus({type:'error',message:'Tidak ada data valid yang ditemukan.'}); return; }
        setImportStatus({ type:'preview', message:`Ditemukan ${parsed.length} transaksi`, preview:parsed });
      } catch { setImportStatus({type:'error',message:'Gagal membaca file.'}); }
    };
    reader.readAsArrayBuffer(file);
  };
  const confirmImport = (replace: boolean) => {
    if (!importStatus.preview) return;
    const newData = replace ? importStatus.preview : [...importStatus.preview,...savings];
    const seen=new Set<string>();
    saveSavings(newData.filter(s=>{const k=`${s.date}_${s.amountBTC}`;if(seen.has(k))return false;seen.add(k);return true;}));
    setImportStatus({ type:'success', message:`✅ Berhasil import ${importStatus.preview.length} transaksi!` });
  };

  // Totals — sell reduces holdings
  const totalBTC    = savings.reduce((a,s)=>s.type==='sell'?a-s.amountBTC:a+s.amountBTC, 0);
  const totalCostUSD= savings.filter(s=>s.type==='buy').reduce((a,s)=>a+s.amountBTC*s.priceAtBuy,0);
  const sellRevUSD  = savings.filter(s=>s.type==='sell').reduce((a,s)=>a+s.amountBTC*s.priceAtBuy,0);
  const currentValueUSD = Math.max(totalBTC,0)*(btcData?.price||0);
  const profitUSD   = currentValueUSD + sellRevUSD - totalCostUSD;
  const profitPct   = totalCostUSD>0?(profitUSD/totalCostUSD)*100:0;
  const totalBTCInIDR = currentValueUSD*usdToIdr;
  const costInIDR   = totalCostUSD*usdToIdr;
  const profitInIDR = profitUSD*usdToIdr;

  return (
    <div className="app">
      <div className="bg-blobs">
        <div className="blob blob-1"/><div className="blob blob-2"/><div className="blob blob-3"/>
        <div className="blob blob-4"/><div className="blob blob-5"/>
      </div>
      <div className="container">
        <header className="header glass-card">
          <div className="header-left">
            <span className="btc-icon">₿</span>
            <div><h1 className="app-title">Bitcoin Savings</h1><p className="app-subtitle">Tabungan Kripto Kamu 🍬</p></div>
          </div>
          <div className="header-right">
            {loading ? <div className="price-loading">Memuat...</div>
            : priceError ? <div className="price-error">⚠️ Error</div>
            : btcData ? (
              <div className="live-price">
                <span className="price-label">BTC/USD</span>
                <span className="price-value">{formatUSD(btcData.price)}</span>
                <span className={`price-change ${btcData.change24h>=0?'green':'red'}`}>{btcData.change24h>=0?'▲':'▼'} {Math.abs(btcData.change24h).toFixed(2)}%</span>
                <span className="price-updated">Update {btcData.lastUpdated}</span>
              </div>
            ):null}
          </div>
        </header>

        <div className="tabs">
          <button className={`tab-btn ${activeTab==='dashboard'?'active':''}`} onClick={()=>setActiveTab('dashboard')}>📊 Dashboard</button>
          <button className={`tab-btn ${activeTab==='history'?'active':''}`} onClick={()=>setActiveTab('history')}>📜 Riwayat</button>
          <button className={`tab-btn ${activeTab==='import'?'active':''}`} onClick={()=>setActiveTab('import')}>📥 Import</button>
        </div>

        {/* ===== DASHBOARD ===== */}
        {activeTab==='dashboard' && (
          <>
            <div className="stats-grid">
              <div className="stat-card glass-card candy-pink"><div className="stat-icon">₿</div><div className="stat-label">Total Bitcoin</div><div className="stat-value mono">{formatBTC(Math.max(totalBTC,0))}</div><div className="stat-sub">BTC</div></div>
              <div className="stat-card glass-card candy-purple"><div className="stat-icon">💰</div><div className="stat-label">Nilai Sekarang</div><div className="stat-value">{formatIDR(totalBTCInIDR)}</div><div className="stat-sub">{formatUSD(currentValueUSD)}</div></div>
              <div className="stat-card glass-card candy-teal"><div className="stat-icon">🏦</div><div className="stat-label">Total Modal</div><div className="stat-value">{formatIDR(costInIDR)}</div><div className="stat-sub">{formatUSD(totalCostUSD)}</div></div>
              <div className={`stat-card glass-card ${profitUSD>=0?'candy-green':'candy-red'}`}><div className="stat-icon">{profitUSD>=0?'📈':'📉'}</div><div className="stat-label">Profit / Rugi</div><div className={`stat-value ${profitUSD>=0?'text-green':'text-red'}`}>{profitUSD>=0?'+':''}{formatIDR(profitInIDR)}</div><div className={`stat-sub ${profitUSD>=0?'text-green':'text-red'}`}>{profitPct>=0?'+':''}{profitPct.toFixed(2)}%</div></div>
            </div>

            {/* Market Info — Fear & Greed + Gainers/Losers */}
            <div className="glass-card market-card">
              <h3 className="section-title">🌡️ Sentimen & Market</h3>
              {marketLoading ? (
                <div className="market-loading">Memuat data market...</div>
              ) : (
                <div className="market-layout">
                  {/* Fear & Greed */}
                  <div className="fg-section">
                    <div className="fg-title">Fear & Greed Index</div>
                    {fearGreed ? <FearGreedGauge value={fearGreed.value} label={fearGreed.label} /> : <div className="fg-na">Data tidak tersedia</div>}
                  </div>
                  {/* Gainers */}
                  <div className="movers-section">
                    <div className="movers-title gainers-title">🚀 Top 5 Naik</div>
                    <div className="movers-list">
                      {topGainers.map(c=>(
                        <div key={c.id} className="mover-row">
                          <img src={c.image} alt={c.symbol} className="coin-img" />
                          <div className="coin-info"><span className="coin-name">{c.symbol.toUpperCase()}</span><span className="coin-price">{formatUSD(c.price)}</span></div>
                          <span className="coin-change gain">+{c.change.toFixed(2)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Losers */}
                  <div className="movers-section">
                    <div className="movers-title losers-title">📉 Top 5 Turun</div>
                    <div className="movers-list">
                      {topLosers.map(c=>(
                        <div key={c.id} className="mover-row">
                          <img src={c.image} alt={c.symbol} className="coin-img" />
                          <div className="coin-info"><span className="coin-name">{c.symbol.toUpperCase()}</span><span className="coin-price">{formatUSD(c.price)}</span></div>
                          <span className="coin-change loss">{c.change.toFixed(2)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Portfolio extra stats */}
            {btcData && savings.length>0 && (
              <div className="glass-card dca-card">
                <h3 className="section-title">📊 Statistik Portfolio</h3>
                <div className="dca-grid">
                  <div className="dca-item"><span className="dca-label">Kurs USD/IDR</span><span className="dca-val">{formatIDR(usdToIdr)}</span></div>
                  <div className="dca-item"><span className="dca-label">Total Transaksi</span><span className="dca-val">{savings.length}x ({savings.filter(s=>s.type==='buy').length} beli / {savings.filter(s=>s.type==='sell').length} jual)</span></div>
                  <div className="dca-item"><span className="dca-label">Rata-rata Beli</span><span className="dca-val">{formatUSD(totalBTC>0?totalCostUSD/savings.filter(s=>s.type==='buy').reduce((a,s)=>a+s.amountBTC,0):0)}</span></div>
                  <div className="dca-item"><span className="dca-label">Rata-rata Beli (IDR)</span><span className="dca-val">{formatIDR((totalBTC>0?totalCostUSD/savings.filter(s=>s.type==='buy').reduce((a,s)=>a+s.amountBTC,0):0)*usdToIdr)}</span></div>
                </div>
              </div>
            )}

            <button className="add-btn candy-btn" onClick={()=>setShowForm(true)}>＋ Tambah Tabungan BTC</button>
            {showForm && (
              <div className="glass-card form-card">
                <h3 className="section-title">✨ Tambah Transaksi</h3>
                {/* Type toggle */}
                <div className="type-toggle">
                  <button className={`type-btn buy-btn ${form.type==='buy'?'active':''}`} onClick={()=>setForm(f=>({...f,type:'buy'}))}>🟢 Beli</button>
                  <button className={`type-btn sell-btn ${form.type==='sell'?'active':''}`} onClick={()=>setForm(f=>({...f,type:'sell'}))}>🔴 Jual</button>
                </div>
                <div className="form-group">
                  <label className="form-label">Jumlah BTC</label>
                  <input type="number" className="form-input" placeholder="Contoh: 0.001" value={form.amountBTC} step="0.00000001" min="0" onChange={e=>setForm(f=>({...f,amountBTC:e.target.value}))} />
                  {form.amountBTC&&btcData&&Number(form.amountBTC)>0&&<div className="form-hint">≈ {formatUSD(Number(form.amountBTC)*btcData.price)} | {formatIDR(Number(form.amountBTC)*btcData.price*usdToIdr)}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Catatan (opsional)</label>
                  <input type="text" className="form-input" placeholder="Contoh: DCA Maret 2025" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} />
                </div>
                <div className="form-actions">
                  <button className="btn-cancel" onClick={()=>{setShowForm(false);setForm({amountBTC:'',note:'',type:'buy'});}}>Batal</button>
                  <button className="btn-save candy-btn" onClick={addSaving}>💾 Simpan</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== HISTORY ===== */}
        {activeTab==='history' && (
          <div className="history-section">
            <div className="history-header">
              <h3 className="section-title">📜 Riwayat ({savings.length} transaksi)</h3>
              <button className="add-btn-sm candy-btn" onClick={()=>{setActiveTab('dashboard');setTimeout(()=>setShowForm(true),100);}}>＋ Tambah</button>
            </div>
            {savings.length===0 ? (
              <div className="glass-card empty-state"><div className="empty-icon">🪙</div><p>Belum ada data. Import dari Excel atau tambah manual!</p></div>
            ) : (
              <div className="history-list">
                {savings.map((s,i)=>{
                  const color=CANDY_COLORS[i%CANDY_COLORS.length];
                  const isEditing=editId===s.id;
                  const currentVal=s.amountBTC*(btcData?.price||0);
                  const cost=s.amountBTC*s.priceAtBuy;
                  const profit=currentVal-cost;
                  const pct=cost>0?(profit/cost)*100:0;
                  return (
                    <div key={s.id} className="history-item glass-card"
                      style={{background:color.bg,borderColor:color.border,boxShadow:`0 0 24px ${color.glow}33`}}>

                      {isEditing ? (
                        /* ---- EDIT FORM ---- */
                        <div className="edit-form">
                          <div className="edit-title">✏️ Edit Transaksi</div>
                          <div className="type-toggle">
                            <button className={`type-btn buy-btn ${editForm.type==='buy'?'active':''}`} onClick={()=>setEditForm(f=>({...f,type:'buy'}))}>🟢 Beli</button>
                            <button className={`type-btn sell-btn ${editForm.type==='sell'?'active':''}`} onClick={()=>setEditForm(f=>({...f,type:'sell'}))}>🔴 Jual</button>
                          </div>
                          <div className="edit-grid">
                            <div className="form-group">
                              <label className="form-label">Tanggal</label>
                              <input type="date" className="form-input" value={editForm.date} onChange={e=>setEditForm(f=>({...f,date:e.target.value}))} />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Jumlah BTC</label>
                              <input type="number" className="form-input" value={editForm.amountBTC} step="0.00000001" onChange={e=>setEditForm(f=>({...f,amountBTC:e.target.value}))} />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Harga Beli/Jual (USD)</label>
                              <input type="number" className="form-input" value={editForm.priceAtBuy} onChange={e=>setEditForm(f=>({...f,priceAtBuy:e.target.value}))} />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Catatan</label>
                              <input type="text" className="form-input" value={editForm.note} onChange={e=>setEditForm(f=>({...f,note:e.target.value}))} />
                            </div>
                          </div>
                          <div className="form-actions">
                            <button className="btn-cancel" onClick={()=>setEditId(null)}>Batal</button>
                            <button className="btn-save candy-btn" onClick={saveEdit}>💾 Simpan</button>
                          </div>
                        </div>
                      ) : (
                        /* ---- VIEW MODE ---- */
                        <>
                          <div className="history-top">
                            <div className="history-top-left">
                              <span className={`tx-badge ${s.type==='sell'?'badge-sell':'badge-buy'}`}>{s.type==='sell'?'JUAL':'BELI'}</span>
                              <span className="history-date">{new Date(s.date).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</span>
                            </div>
                            <div className="history-actions">
                              <button className="edit-btn" onClick={()=>startEdit(s)} title="Edit">✏️</button>
                              <button className="delete-btn" onClick={()=>deleteSaving(s.id)} title="Hapus">✕</button>
                            </div>
                          </div>
                          <div className="history-btc">{formatBTC(s.amountBTC)} <span className="btc-tag">BTC</span></div>
                          {s.note && <div className="history-note">📝 {s.note}</div>}
                          <div className="history-stats">
                            <div className="h-stat"><span className="h-label">{s.type==='sell'?'Harga Jual':'Harga Beli'}</span><span className="h-val">{s.priceAtBuy>0?formatUSD(s.priceAtBuy):'-'}</span></div>
                            <div className="h-stat"><span className="h-label">Nilai Kini</span><span className="h-val">{formatUSD(currentVal)}</span></div>
                            <div className="h-stat"><span className="h-label">P/L</span><span className={`h-val ${profit>=0?'text-green':'text-red'}`}>{profit>=0?'+':''}{pct.toFixed(1)}%</span></div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== IMPORT ===== */}
        {activeTab==='import' && (
          <div className="import-section">
            <div className="glass-card import-card">
              <h3 className="section-title">📥 Import dari Excel</h3>
              <p className="import-desc">Upload file <strong>tabunganku.xlsx</strong> kamu. Otomatis baca Sheet1.</p>
              <div className={`drop-zone ${isDragging?'dragging':''}`}
                onDragOver={e=>{e.preventDefault();setIsDragging(true);}}
                onDragLeave={()=>setIsDragging(false)}
                onDrop={e=>{e.preventDefault();setIsDragging(false);const f=e.dataTransfer.files[0];if(f)parseExcelFile(f);}}
                onClick={()=>fileInputRef.current?.click()}>
                <div className="drop-icon">📂</div>
                <div className="drop-text">Drag & drop file Excel di sini</div>
                <div className="drop-sub">atau klik untuk pilih file</div>
                <div className="drop-format">.xlsx • .xls</div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)parseExcelFile(f);e.target.value='';}} />
              </div>
              {importStatus.type==='error' && <div className="import-status error">❌ {importStatus.message}</div>}
              {importStatus.type==='success' && <div className="import-status success">{importStatus.message}</div>}
              {importStatus.type==='preview' && importStatus.preview && (
                <div className="import-preview">
                  <div className="preview-info">🔍 Ditemukan <strong>{importStatus.preview.length} transaksi</strong> dari Sheet1</div>
                  <div className="preview-list">
                    {importStatus.preview.slice(0,5).map((s,i)=>(
                      <div key={i} className="preview-row">
                        <span className="pr-date">{new Date(s.date).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}</span>
                        <span className="pr-btc">{formatBTC(s.amountBTC)} BTC</span>
                        <span className="pr-price">{s.priceAtBuy>0?formatUSD(s.priceAtBuy):'-'}</span>
                        {s.note&&<span className="pr-note">📝{s.note}</span>}
                      </div>
                    ))}
                    {importStatus.preview.length>5&&<div className="preview-more">...dan {importStatus.preview.length-5} transaksi lainnya</div>}
                  </div>
                  <div className="import-actions">
                    {savings.length>0 ? (
                      <>
                        <button className="btn-import-merge candy-btn" onClick={()=>confirmImport(false)}>🔀 Gabung dengan data existing</button>
                        <button className="btn-import-replace" onClick={()=>confirmImport(true)}>🔄 Ganti semua data</button>
                      </>
                    ) : (
                      <button className="btn-import-merge candy-btn" onClick={()=>confirmImport(false)}>✅ Import Sekarang</button>
                    )}
                    <button className="btn-cancel" onClick={()=>setImportStatus({type:'idle',message:''})}>Batal</button>
                  </div>
                </div>
              )}
            </div>
            <div className="glass-card guide-card">
              <h3 className="section-title">📋 Kolom yang Dibaca</h3>
              <div className="guide-grid">
                <div className="guide-item"><span className="guide-col">Kolom A</span><span className="guide-desc">Tanggal Beli/Jual</span></div>
                <div className="guide-item"><span className="guide-col">Kolom B</span><span className="guide-desc">Jumlah BTC</span></div>
                <div className="guide-item"><span className="guide-col">Kolom C</span><span className="guide-desc">Harga Beli (IDR)</span></div>
                <div className="guide-item"><span className="guide-col">Kolom I</span><span className="guide-desc">Catatan / Sumber</span></div>
              </div>
              <p className="guide-note">💡 Sheet yang dibaca: <strong>Sheet1</strong></p>
            </div>
          </div>
        )}

        <footer className="footer">
          <span>Dibuat dengan ❤️ • CoinGecko • Alternative.me</span>
          <span className="live-dot">● LIVE</span>
        </footer>
      </div>
    </div>
  );
}
