import React, { useState, useEffect, useCallback } from 'react';
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
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatBTC(value: number): string {
  return value.toFixed(8);
}

function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const CANDY_COLORS = [
  { glow: '#ff6eb4', bg: 'rgba(255,110,180,0.18)', border: 'rgba(255,110,180,0.45)' },
  { glow: '#7c6fff', bg: 'rgba(124,111,255,0.18)', border: 'rgba(124,111,255,0.45)' },
  { glow: '#43e8d8', bg: 'rgba(67,232,216,0.18)', border: 'rgba(67,232,216,0.45)' },
  { glow: '#ffb347', bg: 'rgba(255,179,71,0.18)', border: 'rgba(255,179,71,0.45)' },
  { glow: '#a8ff78', bg: 'rgba(168,255,120,0.18)', border: 'rgba(168,255,120,0.45)' },
  { glow: '#ff7f7f', bg: 'rgba(255,127,127,0.18)', border: 'rgba(255,127,127,0.45)' },
];

export default function App() {
  const [savings, setSavings] = useState<Saving[]>([]);
  const [btcData, setBtcData] = useState<BTCData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amountBTC: '', note: '' });
  const [usdToIdr, setUsdToIdr] = useState<number>(16200);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history'>('dashboard');
  const [priceError, setPriceError] = useState(false);

  const fetchBTCPrice = useCallback(async () => {
    try {
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_high=true&include_24hr_low=true'
      );
      const data = await res.json();
      const btc = data.bitcoin;
      setBtcData({
        price: btc.usd,
        change24h: btc.usd_24h_change,
        high24h: btc.usd_24h_high,
        low24h: btc.usd_24h_low,
        lastUpdated: new Date().toLocaleTimeString('id-ID'),
      });
      setPriceError(false);
    } catch {
      setPriceError(true);
    } finally {
      setLoading(false);
    }
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

  const deleteSaving = (id: string) => {
    saveSavings(savings.filter(s => s.id !== id));
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
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="blob blob-4" />
        <div className="blob blob-5" />
      </div>

      <div className="container">
        <header className="header glass-card">
          <div className="header-left">
            <span className="btc-icon">₿</span>
            <div>
              <h1 className="app-title">Bitcoin Savings</h1>
              <p className="app-subtitle">Tabungan Kripto Kamu 🍬</p>
            </div>
          </div>
          <div className="header-right">
            {loading ? (
              <div className="price-loading">Memuat harga...</div>
            ) : priceError ? (
              <div className="price-error">⚠️ Gagal memuat harga</div>
            ) : btcData ? (
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

        <div className="tabs">
          <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            📊 Dashboard
          </button>
          <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            📜 Riwayat
          </button>
        </div>

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
              <div className={`stat-card glass-card ${profitUSD >= 0 ? 'candy-green' : 'candy-red'}`}>
                <div className="stat-icon">{profitUSD >= 0 ? '📈' : '📉'}</div>
                <div className="stat-label">Profit / Rugi</div>
                <div className={`stat-value ${profitUSD >= 0 ? 'text-green' : 'text-red'}`}>
                  {profitUSD >= 0 ? '+' : ''}{formatIDR(profitInIDR)}
                </div>
                <div className={`stat-sub ${profitUSD >= 0 ? 'text-green' : 'text-red'}`}>
                  {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%
                </div>
              </div>
            </div>

            {btcData && (
              <div className="glass-card dca-card">
                <h3 className="section-title">📊 Info Market 24 Jam</h3>
                <div className="dca-grid">
                  <div className="dca-item">
                    <span className="dca-label">High 24h</span>
                    <span className="dca-val green">{formatUSD(btcData.high24h)}</span>
                  </div>
                  <div className="dca-item">
                    <span className="dca-label">Low 24h</span>
                    <span className="dca-val red">{formatUSD(btcData.low24h)}</span>
                  </div>
                  <div className="dca-item">
                    <span className="dca-label">Kurs USD/IDR</span>
                    <span className="dca-val">{formatIDR(usdToIdr)}</span>
                  </div>
                  <div className="dca-item">
                    <span className="dca-label">Transaksi</span>
                    <span className="dca-val">{savings.length}x</span>
                  </div>
                  {savings.length > 0 && (
                    <div className="dca-item">
                      <span className="dca-label">Rata-rata Beli</span>
                      <span className="dca-val">{formatUSD(totalBTC > 0 ? totalCostUSD / totalBTC : 0)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <button className="add-btn candy-btn" onClick={() => setShowForm(true)}>
              ＋ Tambah Tabungan BTC
            </button>

            {showForm && (
              <div className="glass-card form-card">
                <h3 className="section-title">✨ Tambah Tabungan</h3>
                <div className="form-group">
                  <label className="form-label">Jumlah BTC</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Contoh: 0.001"
                    value={form.amountBTC}
                    step="0.00000001"
                    min="0"
                    onChange={e => setForm(f => ({ ...f, amountBTC: e.target.value }))}
                  />
                  {form.amountBTC && btcData && Number(form.amountBTC) > 0 && (
                    <div className="form-hint">
                      ≈ {formatUSD(Number(form.amountBTC) * btcData.price)} &nbsp;|&nbsp; {formatIDR(Number(form.amountBTC) * btcData.price * usdToIdr)}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Catatan (opsional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Contoh: DCA Maret 2025"
                    value={form.note}
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  />
                </div>
                <div className="form-actions">
                  <button className="btn-cancel" onClick={() => { setShowForm(false); setForm({ amountBTC: '', note: '' }); }}>Batal</button>
                  <button className="btn-save candy-btn" onClick={addSaving}>💾 Simpan</button>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <div className="history-section">
            <div className="history-header">
              <h3 className="section-title">📜 Riwayat Tabungan</h3>
              <button className="add-btn-sm candy-btn" onClick={() => { setActiveTab('dashboard'); setTimeout(() => setShowForm(true), 100); }}>＋ Tambah</button>
            </div>
            {savings.length === 0 ? (
              <div className="glass-card empty-state">
                <div className="empty-icon">🪙</div>
                <p>Belum ada tabungan. Yuk mulai menabung Bitcoin!</p>
              </div>
            ) : (
              <div className="history-list">
                {savings.map((s, i) => {
                  const color = CANDY_COLORS[i % CANDY_COLORS.length];
                  const currentVal = s.amountBTC * (btcData?.price || 0);
                  const cost = s.amountBTC * s.priceAtBuy;
                  const profit = currentVal - cost;
                  const pct = cost > 0 ? (profit / cost) * 100 : 0;
                  return (
                    <div
                      key={s.id}
                      className="history-item glass-card"
                      style={{ background: color.bg, borderColor: color.border, boxShadow: `0 0 24px ${color.glow}33` }}
                    >
                      <div className="history-top">
                        <span className="history-date">{new Date(s.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        <button className="delete-btn" onClick={() => deleteSaving(s.id)}>✕</button>
                      </div>
                      <div className="history-btc">{formatBTC(s.amountBTC)} <span className="btc-tag">BTC</span></div>
                      {s.note && <div className="history-note">📝 {s.note}</div>}
                      <div className="history-stats">
                        <div className="h-stat">
                          <span className="h-label">Harga Beli</span>
                          <span className="h-val">{formatUSD(s.priceAtBuy)}</span>
                        </div>
                        <div className="h-stat">
                          <span className="h-label">Nilai Kini</span>
                          <span className="h-val">{formatUSD(currentVal)}</span>
                        </div>
                        <div className="h-stat">
                          <span className="h-label">P/L</span>
                          <span className={`h-val ${profit >= 0 ? 'text-green' : 'text-red'}`}>
                            {profit >= 0 ? '+' : ''}{pct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
