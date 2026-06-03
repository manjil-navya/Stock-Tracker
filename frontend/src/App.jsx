import React, { useState, useEffect } from 'react';
import { TrendingUp, Database, CalendarDays, CheckCircle2, AlertCircle } from 'lucide-react';
import QuarterlyTracker from './components/QuarterlyTracker';
import StocksDatabase from './components/StocksDatabase';
import { stocksApi } from './api/stocksApi';

function App() {
  const [activeTab, setActiveTab] = useState('tracker'); // 'tracker' or 'database'
  const [quarter, setQuarter] = useState('Q1');
  const [year, setYear] = useState('2025/26');
  
  // Data States
  const [stocks, setStocks] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [summary, setSummary] = useState(null);
  
  // Loading & Error States
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null); // { message, type: 'success' | 'error' }
  
  // Show toast notification helper
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };
  
  // Load stocks database
  const fetchStocks = async () => {
    try {
      const data = await stocksApi.getStocks();
      setStocks(data);
    } catch (err) {
      console.error(err);
      showToast('Error loading stocks database', 'error');
    }
  };
  
  // Load tracker approval states & summary metrics
  const fetchQuarterData = async () => {
    setLoading(true);
    try {
      const approvalsData = await stocksApi.getAllApprovals();
      const summaryData = await stocksApi.getSummary(quarter, year);
      
      setApprovals(approvalsData);
      setSummary(summaryData);
    } catch (err) {
      console.error(err);
      showToast('Error fetching quarterly metrics', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  // Initial loading
  useEffect(() => {
    fetchStocks();
  }, []);
  
  // Fetch metrics when tracker context changes
  useEffect(() => {
    if (activeTab === 'tracker') {
      fetchQuarterData();
    }
  }, [quarter, year, activeTab]);
  
  // Handler functions for stock CRUD operations
  
  const handleAddStock = async (newStockPayload) => {
    try {
      const created = await stocksApi.createStock(newStockPayload);
      setStocks((prev) => [...prev, created]);
      showToast(`Stock ${created.symbol} added and synced with CSV.`);
      
      // Refresh current summary states
      fetchQuarterData();
      return created;
    } catch (err) {
      showToast(err.message, 'error');
      throw err;
    }
  };
  
  const handleUpdateStock = async (symbol, updatePayload) => {
    try {
      const updated = await stocksApi.updateStock(symbol, updatePayload);
      setStocks((prev) => prev.map((s) => (s.symbol === symbol ? updated : s)));
      showToast(`Stock ${symbol} successfully updated and synced with CSV.`);
      
      // Refresh current summary states
      fetchQuarterData();
      return updated;
    } catch (err) {
      showToast(err.message, 'error');
      throw err;
    }
  };
  
  const handleDeleteStock = async (symbol) => {
    try {
      await stocksApi.deleteStock(symbol);
      setStocks((prev) => prev.filter((s) => s.symbol !== symbol));
      showToast(`Stock ${symbol} removed and deleted from CSV.`);
      
      // Refresh current summary states
      fetchQuarterData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
  
  // Handler for CSV upload
  const handleUploadStocksCsv = async (file) => {
    try {
      await stocksApi.uploadStocksCsv(file);
      showToast('CSV uploaded successfully', 'success');
      // Refresh stocks list
      fetchStocks();
      // Also refresh quarterly data if in tracker tab
      if (activeTab === 'tracker') {
        fetchQuarterData();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
  
  const handleToggleApproval = async (symbol, targetQuarter, targetYear, newApprovedState) => {
    // Show immediate feedback
    if (newApprovedState) {
      showToast(`${symbol} Approved for ${targetQuarter} ${targetYear}!`);
    } else {
      showToast(`${symbol} set back to Pending for ${targetQuarter} ${targetYear}.`);
    }
    
    // Optimistic state update - update approvals locally
    const nowStr = new Date().toISOString();
    setApprovals((prev) => {
      const existing = prev.find(a => a.stock_symbol === symbol && a.quarter === targetQuarter && a.year === targetYear);
      if (existing) {
        if (newApprovedState) {
          return prev.map(a => 
            a.stock_symbol === symbol && a.quarter === targetQuarter && a.year === targetYear
              ? { ...a, approved: true, approved_at: nowStr }
              : a
          );
        } else {
          return prev.filter(a => !(a.stock_symbol === symbol && a.quarter === targetQuarter && a.year === targetYear));
        }
      } else if (newApprovedState) {
        return [...prev, { stock_symbol: symbol, quarter: targetQuarter, year: targetYear, approved: true, approved_at: nowStr }];
      }
      return prev;
    });
    
    // Update summary locally
    setSummary((prev) => {
      if (!prev) return prev;
      const wasApproved = prev.approved_stocks?.some(s => s.symbol === symbol) || false;
      if (newApprovedState && !wasApproved) {
        const stock = stocks.find(s => s.symbol === symbol);
        if (stock) {
          return {
            ...prev,
            total_approved: prev.total_approved + 1,
            total_pending: prev.total_pending - 1,
            approved_stocks: [...(prev.approved_stocks || []), stock],
            pending_stocks: (prev.pending_stocks || []).filter(s => s.symbol !== symbol)
          };
        }
      } else if (!newApprovedState && wasApproved) {
        return {
          ...prev,
          total_approved: prev.total_approved - 1,
          total_pending: prev.total_pending + 1,
          approved_stocks: (prev.approved_stocks || []).filter(s => s.symbol !== symbol),
          pending_stocks: [...(prev.pending_stocks || []), ...(prev.approved_stocks?.filter(s => s.symbol === symbol) || [])]
        };
      }
      return prev;
    });

    // Make the API call (fire and forget)
    try {
      await stocksApi.toggleApproval(symbol, targetQuarter, targetYear, newApprovedState);
    } catch (err) {
      // Revert optimistic update on error
      showToast('Failed to update approval status', 'error');
      fetchQuarterData();
    }
  };

  const handleBulkToggleApproval = async (symbols, targetQuarter, targetYear, newApprovedState) => {
    if (!symbols || symbols.length === 0) return;
    setLoading(true);
    showToast(`${newApprovedState ? 'Approving' : 'Resetting'} ${symbols.length} stocks...`, 'info');
    try {
      await stocksApi.bulkToggleApproval(symbols, targetQuarter, targetYear, newApprovedState);
      showToast(`Bulk updated ${symbols.length} stocks successfully.`, 'success');
      await fetchQuarterData();
    } catch (err) {
      showToast(err.message || 'Failed to update approvals in bulk', 'error');
      await fetchQuarterData();
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="app-container">
      {/* Glassmorphic sticky header */}
      <nav className="navbar">
        <div className="navbar-inner">
          <div className="brand">
            <span className="brand-icon">
              <TrendingUp size={20} />
            </span>
            <span>Stock Tracker</span>
          </div>
          
          <div className="nav-links">
            <button
              className={`nav-link ${activeTab === 'tracker' ? 'active' : ''}`}
              onClick={() => setActiveTab('tracker')}
            >
              <CalendarDays size={18} />
              Quarterly Tracker
            </button>
            <button
              className={`nav-link ${activeTab === 'database' ? 'active' : ''}`}
              onClick={() => setActiveTab('database')}
            >
              <Database size={18} />
              Manage Stocks Database
            </button>
          </div>
        </div>
      </nav>
      
      {/* Main Container */}
      <main className="main-content">
        {activeTab === 'tracker' ? (
          <QuarterlyTracker
            quarter={quarter}
            year={year}
            onQuarterChange={setQuarter}
            onYearChange={setYear}
            stocks={stocks}
            approvals={approvals}
            summary={summary}
            loading={loading}
            onToggleApproval={handleToggleApproval}
            onBulkToggleApproval={handleBulkToggleApproval}
            onRefresh={fetchQuarterData}
          />
        ) : (
          <StocksDatabase
            stocks={stocks}
            loading={loading}
            onAddStock={handleAddStock}
            onUpdateStock={handleUpdateStock}
            onDeleteStock={handleDeleteStock}
            onToast={showToast}
            onUploadStocksCsv={handleUploadStocksCsv}
          />
        )}
      </main>
      
      {/* Floating Animated Toast Banner */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === 'success' ? (
            <CheckCircle2 size={20} color="var(--color-success)" />
          ) : (
            <AlertCircle size={20} color="var(--color-danger)" />
          )}
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

export default App;