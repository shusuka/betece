import React, { useState, useEffect, useCallback, useRef } from 'react';
import { signInWithGoogle, signOutUser, onAuthChange, saveSavingsToCloud, loadSavingsFromCloud, User } from './firebase';
import './App.css';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Asset {
  id: string;
  date: string;
  coinId: string;
  coinSymbol: string;
  coinName: string;
  coinImage: string;
  amountCoin: number;
  priceAtBuyUSD: number;
  valueIDR: number;
  note: string;
  type: 'buy' | 'sell';
}

interface BTCData { price: number; change24h: number; lastUpdated: string; }
interface FearGreed { value: number; label: string; }
interface CoinMarket { id: string; symbol: string; name: string; image: string; current_price: number; price_change_percentage_24h: number; market_cap: number; }
interface NewsItem { title: string; url: string; source: string; published: string; summary: string; sentiment: 'positive'|'negative'|'neutral'; }

const STORAGE_KEY = 'crypto_assets_v2';
const fmtIDR = (v: number) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0,maximumFractionDigits:0}).format(v);
const fmtUSD = (v: number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
const fmtCoin = (v: number) => v < 0.01 ? v.toFixed(8) : v < 1 ? v.toFixed(4) : v.toFixed(2);

const CANDY = [
  {glow:'#ff6eb4',bg:'rgba(255,110,180,0.15)',border:'rgba(255,110,180,0.4)'},
  {glow:'#7c6fff',bg:'rgba(124,111,255,0.15)',border:'rgba(124,111,255,0.4)'},
  {glow:'#43e8d8',bg:'rgba(67,232,216,0.15)', border:'rgba(67,232,216,0.4)' },
  {glow:'#ffb347',bg:'rgba(255,179,71,0.15)', border:'rgba(255,179,71,0.4)' },
  {glow:'#a8ff78',bg:'rgba(168,255,120,0.15)',border:'rgba(168,255,120,0.4)'},
  {glow:'#ff7f7f',bg:'rgba(255,127,127,0.15)',border:'rgba(255,127,127,0.4)'},
];

// ─── Fear & Greed Gauge ───────────────────────────────────────────────────────
function FGGauge({ value, label }: FearGreed) {
  const clamp = Math.max(0, Math.min(100, value));
  // needle: 0 = far left (-180deg from positive x-axis = pointing left), 100 = far right (0deg)
  // arc goes from -180° to 0° (left to right across top)
  const needleDeg = -180 + (clamp / 100) * 180; // -180 to 0
  const toRad = (d: number) => d * Math.PI / 180;
  const cx = 110, cy = 100, r = 78;
  const needleRad = toRad(needleDeg);
  const nx = cx + (r - 10) * Math.cos(needleRad);
  const ny = cy + (r - 10) * Math.sin(needleRad);
  const getCol = (v: number) => v<=20?'#ef4444':v<=40?'#f97316':v<=60?'#eab308':v<=80?'#84cc16':'#22c55e';
  const col = getCol(clamp);

  // draw colored arc segments
  const arcSeg = (startDeg: number, endDeg: number, color: string) => {
    const x1 = cx + r * Math.cos(toRad(startDeg)), y1 = cy + r * Math.sin(toRad(startDeg));
    const x2 = cx + r * Math.cos(toRad(endDeg)),   y2 = cy + r * Math.sin(toRad(endDeg));
    const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    return <path d={`M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2}`} stroke={color} strokeWidth="16" fill="none" strokeLinecap="butt"/>;
  };

  return (
    <div className="fg-wrap">
      <svg viewBox="0 0 220 115" className="fg-svg">
        {/* track */}
        <path d={`M${cx-r} ${cy} A${r} ${r} 0 0 1 ${cx+r} ${cy}`} stroke="rgba(255,255,255,0.07)" strokeWidth="16" fill="none"/>
        {/* colored segments */}
        {arcSeg(-180,-144,'#ef4444')}
        {arcSeg(-144,-108,'#f97316')}
        {arcSeg(-108, -72,'#eab308')}
        {arcSeg(-72,  -36,'#84cc16')}
        {arcSeg(-36,    0,'#22c55e')}
        {/* needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={col} strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx={cx} cy={cy} r="5" fill={col} filter={`drop-shadow(0 0 4px ${col})`}/>
        {/* value */}
        <text x={cx} y={cy-16} textAnchor="middle" fill="#fff" fontSize="26" fontWeight="900" fontFamily="Nunito">{clamp}</text>
        <text x={cx} y={cy-2}  textAnchor="middle" fill={col}  fontSize="8.5" fontWeight="800" fontFamily="Nunito" letterSpacing="1">{label.toUpperCase()}</text>
        <text x={cx-r+4} y={cy+14} fill="rgba(255,255,255,0.3)" fontSize="7" fontFamily="Nunito">Extreme Fear</text>
        <text x={cx+r-4} y={cy+14} fill="rgba(255,255,255,0.3)" fontSize="7" fontFamily="Nunito" textAnchor="end">Extreme Greed</text>
      </svg>
    </div>
  );
}

// ─── Mini Sparkline ────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const w = 80, h = 30;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{width:80,height:30}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Portfolio Donut ──────────────────────────────────────────────────────────
function DonutChart({ assets, currentPrices }: { assets: Asset[], currentPrices: Record<string,number> }) {
  const grouped: Record<string, { value: number; color: string; symbol: string }> = {};
  const palette = ['#ff6eb4','#a78bfa','#43e8d8','#ffb347','#a8ff78','#ff7f7f','#60a5fa','#f472b6'];
  let ci = 0;
  assets.filter(a=>a.type==='buy').forEach(a => {
    const price = currentPrices[a.coinId] || a.priceAtBuyUSD;
    const val = a.amountCoin * price;
    if (!grouped[a.coinId]) grouped[a.coinId] = { value: 0, color: palette[ci++ % palette.length], symbol: a.coinSymbol };
    grouped[a.coinId].value += val;
  });
  const entries = Object.entries(grouped).sort((a,b) => b[1].value - a[1].value);
  const total = entries.reduce((s,[,v]) => s + v.value, 0);
  if (!total) return <div className="donut-empty">Belum ada aset</div>;

  const cx=70, cy=70, r=55, ir=38;
  let angle = -90;
  const slices = entries.map(([id, {value, color, symbol}]) => {
    const pct = value / total;
    const sweep = pct * 360;
    const startA = angle; angle += sweep;
    const toR = (d:number) => d * Math.PI / 180;
    const x1=cx+r*Math.cos(toR(startA)), y1=cy+r*Math.sin(toR(startA));
    const x2=cx+r*Math.cos(toR(startA+sweep)), y2=cy+r*Math.sin(toR(startA+sweep));
    const ix1=cx+ir*Math.cos(toR(startA)), iy1=cy+ir*Math.sin(toR(startA));
    const ix2=cx+ir*Math.cos(toR(startA+sweep)), iy2=cy+ir*Math.sin(toR(startA+sweep));
    const large = sweep > 180 ? 1 : 0;
    return { id, color, symbol, pct, path:`M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} L${ix2} ${iy2} A${ir} ${ir} 0 ${large} 0 ${ix1} ${iy1} Z` };
  });

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" className="donut-svg">
        {slices.map(s => <path key={s.id} d={s.path} fill={s.color} opacity="0.9"/>)}
        <text x={cx} y={cy-4} textAnchor="middle" fill="#fff" fontSize="9" fontFamily="Nunito" fontWeight="700">Portfolio</text>
        <text x={cx} y={cy+8} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="7" fontFamily="Nunito">{entries.length} aset</text>
      </svg>
      <div className="donut-legend">
        {slices.slice(0,5).map(s=>(
          <div key={s.id} className="legend-row">
            <span className="legend-dot" style={{background:s.color}}/>
            <span className="legend-sym">{s.symbol.toUpperCase()}</span>
            <span className="legend-pct">{(s.pct*100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<User|null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [btcData, setBtcData] = useState<BTCData|null>(null);
  const [usdToIdr, setUsdToIdr] = useState(16200);
  const [activeTab, setActiveTab] = useState<'dashboard'|'history'|'news'>('dashboard');
  const [fearGreed, setFearGreed] = useState<FearGreed|null>(null);
  const [topGainers, setTopGainers] = useState<CoinMarket[]>([]);
  const [topLosers, setTopLosers]   = useState<CoinMarket[]>([]);
  const [marketCoins, setMarketCoins] = useState<CoinMarket[]>([]);
  const [currentPrices, setCurrentPrices] = useState<Record<string,number>>({});
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [marketLoading, setMarketLoading] = useState(true);
  // Add asset modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addStep, setAddStep] = useState<'select'|'form'>('select');
  const [selectedCoin, setSelectedCoin] = useState<CoinMarket|null>(null);
  const [searchCoin, setSearchCoin] = useState('');
  const [addForm, setAddForm] = useState({ valueIDR: '', amountCoin: '', note: '', type: 'buy' as 'buy'|'sell' });
  // Edit
  const [editId, setEditId] = useState<string|null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const saveTimer = useRef<any>(null);

  // Auth
  useEffect(() => {
    return onAuthChange(u => { setUser(u); setAuthLoading(false); });
  }, []);

  // Load assets when user changes
  useEffect(() => {
    if (!user) { 
      const local = localStorage.getItem(STORAGE_KEY);
      if (local) setAssets(JSON.parse(local));
      return;
    }
    loadSavingsFromCloud(user.uid).then(data => {
      if (data.length) setAssets(data);
      else {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) setAssets(JSON.parse(local));
      }
    });
  }, [user]);

  // Save assets (debounced)
  const persistAssets = useCallback((data: Asset[]) => {
    setAssets(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (user) {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveSavingsToCloud(user.uid, data), 1500);
    }
  }, [user]);

  const fetchBTC = useCallback(async () => {
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
      const d = await r.json();
      setBtcData({ price: d.bitcoin.usd, change24h: d.bitcoin.usd_24h_change, lastUpdated: new Date().toLocaleTimeString('id-ID') });
    } catch {}
  }, []);

  const fetchMarket = useCallback(async () => {
    setMarketLoading(true);
    try {
      const [fgR, coinsR] = await Promise.all([
        fetch('https://api.alternative.me/fng/'),
        fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&sparkline=false&price_change_percentage=24h')
      ]);
      const fg = await fgR.json();
      if (fg.data?.[0]) setFearGreed({ value: parseInt(fg.data[0].value), label: fg.data[0].value_classification });
      const coins: CoinMarket[] = await coinsR.json();
      setMarketCoins(coins);
      const sorted = [...coins].sort((a,b)=>b.price_change_percentage_24h-a.price_change_percentage_24h);
      setTopGainers(sorted.slice(0,5));
      setTopLosers(sorted.slice(-5).reverse());
      const prices: Record<string,number> = {};
      coins.forEach(c => prices[c.id] = c.current_price);
      setCurrentPrices(prices);
    } catch {}
    setMarketLoading(false);
  }, []);

  const fetchUSDIDR = useCallback(async () => {
    try { const r=await fetch('https://api.exchangerate-api.com/v4/latest/USD'); const d=await r.json(); if(d.rates?.IDR) setUsdToIdr(d.rates.IDR); } catch {}
  }, []);

  // News via CryptoCompare free API
  const fetchNews = useCallback(async () => {
    setNewsLoading(true);
    try {
      const r = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=popular&limit=20');
      const d = await r.json();
      if (d.Data) {
        const mapped: NewsItem[] = d.Data.map((n: any) => ({
          title: n.title,
          url: n.url,
          source: n.source_info?.name || n.source,
          published: new Date(n.published_on * 1000).toLocaleDateString('id-ID', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}),
          summary: n.body?.slice(0, 160) + '...',
          sentiment: n.tags?.toLowerCase().includes('negative') ? 'negative' : n.tags?.toLowerCase().includes('positive') ? 'positive' : 'neutral',
        }));
        setNews(mapped);
      }
    } catch {}
    setNewsLoading(false);
  }, []);

  useEffect(() => {
    fetchBTC(); fetchMarket(); fetchUSDIDR();
    const i1 = setInterval(fetchBTC, 60000);
    const i2 = setInterval(fetchMarket, 300000);
    return () => { clearInterval(i1); clearInterval(i2); };
  }, [fetchBTC, fetchMarket, fetchUSDIDR]);

  useEffect(() => {
    if (activeTab === 'news' && !news.length) fetchNews();
  }, [activeTab, news.length, fetchNews]);

  // Recalc coin amount when IDR value changes in add form
  const handleIDRChange = (val: string) => {
    setAddForm(f => {
      const idr = parseFloat(val);
      if (!isNaN(idr) && selectedCoin) {
        const usd = idr / usdToIdr;
        const amount = usd / selectedCoin.current_price;
        return { ...f, valueIDR: val, amountCoin: isFinite(amount) ? fmtCoin(amount) : '' };
      }
      return { ...f, valueIDR: val };
    });
  };

  const handleCoinAmountChange = (val: string) => {
    setAddForm(f => {
      const amt = parseFloat(val);
      if (!isNaN(amt) && selectedCoin) {
        const idr = amt * selectedCoin.current_price * usdToIdr;
        return { ...f, amountCoin: val, valueIDR: Math.round(idr).toString() };
      }
      return { ...f, amountCoin: val };
    });
  };

  const confirmAdd = () => {
    if (!selectedCoin || !addForm.amountCoin || !addForm.valueIDR) return;
    const newAsset: Asset = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      coinId: selectedCoin.id,
      coinSymbol: selectedCoin.symbol,
      coinName: selectedCoin.name,
      coinImage: selectedCoin.image,
      amountCoin: parseFloat(addForm.amountCoin),
      priceAtBuyUSD: selectedCoin.current_price,
      valueIDR: parseFloat(addForm.valueIDR),
      note: addForm.note,
      type: addForm.type,
    };
    persistAssets([newAsset, ...assets]);
    setShowAddModal(false); setAddStep('select'); setSelectedCoin(null);
    setAddForm({ valueIDR:'', amountCoin:'', note:'', type:'buy' }); setSearchCoin('');
  };

  const startEdit = (a: Asset) => {
    setEditId(a.id);
    setEditForm({ date: a.date.split('T')[0], amountCoin: String(a.amountCoin), priceAtBuyUSD: String(a.priceAtBuyUSD), valueIDR: String(a.valueIDR), note: a.note, type: a.type });
  };
  const saveEdit = () => {
    persistAssets(assets.map(a => a.id!==editId ? a : { ...a, date:new Date(editForm.date).toISOString(), amountCoin:parseFloat(editForm.amountCoin), priceAtBuyUSD:parseFloat(editForm.priceAtBuyUSD), valueIDR:parseFloat(editForm.valueIDR), note:editForm.note, type:editForm.type }));
    setEditId(null);
  };

  // Compute totals
  const buyAssets = assets.filter(a=>a.type==='buy');
  const totalCostIDR = buyAssets.reduce((s,a)=>s+a.valueIDR, 0);
  const currentValueIDR = buyAssets.reduce((s,a)=>s+(a.amountCoin*(currentPrices[a.coinId]||a.priceAtBuyUSD)*usdToIdr), 0);
  const sellRevIDR = assets.filter(a=>a.type==='sell').reduce((s,a)=>s+a.valueIDR,0);
  const profitIDR = currentValueIDR + sellRevIDR - totalCostIDR;
  const profitPct = totalCostIDR > 0 ? (profitIDR / totalCostIDR) * 100 : 0;

  const filteredCoins = marketCoins.filter(c =>
    c.name.toLowerCase().includes(searchCoin.toLowerCase()) ||
    c.symbol.toLowerCase().includes(searchCoin.toLowerCase())
  ).slice(0, 30);

  if (authLoading) return (
    <div className="app"><div className="bg-blobs"><div className="blob blob-1"/><div className="blob blob-2"/><div className="blob blob-3"/></div>
      <div className="splash"><div className="splash-icon">₿</div><div className="splash-text">Memuat...</div></div>
    </div>
  );

  if (!user) return (
    <div className="app">
      <div className="bg-blobs"><div className="blob blob-1"/><div className="blob blob-2"/><div className="blob blob-3"/><div className="blob blob-4"/><div className="blob blob-5"/></div>
      <div className="login-screen">
        <div className="login-card glass-card">
          <div className="login-icon">₿</div>
          <h1 className="login-title">Crypto Savings</h1>
          <p className="login-sub">Lacak portofolio kripto kamu dengan cantik 🍬</p>
          <div className="login-features">
            <div className="lf-item">📊 Dashboard real-time</div>
            <div className="lf-item">🌡️ Fear & Greed Index</div>
            <div className="lf-item">📰 Berita crypto terkini</div>
            <div className="lf-item">☁️ Data tersimpan di cloud</div>
          </div>
          <button className="google-btn" onClick={signInWithGoogle}>
            <svg viewBox="0 0 48 48" className="google-icon"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-9 20-20 0-1.3-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16.1 18.9 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 16.2 4 9.4 8.4 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.3C29.5 35.6 26.9 36.5 24 36.5c-5.2 0-9.6-3.5-11.2-8.2l-6.5 5C9.7 39.9 16.4 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.6l6.2 5.3C40.8 35.3 44 30 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
            Masuk dengan Google
          </button>
          <p className="login-note">Data kamu tersimpan aman di cloud, bisa diakses dari mana saja.</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app">
      <div className="bg-blobs"><div className="blob blob-1"/><div className="blob blob-2"/><div className="blob blob-3"/><div className="blob blob-4"/><div className="blob blob-5"/></div>
      <div className="container">

        {/* Header */}
        <header className="header glass-card">
          <div className="header-left">
            <span className="btc-icon">₿</span>
            <div><h1 className="app-title">Crypto Savings</h1><p className="app-subtitle">Portofolio Kripto Kamu 🍬</p></div>
          </div>
          <div className="header-right">
            {btcData && (
              <div className="live-price">
                <span className="price-label">BTC/USD</span>
                <span className="price-value">{fmtUSD(btcData.price)}</span>
                <span className={`price-change ${btcData.change24h>=0?'green':'red'}`}>{btcData.change24h>=0?'▲':'▼'} {Math.abs(btcData.change24h).toFixed(2)}%</span>
              </div>
            )}
            <div className="user-chip" onClick={signOutUser} title="Logout">
              <img src={user.photoURL||''} alt="" className="user-avatar"/>
              <span className="user-name">{user.displayName?.split(' ')[0]}</span>
              <span className="logout-icon">⏻</span>
            </div>
          </div>
        </header>

        {/* Tabs */}
        <div className="tabs">
          <button className={`tab-btn ${activeTab==='dashboard'?'active':''}`} onClick={()=>setActiveTab('dashboard')}>📊 Dashboard</button>
          <button className={`tab-btn ${activeTab==='history'?'active':''}`} onClick={()=>setActiveTab('history')}>📜 Riwayat</button>
          <button className={`tab-btn ${activeTab==='news'?'active':''}`} onClick={()=>setActiveTab('news')}>📰 Berita</button>
        </div>

        {/* ═══ DASHBOARD ═══════════════════════════════════════════════════════ */}
        {activeTab==='dashboard' && (
          <>
            {/* Stats */}
            <div className="stats-grid">
              <div className="stat-card glass-card candy-pink">
                <div className="stat-icon">💼</div><div className="stat-label">Nilai Portfolio</div>
                <div className="stat-value">{fmtIDR(currentValueIDR)}</div>
                <div className="stat-sub">{fmtUSD(currentValueIDR/usdToIdr)}</div>
              </div>
              <div className="stat-card glass-card candy-teal">
                <div className="stat-icon">🏦</div><div className="stat-label">Total Modal</div>
                <div className="stat-value">{fmtIDR(totalCostIDR)}</div>
                <div className="stat-sub">{fmtUSD(totalCostIDR/usdToIdr)}</div>
              </div>
              <div className={`stat-card glass-card ${profitIDR>=0?'candy-green':'candy-red'}`}>
                <div className="stat-icon">{profitIDR>=0?'📈':'📉'}</div><div className="stat-label">Profit / Rugi</div>
                <div className={`stat-value ${profitIDR>=0?'text-green':'text-red'}`}>{profitIDR>=0?'+':''}{fmtIDR(profitIDR)}</div>
                <div className={`stat-sub ${profitIDR>=0?'text-green':'text-red'}`}>{profitPct>=0?'+':''}{profitPct.toFixed(2)}%</div>
              </div>
              <div className="stat-card glass-card candy-purple">
                <div className="stat-icon">🪙</div><div className="stat-label">Jumlah Aset</div>
                <div className="stat-value">{new Set(buyAssets.map(a=>a.coinId)).size}</div>
                <div className="stat-sub">{assets.length} transaksi</div>
              </div>
            </div>

            {/* Portfolio Donut + Market Sentiment */}
            <div className="two-col-grid">
              <div className="glass-card chart-card">
                <h3 className="section-title">🥧 Komposisi Aset</h3>
                <DonutChart assets={assets} currentPrices={currentPrices} />
              </div>

              <div className="glass-card fg-card">
                <h3 className="section-title">🌡️ Fear & Greed</h3>
                {marketLoading ? <div className="mkt-loading">Memuat...</div>
                  : fearGreed ? <FGGauge value={fearGreed.value} label={fearGreed.label} />
                  : <div className="mkt-loading">Tidak tersedia</div>}
              </div>
            </div>

            {/* Top Gainers & Losers */}
            <div className="glass-card market-card">
              <h3 className="section-title">📡 Pergerakan Market</h3>
              {marketLoading ? <div className="mkt-loading">Memuat data market...</div> : (
                <div className="movers-grid">
                  <div className="movers-col">
                    <div className="movers-head gain-head">🚀 Top 5 Naik</div>
                    {topGainers.map(c=>(
                      <div key={c.id} className="mover-row">
                        <img src={c.image} alt={c.symbol} className="coin-img"/>
                        <div className="coin-info"><span className="coin-sym">{c.symbol.toUpperCase()}</span><span className="coin-px">{fmtUSD(c.current_price)}</span></div>
                        <span className="coin-chg gain">+{c.price_change_percentage_24h.toFixed(2)}%</span>
                      </div>
                    ))}
                  </div>
                  <div className="movers-col">
                    <div className="movers-head loss-head">📉 Top 5 Turun</div>
                    {topLosers.map(c=>(
                      <div key={c.id} className="mover-row">
                        <img src={c.image} alt={c.symbol} className="coin-img"/>
                        <div className="coin-info"><span className="coin-sym">{c.symbol.toUpperCase()}</span><span className="coin-px">{fmtUSD(c.current_price)}</span></div>
                        <span className="coin-chg loss">{c.price_change_percentage_24h.toFixed(2)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button className="add-btn candy-btn" onClick={()=>{setShowAddModal(true);setAddStep('select');}}>＋ Tambah Aset</button>
          </>
        )}

        {/* ═══ HISTORY ═════════════════════════════════════════════════════════ */}
        {activeTab==='history' && (
          <div className="history-section">
            <div className="history-header">
              <h3 className="section-title">📜 Riwayat ({assets.length} transaksi)</h3>
              <button className="add-btn-sm candy-btn" onClick={()=>{setShowAddModal(true);setAddStep('select');}}>＋ Tambah</button>
            </div>
            {assets.length===0 ? (
              <div className="glass-card empty-state"><div className="empty-icon">🪙</div><p>Belum ada aset. Tambah sekarang!</p></div>
            ) : (
              <div className="history-list">
                {assets.map((a,i)=>{
                  const color=CANDY[i%CANDY.length];
                  const isEdit=editId===a.id;
                  const curVal=a.amountCoin*(currentPrices[a.coinId]||a.priceAtBuyUSD)*usdToIdr;
                  const pl=curVal-a.valueIDR;
                  const plPct=a.valueIDR>0?(pl/a.valueIDR)*100:0;
                  return (
                    <div key={a.id} className="history-item glass-card" style={{background:color.bg,borderColor:color.border,boxShadow:`0 0 24px ${color.glow}22`}}>
                      {isEdit ? (
                        <div className="edit-form">
                          <div className="edit-title">✏️ Edit — {a.coinName}</div>
                          <div className="type-toggle">
                            <button className={`type-btn buy-btn ${editForm.type==='buy'?'active':''}`} onClick={()=>setEditForm((f:any)=>({...f,type:'buy'}))}>🟢 Beli</button>
                            <button className={`type-btn sell-btn ${editForm.type==='sell'?'active':''}`} onClick={()=>setEditForm((f:any)=>({...f,type:'sell'}))}>🔴 Jual</button>
                          </div>
                          <div className="edit-grid">
                            <div className="form-group"><label className="form-label">Tanggal</label><input type="date" className="form-input" value={editForm.date} onChange={e=>setEditForm((f:any)=>({...f,date:e.target.value}))}/></div>
                            <div className="form-group"><label className="form-label">Jumlah Koin</label><input type="number" className="form-input" value={editForm.amountCoin} onChange={e=>setEditForm((f:any)=>({...f,amountCoin:e.target.value}))}/></div>
                            <div className="form-group"><label className="form-label">Harga Beli (USD)</label><input type="number" className="form-input" value={editForm.priceAtBuyUSD} onChange={e=>setEditForm((f:any)=>({...f,priceAtBuyUSD:e.target.value}))}/></div>
                            <div className="form-group"><label className="form-label">Nilai (IDR)</label><input type="number" className="form-input" value={editForm.valueIDR} onChange={e=>setEditForm((f:any)=>({...f,valueIDR:e.target.value}))}/></div>
                            <div className="form-group" style={{gridColumn:'1/-1'}}><label className="form-label">Catatan</label><input type="text" className="form-input" value={editForm.note} onChange={e=>setEditForm((f:any)=>({...f,note:e.target.value}))}/></div>
                          </div>
                          <div className="form-actions">
                            <button className="btn-cancel" onClick={()=>setEditId(null)}>Batal</button>
                            <button className="btn-save candy-btn" onClick={saveEdit}>💾 Simpan</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="history-top">
                            <div className="htop-left">
                              <img src={a.coinImage} alt={a.coinSymbol} className="h-coin-img"/>
                              <span className={`tx-badge ${a.type==='sell'?'badge-sell':'badge-buy'}`}>{a.type==='sell'?'JUAL':'BELI'}</span>
                              <span className="history-date">{new Date(a.date).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}</span>
                            </div>
                            <div className="history-actions">
                              <button className="edit-btn" onClick={()=>startEdit(a)}>✏️</button>
                              <button className="delete-btn" onClick={()=>persistAssets(assets.filter(x=>x.id!==a.id))}>✕</button>
                            </div>
                          </div>
                          <div className="h-coin-name">{a.coinName} <span className="h-coin-sym">{a.coinSymbol.toUpperCase()}</span></div>
                          <div className="h-amount">{fmtCoin(a.amountCoin)} {a.coinSymbol.toUpperCase()}</div>
                          {a.note && <div className="history-note">📝 {a.note}</div>}
                          <div className="history-stats">
                            <div className="h-stat"><span className="h-label">Modal</span><span className="h-val">{fmtIDR(a.valueIDR)}</span></div>
                            <div className="h-stat"><span className="h-label">Nilai Kini</span><span className="h-val">{fmtIDR(curVal)}</span></div>
                            <div className="h-stat"><span className="h-label">P/L</span><span className={`h-val ${pl>=0?'text-green':'text-red'}`}>{pl>=0?'+':''}{plPct.toFixed(1)}%</span></div>
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

        {/* ═══ NEWS ════════════════════════════════════════════════════════════ */}
        {activeTab==='news' && (
          <div className="news-section">
            <div className="news-header">
              <h3 className="section-title">📰 Berita Crypto Terkini</h3>
              <button className="refresh-btn" onClick={fetchNews} disabled={newsLoading}>{newsLoading?'⏳':'🔄'}</button>
            </div>
            {newsLoading ? (
              <div className="glass-card empty-state"><div className="empty-icon">📡</div><p>Memuat berita terkini...</p></div>
            ) : news.length===0 ? (
              <div className="glass-card empty-state"><div className="empty-icon">📰</div><p>Belum ada berita. Tekan 🔄 untuk muat.</p></div>
            ) : (
              <div className="news-list">
                {news.map((n,i)=>(
                  <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="news-card glass-card">
                    <div className="news-top">
                      <span className={`news-badge badge-${n.sentiment}`}>{n.sentiment==='positive'?'🟢 Bullish':n.sentiment==='negative'?'🔴 Bearish':'⚪ Netral'}</span>
                      <span className="news-source">{n.source}</span>
                      <span className="news-time">{n.published}</span>
                    </div>
                    <div className="news-title">{n.title}</div>
                    <div className="news-summary">{n.summary}</div>
                    <div className="news-readmore">Baca selengkapnya →</div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        <footer className="footer">
          <span>Data: CoinGecko • Alternative.me • CryptoCompare</span>
          <span className="live-dot">● LIVE</span>
        </footer>
      </div>

      {/* ═══ ADD ASSET MODAL ══════════════════════════════════════════════════ */}
      {showAddModal && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget){setShowAddModal(false);setAddStep('select');setSelectedCoin(null);}}}>
          <div className="modal-card glass-card">
            {addStep==='select' ? (
              <>
                <div className="modal-header">
                  <h3 className="modal-title">🪙 Pilih Aset</h3>
                  <button className="modal-close" onClick={()=>{setShowAddModal(false);setSearchCoin('');}}>✕</button>
                </div>
                <input className="form-input coin-search" placeholder="🔍 Cari nama atau simbol..." value={searchCoin} onChange={e=>setSearchCoin(e.target.value)} autoFocus/>
                <div className="coin-list">
                  {filteredCoins.map(c=>(
                    <div key={c.id} className="coin-row" onClick={()=>{setSelectedCoin(c);setAddStep('form');}}>
                      <img src={c.image} alt={c.symbol} className="coin-row-img"/>
                      <div className="coin-row-info">
                        <span className="coin-row-name">{c.name}</span>
                        <span className="coin-row-sym">{c.symbol.toUpperCase()}</span>
                      </div>
                      <div className="coin-row-right">
                        <span className="coin-row-price">{fmtUSD(c.current_price)}</span>
                        <span className={`coin-row-chg ${c.price_change_percentage_24h>=0?'gain':'loss'}`}>{c.price_change_percentage_24h>=0?'+':''}{c.price_change_percentage_24h.toFixed(2)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : selectedCoin && (
              <>
                <div className="modal-header">
                  <button className="back-btn" onClick={()=>{setAddStep('select');setAddForm({valueIDR:'',amountCoin:'',note:'',type:'buy'});}}>← Kembali</button>
                  <h3 className="modal-title">{selectedCoin.name}</h3>
                  <button className="modal-close" onClick={()=>{setShowAddModal(false);setAddStep('select');setSelectedCoin(null);}}>✕</button>
                </div>
                <div className="selected-coin-info">
                  <img src={selectedCoin.image} alt="" className="sel-coin-img"/>
                  <div>
                    <div className="sel-coin-price">{fmtUSD(selectedCoin.current_price)}</div>
                    <div className={`sel-coin-chg ${selectedCoin.price_change_percentage_24h>=0?'green':'red'}`}>{selectedCoin.price_change_percentage_24h>=0?'▲':'▼'} {Math.abs(selectedCoin.price_change_percentage_24h).toFixed(2)}%</div>
                  </div>
                </div>
                <div className="type-toggle">
                  <button className={`type-btn buy-btn ${addForm.type==='buy'?'active':''}`} onClick={()=>setAddForm(f=>({...f,type:'buy'}))}>🟢 Beli</button>
                  <button className={`type-btn sell-btn ${addForm.type==='sell'?'active':''}`} onClick={()=>setAddForm(f=>({...f,type:'sell'}))}>🔴 Jual</button>
                </div>
                <div className="form-group">
                  <label className="form-label">Nilai (Rupiah)</label>
                  <div className="input-prefix-wrap"><span className="input-prefix">Rp</span><input type="number" className="form-input input-with-prefix" placeholder="Contoh: 500000" value={addForm.valueIDR} onChange={e=>handleIDRChange(e.target.value)}/></div>
                </div>
                <div className="form-group">
                  <label className="form-label">Jumlah {selectedCoin.symbol.toUpperCase()}</label>
                  <input type="number" className="form-input" placeholder="Otomatis terhitung" value={addForm.amountCoin} onChange={e=>handleCoinAmountChange(e.target.value)} step="any"/>
                </div>
                <div className="form-group">
                  <label className="form-label">Catatan (opsional)</label>
                  <input type="text" className="form-input" placeholder="Contoh: DCA mingguan" value={addForm.note} onChange={e=>setAddForm(f=>({...f,note:e.target.value}))}/>
                </div>
                <div className="form-actions">
                  <button className="btn-cancel" onClick={()=>{setShowAddModal(false);setAddStep('select');setSelectedCoin(null);}}>Batal</button>
                  <button className="btn-save candy-btn" onClick={confirmAdd}>💾 Simpan</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
