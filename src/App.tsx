import React, { useState, useEffect, useCallback, useRef } from 'react';
import { signInWithGoogle, signOutUser, onAuthChange, saveSavingsToCloud, loadSavingsFromCloud, User } from './firebase';
import * as XLSX from 'xlsx';
import './App.css';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Asset {
  id: string; date: string; coinId: string; coinSymbol: string; coinName: string;
  coinImage: string; amountCoin: number; priceAtBuyUSD: number; valueIDR: number;
  note: string; type: 'buy' | 'sell';
}
interface BTCData { price: number; change24h: number; lastUpdated: string; }
interface FearGreed { value: number; label: string; }
interface CoinMarket { id: string; symbol: string; name: string; image: string; current_price: number; price_change_percentage_1h_in_currency?: number; price_change_percentage_4h_in_currency?: number; price_change_percentage_24h: number; market_cap: number; }
interface NewsItem { title: string; url: string; source: string; published: string; publishedRaw: Date; summary: string; sentiment: 'positive' | 'negative' | 'neutral'; }

const fmtIDR = (v: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
const fmtUSD = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const fmtCoin = (v: number) => v < 0.01 ? v.toFixed(8) : v < 1 ? v.toFixed(4) : v.toFixed(2);
const fmtDateTime = (d: Date) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const relTime = (d: Date) => { const m = Math.floor((Date.now() - d.getTime()) / 60000); if (m < 60) return `${m} menit lalu`; const h = Math.floor(m / 60); if (h < 24) return `${h} jam lalu`; return `${Math.floor(h / 24)} hari lalu`; };

const CANDY = [
  { glow: '#ff6eb4', bg: 'rgba(255,110,180,0.18)', border: 'rgba(255,110,180,0.45)' },
  { glow: '#7c6fff', bg: 'rgba(124,111,255,0.18)', border: 'rgba(124,111,255,0.45)' },
  { glow: '#43e8d8', bg: 'rgba(67,232,216,0.18)',  border: 'rgba(67,232,216,0.45)'  },
  { glow: '#ffb347', bg: 'rgba(255,179,71,0.18)',  border: 'rgba(255,179,71,0.45)'  },
  { glow: '#a8ff78', bg: 'rgba(168,255,120,0.18)', border: 'rgba(168,255,120,0.45)' },
  { glow: '#ff7f7f', bg: 'rgba(255,127,127,0.18)', border: 'rgba(255,127,127,0.45)' },
];

// ─── Fear & Greed Gauge ───────────────────────────────────────────────────────
function FGGauge({ value, label }: FearGreed) {
  const clamped = Math.max(0, Math.min(100, value));
  const angleDeg = -180 + (clamped / 100) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  const cx = 100, cy = 90, r = 68, nl = 54;
  const nx = cx + nl * Math.cos(angleRad), ny = cy + nl * Math.sin(angleRad);
  const col = clamped <= 20 ? '#ef4444' : clamped <= 40 ? '#f97316' : clamped <= 60 ? '#eab308' : clamped <= 80 ? '#84cc16' : '#22c55e';
  const arc = (s: number, e: number, c: string) => {
    const tr = (d: number) => d * Math.PI / 180;
    return <path d={`M${cx + r * Math.cos(tr(s))} ${cy + r * Math.sin(tr(s))} A${r} ${r} 0 0 1 ${cx + r * Math.cos(tr(e))} ${cy + r * Math.sin(tr(e))}`} stroke={c} strokeWidth="13" fill="none" strokeLinecap="round" />;
  };
  return (
    <div className="fg-gauge-wrap">
      <svg viewBox="0 0 200 108" className="fg-svg">
        <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`} stroke="rgba(255,255,255,0.07)" strokeWidth="13" fill="none" />
        {arc(-180, -144, '#ef4444')}{arc(-144, -108, '#f97316')}{arc(-108, -72, '#eab308')}{arc(-72, -36, '#84cc16')}{arc(-36, 0, '#22c55e')}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={col} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill={col} />
        <text x={cx} y={cy - 12} textAnchor="middle" fill="#fff" fontSize="21" fontWeight="900" fontFamily="Nunito">{value}</text>
        <text x={cx} y={cy + 4} textAnchor="middle" fill={col} fontSize="8.5" fontWeight="800" fontFamily="Nunito">{label.toUpperCase()}</text>
        <text x={cx - r + 2} y={cy + 16} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="6.5">FEAR</text>
        <text x={cx + r - 2} y={cy + 16} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="6.5">GREED</text>
      </svg>
    </div>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
function DonutChart({ assets, currentPrices }: { assets: Asset[], currentPrices: Record<string, number> }) {
  const palette = [
    { solid: '#ff6eb4', glow: 'rgba(255,110,180,0.5)' },
    { solid: '#a78bfa', glow: 'rgba(167,139,250,0.5)' },
    { solid: '#43e8d8', glow: 'rgba(67,232,216,0.5)' },
    { solid: '#ffb347', glow: 'rgba(255,179,71,0.5)'  },
    { solid: '#a8ff78', glow: 'rgba(168,255,120,0.5)' },
    { solid: '#f472b6', glow: 'rgba(244,114,182,0.5)' },
    { solid: '#60a5fa', glow: 'rgba(96,165,250,0.5)'  },
    { solid: '#fb923c', glow: 'rgba(251,146,60,0.5)'  },
  ];
  const [hovered, setHovered] = React.useState<string|null>(null);
  const grouped: Record<string, { value: number; color: typeof palette[0]; symbol: string; name: string; image: string }> = {};
  let ci = 0;
  assets.filter(a => a.type === 'buy').forEach(a => {
    const val = a.amountCoin * (currentPrices[a.coinId] || a.priceAtBuyUSD);
    if (!grouped[a.coinId]) grouped[a.coinId] = { value: 0, color: palette[ci++ % palette.length], symbol: a.coinSymbol, name: a.coinName, image: a.coinImage };
    grouped[a.coinId].value += val;
  });
  const entries = Object.entries(grouped).sort((a, b) => b[1].value - a[1].value);
  const total = entries.reduce((s, [, v]) => s + v.value, 0);
  if (!total) return (
    <div className="donut-empty-fancy">
      <div className="donut-empty-icon">💎</div>
      <p>Belum ada aset</p>
      <span>Tambah aset pertama kamu!</span>
    </div>
  );
  const cx = 80, cy = 80, r = 62, ir = 42, gap = 2.5;
  let angle = -90;
  const toR = (d: number) => d * Math.PI / 180;
  const slices = entries.map(([id, { value, color, symbol, name, image }]) => {
    const pct = value / total;
    const sweep = pct * 360 - gap;
    const startA = angle + gap / 2; angle += pct * 360;
    const x1 = cx + r * Math.cos(toR(startA)), y1 = cy + r * Math.sin(toR(startA));
    const x2 = cx + r * Math.cos(toR(startA + sweep)), y2 = cy + r * Math.sin(toR(startA + sweep));
    const ix1 = cx + ir * Math.cos(toR(startA)), iy1 = cy + ir * Math.sin(toR(startA));
    const ix2 = cx + ir * Math.cos(toR(startA + sweep)), iy2 = cy + ir * Math.sin(toR(startA + sweep));
    const large = sweep > 180 ? 1 : 0;
    const midA = startA + sweep / 2;
    const labelR = (r + ir) / 2;
    const lx = cx + labelR * Math.cos(toR(midA)), ly = cy + labelR * Math.sin(toR(midA));
    return { id, color, symbol, name, image, pct, path: `M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} L${ix2} ${iy2} A${ir} ${ir} 0 ${large} 0 ${ix1} ${iy1} Z`, lx, ly };
  });
  const hovSlice = hovered ? slices.find(s => s.id === hovered) : null;
  return (
    <div className="donut-wrap-v2">
      <div className="donut-svg-wrap">
        <svg viewBox="0 0 160 160" className="donut-svg-v2">
          <defs>
            {slices.map(s => (
              <filter key={`glow-${s.id}`} id={`glow-${s.id}`} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            ))}
          </defs>
          {/* Track */}
          <circle cx={cx} cy={cy} r={(r+ir)/2} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={r-ir}/>
          {slices.map(s => (
            <path key={s.id} d={s.path}
              fill={s.color.solid}
              opacity={hovered === null ? 0.88 : hovered === s.id ? 1 : 0.35}
              filter={hovered === s.id ? `url(#glow-${s.id})` : undefined}
              style={{ transform: hovered === s.id ? `scale(1.04)` : 'scale(1)', transformOrigin: `${cx}px ${cy}px`, transition: 'all 0.2s', cursor: 'pointer' }}
              onMouseEnter={() => setHovered(s.id)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
          {/* Show % label only for slices > 8% */}
          {slices.filter(s => s.pct > 0.08).map(s => (
            <text key={`lbl-${s.id}`} x={s.lx} y={s.ly} textAnchor="middle" dominantBaseline="middle"
              fill="#fff" fontSize="6.5" fontWeight="900" fontFamily="Nunito" style={{pointerEvents:'none'}}>
              {(s.pct*100).toFixed(0)}%
            </text>
          ))}
          {/* Center */}
          {hovSlice ? (
            <>
              <text x={cx} y={cy-10} textAnchor="middle" fill="#fff" fontSize="8.5" fontWeight="900" fontFamily="Nunito">{hovSlice.symbol.toUpperCase()}</text>
              <text x={cx} y={cy+2}  textAnchor="middle" fill={hovSlice.color.solid} fontSize="9.5" fontWeight="900" fontFamily="Nunito">{(hovSlice.pct*100).toFixed(1)}%</text>
              <text x={cx} y={cy+13} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="6" fontFamily="Nunito">{hovSlice.name.length > 10 ? hovSlice.name.slice(0,10)+'…' : hovSlice.name}</text>
            </>
          ) : (
            <>
              <text x={cx} y={cy-5} textAnchor="middle" fill="#fff" fontSize="8" fontWeight="700" fontFamily="Nunito">Portfolio</text>
              <text x={cx} y={cy+7} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="6.5" fontFamily="Nunito">{entries.length} aset</text>
            </>
          )}
        </svg>
      </div>
      <div className="donut-legend-v2">
        {slices.slice(0, 6).map(s => (
          <div key={s.id} className={`legend-row-v2 ${hovered === s.id ? 'hovered' : ''}`}
            onMouseEnter={() => setHovered(s.id)} onMouseLeave={() => setHovered(null)}>
            <span className="legend-dot-v2" style={{ background: s.color.solid, boxShadow: `0 0 6px ${s.color.glow}` }}/>
            <div className="legend-info">
              <span className="legend-sym-v2">{s.symbol.toUpperCase()}</span>
              <span className="legend-name-v2">{s.name.length > 9 ? s.name.slice(0,9)+'…' : s.name}</span>
            </div>
            <span className="legend-pct-v2" style={{ color: s.color.solid }}>{(s.pct * 100).toFixed(1)}%</span>
          </div>
        ))}
        {slices.length > 6 && <div className="legend-more">+{slices.length - 6} lainnya</div>}
      </div>
    </div>
  );
}

// ─── Excel date parser ────────────────────────────────────────────────────────
function parseExcelDate(raw: any): string | null {
  if (!raw) return null;
  if (typeof raw === 'number') { const d = XLSX.SSF.parse_date_code(raw); if (d) return new Date(d.y, d.m - 1, d.d).toISOString(); }
  if (typeof raw === 'string') {
    const c = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(c)) { const d = new Date(c); if (!isNaN(d.getTime())) return d.toISOString(); }
    const months: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const m2 = c.match(/^(\d+)-([A-Za-z]+)\s*(\d{4})/);
    if (m2) { const mo = months[m2[2].toLowerCase().slice(0, 3)]; if (mo !== undefined) return new Date(parseInt(m2[3]), mo, parseInt(m2[1])).toISOString(); }
    const m3 = c.match(/^(\d+)\s+([A-Za-z]+)\s+(\d{4})/);
    if (m3) { const mo = months[m3[2].toLowerCase().slice(0, 3)]; if (mo !== undefined) return new Date(parseInt(m3[3]), mo, parseInt(m3[1])).toISOString(); }
  }
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw.toISOString();
  return null;
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [btcData, setBtcData] = useState<BTCData | null>(null);
  const [usdToIdr, setUsdToIdr] = useState(16200);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'news'>('dashboard');
  const [fearGreed, setFearGreed] = useState<FearGreed | null>(null);
  const [marketCoins, setMarketCoins] = useState<CoinMarket[]>([]);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketTimeframe, setMarketTimeframe] = useState<'1h'|'4h'|'24h'>('24h');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addStep, setAddStep] = useState<'select' | 'form'>('select');
  const [selectedCoin, setSelectedCoin] = useState<CoinMarket | null>(null);
  const [searchCoin, setSearchCoin] = useState('');
  const [addForm, setAddForm] = useState({ valueIDR: '', amountCoin: '', note: '', type: 'buy' as 'buy' | 'sell' });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  // pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // import/export
  const [showImport, setShowImport] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'idle' | 'preview' | 'success' | 'error'; message: string; preview?: Asset[] }>({ type: 'idle', message: '' });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<any>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => { return onAuthChange(u => { setUser(u); setAuthLoading(false); }); }, []);

  useEffect(() => {
    if (!user) {
      // User logged out — keep showing assets from memory (already loaded)
      // Don't clear so data isn't lost on logout
      return;
    }
    // User logged in — load their specific data
    loadSavingsFromCloud(user.uid).then(data => { setAssets(data); });
  }, [user]);

  const persistAssets = useCallback((data: Asset[]) => {
    setAssets(data);
    if (user) { clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => saveSavingsToCloud(user.uid, data), 1500); }
  }, [user]);

  // ── Fetches ───────────────────────────────────────────────────────────────
  const fetchBTC = useCallback(async () => {
    try { const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true'); const d = await r.json(); setBtcData({ price: d.bitcoin.usd, change24h: d.bitcoin.usd_24h_change, lastUpdated: new Date().toLocaleTimeString('id-ID') }); } catch {}
  }, []);

  const fetchMarket = useCallback(async () => {
    setMarketLoading(true);
    try {
      const [fgR, coinsR] = await Promise.all([
        fetch('https://api.alternative.me/fng/'),
        fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&sparkline=false&price_change_percentage=1h%2C4h%2C24h')
      ]);
      const fg = await fgR.json();
      if (fg.data?.[0]) setFearGreed({ value: parseInt(fg.data[0].value), label: fg.data[0].value_classification });
      const coins: CoinMarket[] = await coinsR.json();
      setMarketCoins(coins);
      // gainers/losers computed in render based on marketTimeframe
      const prices: Record<string, number> = {}; coins.forEach(c => prices[c.id] = c.current_price); setCurrentPrices(prices);
    } catch {} finally { setMarketLoading(false); }
  }, []);

  const fetchUSDIDR = useCallback(async () => {
    try { const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD'); const d = await r.json(); if (d.rates?.IDR) setUsdToIdr(d.rates.IDR); } catch {}
  }, []);

  const fetchNews = useCallback(async () => {
    setNewsLoading(true);
    setNews([]);
    const allNews: NewsItem[] = [];
    const cacheBust = `&_=${Date.now()}`;

    // Source 1: mktnews.net via RSS proxy (try multiple feed URLs)
    const mktFeedUrls = ['https://mktnews.net/feed', 'https://mktnews.net/feed/', 'https://mktnews.net/rss', 'https://mktnews.net/?feed=rss2'];
    for (const feedUrl of mktFeedUrls) {
    try {
      const mktRes = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}&count=15${cacheBust}`);
      const mktData = await mktRes.json();
      if (mktData.status === 'ok' && mktData.items?.length) {
        mktData.items.forEach((item: any) => {
          const pub = new Date(item.pubDate);
          const titleLower = (item.title || '').toLowerCase();
          const sentiment = titleLower.match(/surge|rally|bull|rise|pump|gain|high|moon|up|soar/) ? 'positive'
            : titleLower.match(/crash|drop|fall|bear|dump|fear|low|down|plunge|sell/) ? 'negative' : 'neutral';
          allNews.push({
            title: item.title, url: item.link, source: 'MktNews',
            published: fmtDateTime(pub), publishedRaw: pub,
            summary: item.description?.replace(/<[^>]+>/g, '').slice(0, 160) + '...' || '',
            sentiment,
          });
        });
      }
      break; // success, stop trying
    } catch {}
    } // end for loop

    // Source 2: CryptoCompare
    try {
      const r = await fetch(`https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest&limit=20&_=${Date.now()}`);
      const d = await r.json();
      if (d.Data) {
        d.Data.forEach((n: any) => {
          const pub = new Date(n.published_on * 1000);
          const tags = (n.tags || '').toLowerCase();
          const sentiment = tags.includes('positive') ? 'positive' : tags.includes('negative') ? 'negative' : 'neutral';
          allNews.push({
            title: n.title, url: n.url,
            source: n.source_info?.name || n.source,
            published: fmtDateTime(pub), publishedRaw: pub,
            summary: n.body?.slice(0, 160) + '...' || '',
            sentiment,
          });
        });
      }
    } catch {}

    // Source 3: CoinGecko news
    try {
      const r2 = await fetch(`https://api.coingecko.com/api/v3/news?_=${Date.now()}`);
      const d2 = await r2.json();
      if (d2.data) {
        d2.data.slice(0, 10).forEach((n: any) => {
          const pub = n.updated_at ? new Date(n.updated_at * 1000) : new Date();
          allNews.push({
            title: n.title, url: n.url, source: n.author || 'CoinGecko',
            published: fmtDateTime(pub), publishedRaw: pub,
            summary: n.description?.slice(0, 160) + '...' || '',
            sentiment: 'neutral',
          });
        });
      }
    } catch {}

    // Sort by newest first, deduplicate by title
    const seen = new Set<string>();
    const deduped = allNews
      .sort((a, b) => b.publishedRaw.getTime() - a.publishedRaw.getTime())
      .filter(n => { const k = n.title.slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; });

    setNews(deduped);
    setNewsLoading(false);
  }, []);

  useEffect(() => {
    fetchBTC(); fetchMarket(); fetchUSDIDR();
    const i1 = setInterval(fetchBTC, 60000); const i2 = setInterval(fetchMarket, 300000);
    return () => { clearInterval(i1); clearInterval(i2); };
  }, [fetchBTC, fetchMarket, fetchUSDIDR]);

  useEffect(() => { if (activeTab === 'news') fetchNews(); }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Add Asset ─────────────────────────────────────────────────────────────
  const handleIDRChange = (val: string) => {
    setAddForm(f => {
      const idr = parseFloat(val);
      if (!isNaN(idr) && selectedCoin) { const amount = (idr / usdToIdr) / selectedCoin.current_price; return { ...f, valueIDR: val, amountCoin: isFinite(amount) ? fmtCoin(amount) : '' }; }
      return { ...f, valueIDR: val };
    });
  };
  const handleCoinAmountChange = (val: string) => {
    setAddForm(f => {
      const amt = parseFloat(val);
      if (!isNaN(amt) && selectedCoin) { return { ...f, amountCoin: val, valueIDR: Math.round(amt * selectedCoin.current_price * usdToIdr).toString() }; }
      return { ...f, amountCoin: val };
    });
  };
  const confirmAdd = () => {
    if (!selectedCoin || !addForm.amountCoin || !addForm.valueIDR) return;
    persistAssets([{ id: Date.now().toString(), date: new Date().toISOString(), coinId: selectedCoin.id, coinSymbol: selectedCoin.symbol, coinName: selectedCoin.name, coinImage: selectedCoin.image, amountCoin: parseFloat(addForm.amountCoin), priceAtBuyUSD: selectedCoin.current_price, valueIDR: parseFloat(addForm.valueIDR), note: addForm.note, type: addForm.type }, ...assets]);
    setShowAddModal(false); setAddStep('select'); setSelectedCoin(null); setAddForm({ valueIDR: '', amountCoin: '', note: '', type: 'buy' }); setSearchCoin('');
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const startEdit = (a: Asset) => { setEditId(a.id); setEditForm({ date: a.date.split('T')[0], amountCoin: String(a.amountCoin), priceAtBuyUSD: String(a.priceAtBuyUSD), valueIDR: String(a.valueIDR), note: a.note, type: a.type }); };
  const saveEdit = () => { persistAssets(assets.map(a => a.id !== editId ? a : { ...a, date: new Date(editForm.date).toISOString(), amountCoin: parseFloat(editForm.amountCoin), priceAtBuyUSD: parseFloat(editForm.priceAtBuyUSD), valueIDR: parseFloat(editForm.valueIDR), note: editForm.note, type: editForm.type })); setEditId(null); };

  // ── Import Excel ──────────────────────────────────────────────────────────
  const parseExcelFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames.includes('Sheet1') ? 'Sheet1' : wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        let dataStart = 7;
        for (let i = 0; i < rows.length; i++) { if (String(rows[i][1] || '').includes('Jumlah')) { dataStart = i + 1; break; } }
        const parsed: Asset[] = [];
        for (let i = dataStart; i < rows.length; i++) {
          const row = rows[i];
          const dateStr = parseExcelDate(row[0]);
          const btcAmt = parseFloat(String(row[1]));
          if (!dateStr || isNaN(btcAmt) || btcAmt <= 0) continue;
          const hargaIDR = parseFloat(String(row[2] || 0));
          const valueIDR = btcAmt * hargaIDR;
          parsed.push({ id: `xl_${i}_${Date.now()}`, date: dateStr, coinId: 'bitcoin', coinSymbol: 'btc', coinName: 'Bitcoin', coinImage: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png', amountCoin: btcAmt, priceAtBuyUSD: hargaIDR > 0 ? hargaIDR / usdToIdr : 0, valueIDR: valueIDR > 0 ? valueIDR : btcAmt * hargaIDR, note: row[8] && String(row[8]).trim() ? String(row[8]).trim() : '', type: 'buy' });
        }
        if (parsed.length === 0) { setImportStatus({ type: 'error', message: 'Tidak ada data valid yang ditemukan.' }); return; }
        setImportStatus({ type: 'preview', message: `Ditemukan ${parsed.length} transaksi`, preview: parsed });
      } catch { setImportStatus({ type: 'error', message: 'Gagal membaca file.' }); }
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmImport = (replace: boolean) => {
    if (!importStatus.preview) return;
    const newData = replace ? importStatus.preview : [...importStatus.preview, ...assets];
    const seen = new Set<string>();
    persistAssets(newData.filter(s => { const k = `${s.date}_${s.amountCoin}`; if (seen.has(k)) return false; seen.add(k); return true; }));
    setImportStatus({ type: 'success', message: `✅ Berhasil import ${importStatus.preview.length} transaksi!` });
    setTimeout(() => setShowImport(false), 1500);
  };

  // ── Download Report ───────────────────────────────────────────────────────
  const downloadReport = () => {
    const headers = ['No', 'Tanggal', 'Aset', 'Tipe', 'Jumlah', 'Harga Beli (USD)', 'Modal (IDR)', 'Nilai Kini (IDR)', 'P/L (IDR)', 'P/L (%)', 'Catatan'];
    const rows = assets.map((a, i) => {
      const curVal = a.amountCoin * (currentPrices[a.coinId] || a.priceAtBuyUSD) * usdToIdr;
      const pl = curVal - a.valueIDR;
      const plPct = a.valueIDR > 0 ? (pl / a.valueIDR) * 100 : 0;
      return [i + 1, new Date(a.date).toLocaleDateString('id-ID'), a.coinName + ' (' + a.coinSymbol.toUpperCase() + ')', a.type === 'buy' ? 'Beli' : 'Jual', fmtCoin(a.amountCoin), a.priceAtBuyUSD.toFixed(2), a.valueIDR.toFixed(0), curVal.toFixed(0), pl.toFixed(0), plPct.toFixed(2) + '%', a.note || '-'];
    });
    const totalCost = assets.filter(a => a.type === 'buy').reduce((s, a) => s + a.valueIDR, 0);
    const totalCurr = assets.reduce((s, a) => { const cv = a.amountCoin * (currentPrices[a.coinId] || a.priceAtBuyUSD) * usdToIdr; return a.type === 'buy' ? s + cv : s - cv; }, 0);
    const totalPL = totalCurr - totalCost;

    const wb = XLSX.utils.book_new();
    const summaryData = [
      ['LAPORAN PORTOFOLIO CRYPTO'], [''],
      ['Tanggal Cetak', new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
      ['Nama', user?.displayName || '-'],
      [''],
      ['RINGKASAN'],
      ['Total Modal', fmtIDR(totalCost)],
      ['Nilai Portfolio', fmtIDR(totalCurr)],
      ['Total P/L', fmtIDR(totalPL)],
      ['P/L (%)', (totalCost > 0 ? (totalPL / totalCost) * 100 : 0).toFixed(2) + '%'],
      ['Kurs USD/IDR', fmtIDR(usdToIdr)],
      ['Harga BTC', btcData ? fmtUSD(btcData.price) : '-'],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan');

    const wsData = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, wsData, 'Detail Transaksi');

    XLSX.writeFile(wb, `laporan-crypto-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // ── Computed ──────────────────────────────────────────────────────────────
  const buyAssets = assets.filter(a => a.type === 'buy');
  const totalCostIDR = buyAssets.reduce((s, a) => s + a.valueIDR, 0);
  const currentValueIDR = buyAssets.reduce((s, a) => s + (a.amountCoin * (currentPrices[a.coinId] || a.priceAtBuyUSD) * usdToIdr), 0);
  const sellRevIDR = assets.filter(a => a.type === 'sell').reduce((s, a) => s + a.valueIDR, 0);
  const profitIDR = currentValueIDR + sellRevIDR - totalCostIDR;
  const profitPct = totalCostIDR > 0 ? (profitIDR / totalCostIDR) * 100 : 0;
  const filteredCoins = marketCoins.filter(c => c.name.toLowerCase().includes(searchCoin.toLowerCase()) || c.symbol.toLowerCase().includes(searchCoin.toLowerCase())).slice(0, 50);

  if (authLoading) return (
    <div className="app"><div className="bg-blobs"><div className="blob blob-1" /><div className="blob blob-2" /><div className="blob blob-3" /></div>
      <div className="splash"><div className="splash-icon">₿</div><div className="splash-text">Memuat...</div></div>
    </div>
  );

  if (!user) return (
    <div className="app">
      <div className="bg-blobs"><div className="blob blob-1" /><div className="blob blob-2" /><div className="blob blob-3" /><div className="blob blob-4" /><div className="blob blob-5" /></div>
      <div className="login-screen">
        <div className="login-card glass-card">
          <div className="login-icon">₿</div>
          <h1 className="login-title">Crypto Savings</h1>
          <p className="login-sub">Lacak portofolio kripto kamu dengan cantik 🍬</p>
          <div className="login-features">
            <div className="lf-item">📊 Dashboard real-time</div>
            <div className="lf-item">🌡️ Fear & Greed Index</div>
            <div className="lf-item">📰 Berita mktnews.net</div>
            <div className="lf-item">☁️ Data tersimpan di cloud</div>
          </div>
          <button className="google-btn" onClick={signInWithGoogle}>
            <svg viewBox="0 0 48 48" className="google-icon"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-9 20-20 0-1.3-.1-2.7-.4-4z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16.1 18.9 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 16.2 4 9.4 8.4 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.3C29.5 35.6 26.9 36.5 24 36.5c-5.2 0-9.6-3.5-11.2-8.2l-6.5 5C9.7 39.9 16.4 44 24 44z" /><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.6l6.2 5.3C40.8 35.3 44 30 44 24c0-1.3-.1-2.7-.4-4z" /></svg>
            Masuk dengan Google
          </button>
          <p className="login-note">Data kamu tersimpan aman di cloud.</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app">
      <div className="bg-blobs"><div className="blob blob-1" /><div className="blob blob-2" /><div className="blob blob-3" /><div className="blob blob-4" /><div className="blob blob-5" /></div>
      <div className="container">

        {/* Header */}
        <header className="header glass-card">
          <div className="header-left">
            <span className="btc-icon">₿</span>
            <div><h1 className="app-title">Crypto Savings</h1><p className="app-subtitle">Portofolio Kripto Kamu 🍬</p></div>
          </div>
          <div className="header-right">
            {btcData && (<div className="live-price"><span className="price-label">BTC/USD</span><span className="price-value">{fmtUSD(btcData.price)}</span><span className={`price-change ${btcData.change24h >= 0 ? 'green' : 'red'}`}>{btcData.change24h >= 0 ? '▲' : '▼'} {Math.abs(btcData.change24h).toFixed(2)}%</span></div>)}
            <div className="user-chip" onClick={signOutUser} title="Logout">
              <img src={user.photoURL || ''} alt="" className="user-avatar" />
              <span className="user-name">{user.displayName?.split(' ')[0]}</span>
              <span className="logout-icon">⏻</span>
            </div>
          </div>
        </header>

        {/* Tabs */}
        <div className="tabs">
          <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>📊 Dashboard</button>
          <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => { setActiveTab('history'); setCurrentPage(1); }}>📜 Riwayat</button>
          <button className={`tab-btn ${activeTab === 'news' ? 'active' : ''}`} onClick={() => setActiveTab('news')}>📰 Berita</button>
        </div>

        {/* ═══ DASHBOARD ═══════════════════════════════════════════════════════ */}
        {activeTab === 'dashboard' && (
          <>
            <div className="stats-grid">
              <div className="stat-card glass-card candy-pink"><div className="stat-icon">💼</div><div className="stat-label">Nilai Portfolio</div><div className="stat-value">{fmtIDR(currentValueIDR)}</div><div className="stat-sub">{fmtUSD(currentValueIDR / usdToIdr)}</div></div>
              <div className="stat-card glass-card candy-teal"><div className="stat-icon">🏦</div><div className="stat-label">Total Modal</div><div className="stat-value">{fmtIDR(totalCostIDR)}</div><div className="stat-sub">{fmtUSD(totalCostIDR / usdToIdr)}</div></div>
              <div className={`stat-card glass-card ${profitIDR >= 0 ? 'candy-green' : 'candy-red'}`}>
                <div className="stat-icon">{profitIDR >= 0 ? '📈' : '📉'}</div><div className="stat-label">Profit / Rugi</div>
                <div className={`stat-value ${profitIDR >= 0 ? 'text-green' : 'text-red'}`}>{profitIDR >= 0 ? '+' : ''}{fmtIDR(profitIDR)}</div>
                <div className={`stat-sub ${profitIDR >= 0 ? 'text-green' : 'text-red'}`}>{profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%</div>
              </div>
              <div className="stat-card glass-card candy-purple"><div className="stat-icon">🪙</div><div className="stat-label">Jumlah Aset</div><div className="stat-value">{new Set(buyAssets.map(a => a.coinId)).size}</div><div className="stat-sub">{assets.length} transaksi</div></div>
            </div>

            <div className="two-col-grid">
              <div className="glass-card chart-card"><h3 className="section-title">🥧 Komposisi Aset</h3><DonutChart assets={assets} currentPrices={currentPrices} /></div>
              <div className="glass-card fg-card">
                <h3 className="section-title" style={{textAlign:'center'}}>🌡️ Fear & Greed</h3>
                <div className="fg-center-wrap">
                  {marketLoading ? <div className="mkt-loading">Memuat...</div> : fearGreed ? <FGGauge value={fearGreed.value} label={fearGreed.label} /> : <div className="mkt-loading">Tidak tersedia</div>}
                </div>
              </div>
            </div>

            <div className="glass-card market-card">
              <div className="market-header">
                <h3 className="section-title" style={{margin:0}}>📡 Pergerakan Market</h3>
                <div className="timeframe-tabs">
                  {(['1h','4h','24h'] as const).map(tf => (
                    <button key={tf} className={`tf-btn ${marketTimeframe===tf?'active':''}`} onClick={()=>setMarketTimeframe(tf)}>{tf}</button>
                  ))}
                </div>
              </div>
              {marketLoading ? <div className="mkt-loading">Memuat data market...</div> : (() => {
                const getChg = (c: CoinMarket) => marketTimeframe === '1h' ? (c.price_change_percentage_1h_in_currency ?? 0) : marketTimeframe === '4h' ? (c.price_change_percentage_4h_in_currency ?? 0) : (c.price_change_percentage_24h ?? 0);
                const sorted = [...marketCoins].filter(c => c.current_price > 0).sort((a,b) => getChg(b) - getChg(a));
                const gainers = sorted.slice(0,5);
                const losers = sorted.slice(-5).reverse();
                return (
                  <div className="movers-grid">
                    <div className="movers-col">
                      <div className="movers-head gain-head">🚀 Top 5 Naik</div>
                      {gainers.map(c => (<div key={c.id} className="mover-row"><img src={c.image} alt={c.symbol} className="coin-img"/><div className="coin-info"><span className="coin-sym">{c.symbol.toUpperCase()}</span><span className="coin-px">{fmtUSD(c.current_price)}</span></div><span className="coin-chg gain">+{getChg(c).toFixed(2)}%</span></div>))}
                    </div>
                    <div className="movers-col">
                      <div className="movers-head loss-head">📉 Top 5 Turun</div>
                      {losers.map(c => (<div key={c.id} className="mover-row"><img src={c.image} alt={c.symbol} className="coin-img"/><div className="coin-info"><span className="coin-sym">{c.symbol.toUpperCase()}</span><span className="coin-px">{fmtUSD(c.current_price)}</span></div><span className="coin-chg loss">{getChg(c).toFixed(2)}%</span></div>))}
                    </div>
                  </div>
                );
              })()}
            </div>
            <button className="add-btn candy-btn" onClick={() => { setShowAddModal(true); setAddStep('select'); }}>＋ Tambah Aset</button>
          </>
        )}

        {/* ═══ HISTORY ═════════════════════════════════════════════════════════ */}
        {activeTab === 'history' && (
          <div className="history-section">
            <div className="history-header">
              <h3 className="section-title">📜 Riwayat ({assets.length} transaksi)</h3>
              <div className="history-actions-bar">
                <button className="add-btn-sm candy-btn" onClick={() => { setShowAddModal(true); setAddStep('select'); }}>＋ Tambah</button>
                <button className="action-btn import-btn" onClick={() => { setShowImport(true); setImportStatus({ type: 'idle', message: '' }); }} title="Import Excel">📥 Import</button>
                <button className="action-btn export-btn" onClick={downloadReport} title="Download Laporan">📊 Laporan</button>
              </div>
            </div>

            {/* Import Panel */}
            {showImport && (
              <div className="glass-card import-panel">
                <div className="import-header">
                  <h3 className="section-title" style={{ margin: 0 }}>📥 Import Excel (tabunganku.xlsx)</h3>
                  <button className="modal-close" onClick={() => setShowImport(false)}>✕</button>
                </div>
                <div className={`drop-zone ${isDragging ? 'dragging' : ''}`}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) parseExcelFile(f); }}
                  onClick={() => fileInputRef.current?.click()}>
                  <div className="drop-icon">📂</div>
                  <div className="drop-text">Drag & drop atau klik pilih file</div>
                  <div className="drop-format">.xlsx • .xls</div>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) parseExcelFile(f); e.target.value = ''; }} />
                </div>
                {importStatus.type === 'error' && <div className="import-status error">❌ {importStatus.message}</div>}
                {importStatus.type === 'success' && <div className="import-status success">{importStatus.message}</div>}
                {importStatus.type === 'preview' && importStatus.preview && (
                  <div className="import-preview">
                    <div className="preview-info">🔍 Ditemukan <strong>{importStatus.preview.length} transaksi</strong></div>
                    <div className="preview-list">
                      {importStatus.preview.slice(0, 4).map((s, i) => (
                        <div key={i} className="preview-row">
                          <span className="pr-date">{new Date(s.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          <span className="pr-btc">{fmtCoin(s.amountCoin)} BTC</span>
                          <span className="pr-price">{fmtIDR(s.valueIDR)}</span>
                        </div>
                      ))}
                      {importStatus.preview.length > 4 && <div className="preview-more">...dan {importStatus.preview.length - 4} lainnya</div>}
                    </div>
                    <div className="import-actions">
                      {assets.length > 0 ? (
                        <><button className="candy-btn btn-imp" onClick={() => confirmImport(false)}>🔀 Gabung</button><button className="btn-replace" onClick={() => confirmImport(true)}>🔄 Ganti Semua</button></>
                      ) : (
                        <button className="candy-btn btn-imp" onClick={() => confirmImport(false)}>✅ Import</button>
                      )}
                      <button className="btn-cancel" onClick={() => setImportStatus({ type: 'idle', message: '' })}>Batal</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {assets.length === 0 ? (
              <div className="glass-card empty-state"><div className="empty-icon">🪙</div><p>Belum ada aset. Tambah atau import sekarang!</p></div>
            ) : (
              <>
                {/* Page size + info */}
                <div className="page-controls">
                  <div className="page-info">
                    Menampilkan {Math.min((currentPage - 1) * pageSize + 1, assets.length)}–{Math.min(currentPage * pageSize, assets.length)} dari {assets.length} transaksi
                  </div>
                  <div className="page-size-select">
                    <span className="page-size-label">Per halaman:</span>
                    {[10, 25, 50].map(s => (
                      <button key={s} className={`page-size-btn ${pageSize === s ? 'active' : ''}`}
                        onClick={() => { setPageSize(s); setCurrentPage(1); }}>{s}</button>
                    ))}
                  </div>
                </div>

              <div className="history-list">
                {assets.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((a, i) => {
                  const globalIdx = (currentPage - 1) * pageSize + i;
                  const color = CANDY[globalIdx % CANDY.length];
                  const isEdit = editId === a.id;
                  const curVal = a.amountCoin * (currentPrices[a.coinId] || a.priceAtBuyUSD) * usdToIdr;
                  const pl = curVal - a.valueIDR;
                  const plPct = a.valueIDR > 0 ? (pl / a.valueIDR) * 100 : 0;
                  return (
                    <div key={a.id} className="history-item glass-card" style={{ background: color.bg, borderColor: color.border, boxShadow: `0 0 24px ${color.glow}22` }}>
                      {isEdit ? (
                        <div className="edit-form">
                          <div className="edit-title">✏️ Edit — {a.coinName}</div>
                          <div className="type-toggle">
                            <button className={`type-btn buy-btn ${editForm.type === 'buy' ? 'active' : ''}`} onClick={() => setEditForm((f: any) => ({ ...f, type: 'buy' }))}>🟢 Beli</button>
                            <button className={`type-btn sell-btn ${editForm.type === 'sell' ? 'active' : ''}`} onClick={() => setEditForm((f: any) => ({ ...f, type: 'sell' }))}>🔴 Jual</button>
                          </div>
                          <div className="edit-grid">
                            <div className="form-group"><label className="form-label">Tanggal</label><input type="date" className="form-input" value={editForm.date} onChange={e => setEditForm((f: any) => ({ ...f, date: e.target.value }))} /></div>
                            <div className="form-group"><label className="form-label">Jumlah Koin</label><input type="number" className="form-input" value={editForm.amountCoin} onChange={e => setEditForm((f: any) => ({ ...f, amountCoin: e.target.value }))} /></div>
                            <div className="form-group"><label className="form-label">Harga Beli (USD)</label><input type="number" className="form-input" value={editForm.priceAtBuyUSD} onChange={e => setEditForm((f: any) => ({ ...f, priceAtBuyUSD: e.target.value }))} /></div>
                            <div className="form-group"><label className="form-label">Nilai (IDR)</label><input type="number" className="form-input" value={editForm.valueIDR} onChange={e => setEditForm((f: any) => ({ ...f, valueIDR: e.target.value }))} /></div>
                            <div className="form-group" style={{ gridColumn: '1/-1' }}><label className="form-label">Catatan</label><input type="text" className="form-input" value={editForm.note} onChange={e => setEditForm((f: any) => ({ ...f, note: e.target.value }))} /></div>
                          </div>
                          <div className="form-actions"><button className="btn-cancel" onClick={() => setEditId(null)}>Batal</button><button className="btn-save candy-btn" onClick={saveEdit}>💾 Simpan</button></div>
                        </div>
                      ) : (
                        <>
                          <div className="history-top">
                            <div className="htop-left"><img src={a.coinImage} alt={a.coinSymbol} className="h-coin-img" /><span className={`tx-badge ${a.type === 'sell' ? 'badge-sell' : 'badge-buy'}`}>{a.type === 'sell' ? 'JUAL' : 'BELI'}</span><span className="history-date">{new Date(a.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
                            <div className="history-actions"><button className="edit-btn" onClick={() => startEdit(a)}>✏️</button><button className="delete-btn" onClick={() => persistAssets(assets.filter(x => x.id !== a.id))}>✕</button></div>
                          </div>
                          <div className="h-coin-name">{a.coinName} <span className="h-coin-sym">{a.coinSymbol.toUpperCase()}</span></div>
                          <div className="h-amount">{fmtCoin(a.amountCoin)} {a.coinSymbol.toUpperCase()}</div>
                          {a.note && <div className="history-note">📝 {a.note}</div>}
                          <div className="history-stats">
                            <div className="h-stat"><span className="h-label">Modal</span><span className="h-val">{fmtIDR(a.valueIDR)}</span></div>
                            <div className="h-stat"><span className="h-label">Nilai Kini</span><span className="h-val">{fmtIDR(curVal)}</span></div>
                            <div className="h-stat"><span className="h-label">P/L</span><span className={`h-val ${pl >= 0 ? 'text-green' : 'text-red'}`}>{pl >= 0 ? '+' : ''}{plPct.toFixed(1)}%</span></div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

                {/* Pagination */}
                {Math.ceil(assets.length / pageSize) > 1 && (
                  <div className="pagination">
                    <button className="page-btn" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>«</button>
                    <button className="page-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>‹</button>
                    {Array.from({ length: Math.ceil(assets.length / pageSize) }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === Math.ceil(assets.length / pageSize) || Math.abs(p - currentPage) <= 1)
                      .reduce((acc: (number | string)[], p, idx, arr) => {
                        if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                        acc.push(p); return acc;
                      }, [])
                      .map((p, idx) => typeof p === 'string'
                        ? <span key={`ellipsis-${idx}`} className="page-ellipsis">...</span>
                        : <button key={p} className={`page-btn ${currentPage === p ? 'active' : ''}`} onClick={() => setCurrentPage(p as number)}>{p}</button>
                      )}
                    <button className="page-btn" onClick={() => setCurrentPage(p => Math.min(Math.ceil(assets.length / pageSize), p + 1))} disabled={currentPage === Math.ceil(assets.length / pageSize)}>›</button>
                    <button className="page-btn" onClick={() => setCurrentPage(Math.ceil(assets.length / pageSize))} disabled={currentPage === Math.ceil(assets.length / pageSize)}>»</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ═══ NEWS ════════════════════════════════════════════════════════════ */}
        {activeTab === 'news' && (
          <div className="news-section">
            <div className="news-header">
              <div>
                <h3 className="section-title" style={{ margin: 0 }}>📰 Berita Crypto Terkini</h3>
                <p className="news-src-label">mktnews.net • CryptoCompare • CoinGecko</p>
              </div>
              <button className="refresh-btn" onClick={() => { setNews([]); fetchNews(); }} disabled={newsLoading}>{newsLoading ? '⏳' : '🔄'}</button>
            </div>
            {newsLoading ? (
              <div className="glass-card empty-state"><div className="empty-icon">📡</div><p>Memuat berita terkini...</p></div>
            ) : news.length === 0 ? (
              <div className="glass-card empty-state"><div className="empty-icon">📰</div><p>Belum ada berita. Tekan 🔄 untuk muat.</p></div>
            ) : (
              <div className="news-list">
                {news.map((n, i) => (
                  <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="news-card glass-card">
                    <div className="news-top">
                      <span className={`news-badge badge-${n.sentiment}`}>{n.sentiment === 'positive' ? '🟢 Bullish' : n.sentiment === 'negative' ? '🔴 Bearish' : '⚪ Netral'}</span>
                      <span className="news-source">{n.source}</span>
                      <span className="news-time" title={n.published}>{relTime(n.publishedRaw)}</span>
                    </div>
                    <div className="news-title">{n.title}</div>
                    <div className="news-meta">
                      <span className="news-date-full">🕐 {n.published}</span>
                    </div>
                    <div className="news-summary">{n.summary}</div>
                    <div className="news-readmore">Baca selengkapnya →</div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        <footer className="footer">
          <span>Data: CoinGecko • Alternative.me • MktNews • CryptoCompare</span>
          <span className="live-dot">● LIVE</span>
        </footer>
      </div>

      {/* ═══ ADD ASSET MODAL ══════════════════════════════════════════════════ */}
      {showAddModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowAddModal(false); setAddStep('select'); setSelectedCoin(null); } }}>
          <div className="modal-card glass-card">
            {addStep === 'select' ? (
              <>
                <div className="modal-header"><h3 className="modal-title">🪙 Pilih Aset</h3><button className="modal-close" onClick={() => { setShowAddModal(false); setSearchCoin(''); }}>✕</button></div>
                <input className="form-input coin-search" placeholder="🔍 Cari nama atau simbol..." value={searchCoin} onChange={e => setSearchCoin(e.target.value)} autoFocus />
                <div className="coin-list">
                  {marketLoading ? (
                    <div className="coin-loading"><span className="spinner" />Memuat daftar aset...</div>
                  ) : filteredCoins.length === 0 ? (
                    <div className="coin-loading">Aset tidak ditemukan</div>
                  ) : filteredCoins.map(c => (
                    <div key={c.id} className="coin-row" onClick={() => { setSelectedCoin(c); setAddStep('form'); }}>
                      <img src={c.image} alt={c.symbol} className="coin-row-img" />
                      <div className="coin-row-info"><span className="coin-row-name">{c.name}</span><span className="coin-row-sym">{c.symbol.toUpperCase()}</span></div>
                      <div className="coin-row-right">
                        <span className="coin-row-price">{fmtUSD(c.current_price)}</span>
                        <span className={`coin-row-chg ${(c.price_change_percentage_24h ?? 0) >= 0 ? 'gain' : 'loss'}`}>{(c.price_change_percentage_24h ?? 0) >= 0 ? '+' : ''}{(c.price_change_percentage_24h ?? 0).toFixed(2)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : selectedCoin && (
              <>
                <div className="modal-header"><button className="back-btn" onClick={() => { setAddStep('select'); setAddForm({ valueIDR: '', amountCoin: '', note: '', type: 'buy' }); }}>← Kembali</button><h3 className="modal-title">{selectedCoin.name}</h3><button className="modal-close" onClick={() => { setShowAddModal(false); setAddStep('select'); setSelectedCoin(null); }}>✕</button></div>
                <div className="selected-coin-info"><img src={selectedCoin.image} alt="" className="sel-coin-img" /><div><div className="sel-coin-price">{fmtUSD(selectedCoin.current_price)}</div><div className={`sel-coin-chg ${(selectedCoin.price_change_percentage_24h ?? 0) >= 0 ? 'green' : 'red'}`}>{(selectedCoin.price_change_percentage_24h ?? 0) >= 0 ? '▲' : '▼'} {Math.abs(selectedCoin.price_change_percentage_24h ?? 0).toFixed(2)}%</div></div></div>
                <div className="type-toggle"><button className={`type-btn buy-btn ${addForm.type === 'buy' ? 'active' : ''}`} onClick={() => setAddForm(f => ({ ...f, type: 'buy' }))}>🟢 Beli</button><button className={`type-btn sell-btn ${addForm.type === 'sell' ? 'active' : ''}`} onClick={() => setAddForm(f => ({ ...f, type: 'sell' }))}>🔴 Jual</button></div>
                <div className="form-group"><label className="form-label">Nilai (Rupiah)</label><div className="input-prefix-wrap"><span className="input-prefix">Rp</span><input type="number" className="form-input input-with-prefix" placeholder="Contoh: 500000" value={addForm.valueIDR} onChange={e => handleIDRChange(e.target.value)} /></div></div>
                <div className="form-group"><label className="form-label">Jumlah {selectedCoin.symbol.toUpperCase()}</label><input type="number" className="form-input" placeholder="Otomatis terhitung" value={addForm.amountCoin} onChange={e => handleCoinAmountChange(e.target.value)} step="any" /></div>
                <div className="form-group"><label className="form-label">Catatan (opsional)</label><input type="text" className="form-input" placeholder="Contoh: DCA mingguan" value={addForm.note} onChange={e => setAddForm(f => ({ ...f, note: e.target.value }))} /></div>
                <div className="form-actions"><button className="btn-cancel" onClick={() => { setShowAddModal(false); setAddStep('select'); setSelectedCoin(null); }}>Batal</button><button className="btn-save candy-btn" onClick={confirmAdd}>💾 Simpan</button></div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
