import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import './App.css';

interface Saving {
  id: string;
  date: string;
  amountBTC: number;
  note: string;
  priceAtBuy: number;
}

interface BTCData {
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  lastUpdated: string;
}

const STORAGE_KEY = 'btc_savings_v1';

function formatIDR(value: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}
function formatBTC(value: number): string { return value.toFixed(8); }
function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

const CANDY_COLORS = [
  { glow: '#ff6eb4', bg: 'rgba(255,110,180,0.18)', border: 'rgba(255,110,180,0.45)' },
  { glow: '#7c6fff', bg: 'rgba(124,111,255,0.18)', border: 'rgba(124,111,255,0.45)' },
  { glow: '#43e8d8', bg: 'rgba(67,232,216,0.18)', border: 'rgba(67,232,216,0.45)' },
  { glow: '#ffb347', bg: 'rgba(255,179,71,0.18)', border: 'rgba(255,179,71,0.45)' },
  { glow: '#a8ff78', bg: 'rgba(168,255,120,0.18)', border: 'rgba(168,255,120,0.45)' },
  { glow: '#ff7f7f', bg: 'rgba(255,127,127,0.18)', border: 'rgba(255,127,127,0.45)' },
];

function parseExcelDate(raw: any): string | null {
  if (!raw) return null;
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return new Date(d.y, d.m - 1, d.d).toISOString();
  }
  if (typeof raw === 'string') {
    const cleaned = raw.trim();
    // try various formats
    const patterns = [
      /^(\d{4})-(\d{2})-(\d{2})/,       // 2024-11-17
      /^(\d{2})-([A-Za-z]+)\s*(\d{4})/, // 03-Dec 2024
      /^(\d+)\s+([A-Za-z]+)\s+(\d{4})/, // 23 june 2025
    ];
    const months: Record<string, number> = {
      jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11
    };
    // ISO
    if (patterns[0].test(cleaned)) {
      const d = new Date(cleaned);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    // 03-Dec 2024
    const m2 = cleaned.match(/^(\d+)-([A-Za-z]+)\s*(\d{4})/);
    if (m2) {
      const mo = months[m2[2].toLowerCase().slice(0,3)];
      if (mo !== undefined) return new Date(parseInt(m2[3]), mo, parseInt(m2[1])).toISOString();
    }
    // 23 june 2025
    const m3 = cleaned.match(/^(\d+)\s+([A-Za-z]+)\s+(\d{4})/);
    if (m3) {
      const mo = months[m3[2].toLowerCase().slice(0,3)];
      if (mo !== undefined) return new Date(parseInt(m3[3]), mo, parseInt(m3[1])).toISOString();
    }
  }
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw.toISOString();
  return null;
}

export default function App() {
  const [savings, setSavings] = useState<Saving[]>([]);
  const [btcData, setBtcData] = useState<BTCData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amountBTC: '', note: '' });
  const [usdToIdr, setUsdToIdr] = useState<number>(16200);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'import'>('dashboard');
  const [priceError, setPriceError] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'idle'|'success'|'error'|'preview', message: string, preview?: Saving[] }>({ type: 'idle', message: '' });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBTCPrice = useCallback(async () => {
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_high=true&include_24hr_low=true');
      const data = await res.json();
      const btc = data.bitcoin;
      setBtcData({ price: btc.usd, change24h: btc.usd_24h_change, high24h: btc.usd_24h_high, low24h: btc.usd_24h_low, lastUpdated: new Date().toLocaleTimeString('id-ID') });
      setPriceError(false);
    } catch { setPriceError(true); }
    finally { setLoading(false); }
  }, []);

  const fetchUSDToIDR = useCallback(async () => {
    try {
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data = await res.json();
      if (data.rates?.IDR) setUsdToIdr(data.rates.IDR);
    } catch {}
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setSavings(JSON.parse(stored));
    fetchBTCPrice();
    fetchUSDToIDR();
    const interval = setInterval(fetchBTCPrice, 60000);
    return () => clearInterval(interval);
  }, [fetchBTCPrice, fetchUSDToIDR]);

  const saveSavings = (data: Saving[]) => {
    setSavings(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };

  const addSaving = () => {
    if (!form.amountBTC || isNaN(Number(form.amountBTC)) || Number(form.amountBTC) <= 0) return;
    const newSaving: Saving = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      amountBTC: Number(form.amountBTC),
      note: form.note,
      priceAtBuy: btcData?.price || 0,
    };
    saveSavings([newSaving, ...savings]);
    setForm({ amountBTC: '', note: '' });
    setShowForm(false);
  };

  const deleteSaving = (id: string) => saveSavings(savings.filter(s => s.id !== id));

  // ---- EXCEL IMPORT ----
  const parseExcelFile = (file: File) => {
    setImportStatus({ type: 'idle', message: 'Membaca file...' });
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: false });

        // Use Sheet1
        const sheetName = wb.SheetNames.includes('Sheet1') ? 'Sheet1' : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        // Find header row — look for "Tanggal" in col 0
        let dataStart = -1;
        for (let i = 0; i < rows.length; i++) {
          const cell = String(rows[i][0] || '');
          if (cell.includes('Tanggal') || cell.includes('tanggal')) { dataStart = i + 1; break; }
          // also detect by jumlah BTC in col 1
          if (String(rows[i][1] || '').includes('Jumlah')) { dataStart = i + 1; break; }
        }
        if (dataStart === -1) dataStart = 7; // fallback based on known structure

        const parsed: Saving[] = [];
        for (let i = dataStart; i < rows.length; i++) {
          const row = rows[i];
          const rawDate = row[0];
          const rawBTC = row[1];
          const rawHargaBeli = row[2]; // Harga Beli (IDR per BTC)
          const rawKet = row[8];       // Ket/Sumber

          if (!rawDate || !rawBTC) continue;
          const dateStr = parseExcelDate(rawDate);
          if (!dateStr) continue;
          const btcAmt = parseFloat(String(rawBTC));
          if (isNaN(btcAmt) || btcAmt <= 0) continue;

          // harga beli in IDR — convert to USD using current rate
          const hargaBeliIDR = parseFloat(String(rawHargaBeli || 0));
          const priceUSD = hargaBeliIDR > 0 ? hargaBeliIDR / usdToIdr : 0;

          parsed.push({
            id: `xl_${i}_${Date.now()}`,
            date: dateStr,
            amountBTC: btcAmt,
            note: rawKet && String(rawKet).trim() !== '' ? String(rawKet).trim() : '',
            priceAtBuy: priceUSD,
          });
        }

        if (parsed.length === 0) {
          setImportStatus({ type: 'error', message: 'Tidak ada data valid yang ditemukan. Pastikan file Excel sudah benar.' });
          return;
        }

        setImportStatus({ type: 'preview', message: `Ditemukan ${parsed.length} transaksi dari Sheet1. Konfirmasi untuk import?`, preview: parsed });
      } catch (err) {
        setImportStatus({ type: 'error', message: 'Gagal membaca file. Pastikan format file .xlsx benar.' });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmImport = (replace: boolean) => {
    if (!importStatus.preview) return;
    const newData = replace ? importStatus.preview : [...importStatus.preview, ...savings];
    // deduplicate by date+btc
    const seen = new Set<string>();
    const deduped = newData.filter(s => {
      const key = `${s.date}_${s.amountBTC}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    saveSavings(deduped);
    setImportStatus({ type: 'success', message: `✅ Berhasil import ${importStatus.preview.length} transaksi!` });
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseExcelFile(file);
  };

  const totalBTC = savings.reduce((a, s) => a + s.amountBTC, 0);
  const totalCostUSD = savings.reduce((a, s) => a + s.amountBTC * s.priceAtBuy, 0);
  const currentValueUSD = totalBTC * (btcData?.price || 0);
  const profitUSD = currentValueUSD - totalCostUSD;
  const profitPct = totalCostUSD > 0 ? (profitUSD / totalCostUSD) * 100 : 0;
  const totalBTCInIDR = currentValueUSD * usdToIdr;
  const costInIDR = totalCostUSD * usdToIdr;
  const profitInIDR = profitUSD * usdToIdr;

  return (
    <div className="app">
      <div className="bg-blobs">
        <div className="blob blob-1"/><div className="blob blob-2"/><div className="blob blob-3"/>
        <div className="blob blob-4"/><div className="blob blob-5"/>
      </div>
      <div className="container">
        {/* Header */}
        <header className="header glass-card">
          <div className="header-left">
            <span className="btc-icon">₿</span>
            <div>
              <h1 className="app-title">Bitcoin Savings</h1>
              <p className="app-subtitle">Tabungan Kripto Kamu 🍬</p>
            </div>
          </div>
          <div className="header-right">
            {loading ? <div className="price-loading">Memuat harga...</div>
            : priceError ? <div className="price-error">⚠️ Gagal memuat harga</div>
            : btcData ? (
              <div className="live-price">
                <span className="price-label">BTC/USD</span>
                <span className="price-value">{formatUSD(btcData.price)}</span>
                <span className={`price-change ${btcData.change24h >= 0 ? 'green' : 'red'}`}>
                  {btcData.change24h >= 0 ? '▲' : '▼'} {Math.abs(btcData.change24h).toFixed(2)}%
                </span>
                <span className="price-updated">Update {btcData.lastUpdated}</span>
              </div>
            ) : null}
          </div>
        </header>

        {/* Tabs */}
        <div className="tabs">
          <button className={`tab-btn ${activeTab==='dashboard'?'active':''}`} onClick={()=>setActiveTab('dashboard')}>📊 Dashboard</button>
          <button className={`tab-btn ${activeTab==='history'?'active':''}`} onClick={()=>setActiveTab('history')}>📜 Riwayat</button>
          <button className={`tab-btn ${activeTab==='import'?'active':''}`} onClick={()=>setActiveTab('import')}>📥 Import Excel</button>
        </div>

        {/* DASHBOARD */}
        {activeTab === 'dashboard' && (
          <>
            <div className="stats-grid">
              <div className="stat-card glass-card candy-pink">
                <div className="stat-icon">₿</div>
                <div className="stat-label">Total Bitcoin</div>
                <div className="stat-value mono">{formatBTC(totalBTC)}</div>
                <div className="stat-sub">BTC</div>
              </div>
              <div className="stat-card glass-card candy-purple">
                <div className="stat-icon">💰</div>
                <div className="stat-label">Nilai Sekarang</div>
                <div className="stat-value">{formatIDR(totalBTCInIDR)}</div>
                <div className="stat-sub">{formatUSD(currentValueUSD)}</div>
              </div>
              <div className="stat-card glass-card candy-teal">
                <div className="stat-icon">🏦</div>
                <div className="stat-label">Total Modal</div>
                <div className="stat-value">{formatIDR(costInIDR)}</div>
                <div className="stat-sub">{formatUSD(totalCostUSD)}</div>
              </div>
              <div className={`stat-card glass-card ${profitUSD>=0?'candy-green':'candy-red'}`}>
                <div className="stat-icon">{profitUSD>=0?'📈':'📉'}</div>
                <div className="stat-label">Profit / Rugi</div>
                <div className={`stat-value ${profitUSD>=0?'text-green':'text-red'}`}>
                  {profitUSD>=0?'+':''}{formatIDR(profitInIDR)}
                </div>
                <div className={`stat-sub ${profitUSD>=0?'text-green':'text-red'}`}>
                  {profitPct>=0?'+':''}{profitPct.toFixed(2)}%
                </div>
              </div>
            </div>

            {btcData && (
              <div className="glass-card dca-card">
                <h3 className="section-title">📊 Info Market & Portfolio</h3>
                <div className="dca-grid">
                  <div className="dca-item"><span className="dca-label">High 24h</span><span className="dca-val green">{formatUSD(btcData.high24h)}</span></div>
                  <div className="dca-item"><span className="dca-label">Low 24h</span><span className="dca-val red">{formatUSD(btcData.low24h)}</span></div>
                  <div className="dca-item"><span className="dca-label">Kurs USD/IDR</span><span className="dca-val">{formatIDR(usdToIdr)}</span></div>
                  <div className="dca-item"><span className="dca-label">Transaksi</span><span className="dca-val">{savings.length}x</span></div>
                  {savings.length > 0 && <div className="dca-item"><span className="dca-label">Rata-rata Beli</span><span className="dca-val">{formatUSD(totalBTC>0?totalCostUSD/totalBTC:0)}</span></div>}
                  {savings.length > 0 && <div className="dca-item"><span className="dca-label">Rata-rata Beli (IDR)</span><span className="dca-val">{formatIDR((totalBTC>0?totalCostUSD/totalBTC:0)*usdToIdr)}</span></div>}
                </div>
              </div>
            )}

            <button className="add-btn candy-btn" onClick={()=>setShowForm(true)}>＋ Tambah Tabungan BTC</button>

            {showForm && (
              <div className="glass-card form-card">
                <h3 className="section-title">✨ Tambah Tabungan</h3>
                <div className="form-group">
                  <label className="form-label">Jumlah BTC</label>
                  <input type="number" className="form-input" placeholder="Contoh: 0.001" value={form.amountBTC} step="0.00000001" min="0"
                    onChange={e=>setForm(f=>({...f,amountBTC:e.target.value}))} />
                  {form.amountBTC && btcData && Number(form.amountBTC)>0 && (
                    <div className="form-hint">≈ {formatUSD(Number(form.amountBTC)*btcData.price)} &nbsp;|&nbsp; {formatIDR(Number(form.amountBTC)*btcData.price*usdToIdr)}</div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Catatan (opsional)</label>
                  <input type="text" className="form-input" placeholder="Contoh: DCA Maret 2025" value={form.note}
                    onChange={e=>setForm(f=>({...f,note:e.target.value}))} />
                </div>
                <div className="form-actions">
                  <button className="btn-cancel" onClick={()=>{setShowForm(false);setForm({amountBTC:'',note:''});}}>Batal</button>
                  <button className="btn-save candy-btn" onClick={addSaving}>💾 Simpan</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* HISTORY */}
        {activeTab === 'history' && (
          <div className="history-section">
            <div className="history-header">
              <h3 className="section-title">📜 Riwayat ({savings.length} transaksi)</h3>
              <button className="add-btn-sm candy-btn" onClick={()=>{setActiveTab('dashboard');setTimeout(()=>setShowForm(true),100);}}>＋ Tambah</button>
            </div>
            {savings.length === 0 ? (
              <div className="glass-card empty-state">
                <div className="empty-icon">🪙</div>
                <p>Belum ada data. Import dari Excel atau tambah manual!</p>
              </div>
            ) : (
              <div className="history-list">
                {savings.map((s,i)=>{
                  const color=CANDY_COLORS[i%CANDY_COLORS.length];
                  const currentVal=s.amountBTC*(btcData?.price||0);
                  const cost=s.amountBTC*s.priceAtBuy;
                  const profit=currentVal-cost;
                  const pct=cost>0?(profit/cost)*100:0;
                  return (
                    <div key={s.id} className="history-item glass-card"
                      style={{background:color.bg,borderColor:color.border,boxShadow:`0 0 24px ${color.glow}33`}}>
                      <div className="history-top">
                        <span className="history-date">{new Date(s.date).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</span>
                        <button className="delete-btn" onClick={()=>deleteSaving(s.id)}>✕</button>
                      </div>
                      <div className="history-btc">{formatBTC(s.amountBTC)} <span className="btc-tag">BTC</span></div>
                      {s.note && <div className="history-note">📝 {s.note}</div>}
                      <div className="history-stats">
                        <div className="h-stat"><span className="h-label">Harga Beli</span><span className="h-val">{s.priceAtBuy>0?formatUSD(s.priceAtBuy):'-'}</span></div>
                        <div className="h-stat"><span className="h-label">Nilai Kini</span><span className="h-val">{formatUSD(currentVal)}</span></div>
                        <div className="h-stat"><span className="h-label">P/L</span><span className={`h-val ${profit>=0?'text-green':'text-red'}`}>{profit>=0?'+':''}{pct.toFixed(1)}%</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* IMPORT */}
        {activeTab === 'import' && (
          <div className="import-section">
            <div className="glass-card import-card">
              <h3 className="section-title">📥 Import dari Excel</h3>
              <p className="import-desc">Upload file <strong>tabunganku.xlsx</strong> kamu. Aplikasi akan otomatis membaca Sheet1 dan mengambil data transaksi.</p>

              {/* Drop Zone */}
              <div
                className={`drop-zone ${isDragging?'dragging':''}`}
                onDragOver={e=>{e.preventDefault();setIsDragging(true);}}
                onDragLeave={()=>setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={()=>fileInputRef.current?.click()}
              >
                <div className="drop-icon">📂</div>
                <div className="drop-text">Drag & drop file Excel di sini</div>
                <div className="drop-sub">atau klik untuk pilih file</div>
                <div className="drop-format">.xlsx • .xls</div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{display:'none'}}
                  onChange={e=>{const f=e.target.files?.[0]; if(f)parseExcelFile(f); e.target.value='';}} />
              </div>

              {/* Status */}
              {importStatus.type === 'error' && (
                <div className="import-status error">❌ {importStatus.message}</div>
              )}
              {importStatus.type === 'success' && (
                <div className="import-status success">{importStatus.message}</div>
              )}

              {/* Preview */}
              {importStatus.type === 'preview' && importStatus.preview && (
                <div className="import-preview">
                  <div className="preview-info">
                    🔍 Preview — ditemukan <strong>{importStatus.preview.length} transaksi</strong> dari Sheet1
                  </div>
                  <div className="preview-list">
                    {importStatus.preview.slice(0,5).map((s,i)=>(
                      <div key={i} className="preview-row">
                        <span className="pr-date">{new Date(s.date).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}</span>
                        <span className="pr-btc">{formatBTC(s.amountBTC)} BTC</span>
                        <span className="pr-price">{s.priceAtBuy>0?formatUSD(s.priceAtBuy):'-'}</span>
                        {s.note && <span className="pr-note">📝{s.note}</span>}
                      </div>
                    ))}
                    {importStatus.preview.length > 5 && (
                      <div className="preview-more">...dan {importStatus.preview.length-5} transaksi lainnya</div>
                    )}
                  </div>
                  <div className="import-actions">
                    {savings.length > 0 ? (
                      <>
                        <button className="btn-import-merge candy-btn" onClick={()=>confirmImport(false)}>
                          🔀 Gabung dengan data existing
                        </button>
                        <button className="btn-import-replace" onClick={()=>confirmImport(true)}>
                          🔄 Ganti semua data
                        </button>
                      </>
                    ) : (
                      <button className="btn-import-merge candy-btn" onClick={()=>confirmImport(false)}>
                        ✅ Import Sekarang
                      </button>
                    )}
                    <button className="btn-cancel" onClick={()=>setImportStatus({type:'idle',message:''})}>Batal</button>
                  </div>
                </div>
              )}
            </div>

            {/* Format guide */}
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
          <span>Dibuat dengan ❤️ • Data dari CoinGecko & ExchangeRate-API</span>
          <span className="live-dot">● LIVE</span>
        </footer>
      </div>
    </div>
  );
}
