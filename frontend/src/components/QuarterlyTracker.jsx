import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw, BarChart3, Clock, Search, ChevronLeft, ChevronRight } from 'lucide-react';

export default function QuarterlyTracker({
  quarter,
  year,
  onQuarterChange,
  onYearChange,
  stocks,
  approvals,
  summary,
  loading,
  onToggleApproval,
  onBulkToggleApproval,
  onRefresh,
}) {
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const years = ['2024/25', '2025/26', '2026/27', '2027/28'];

  // Filters & Pagination State
  const [selectedLetter, setSelectedLetter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'APPROVED'
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  
  // Selection State (using Set for O(1) operations)
  const [selectedSymbols, setSelectedSymbols] = useState(new Set());

  // State to hold selected Year and Quarter for each row (individual overriding)
  const [rowParams, setRowParams] = useState({});

  // Reset page and selection when filter variables or context changes
  useEffect(() => {
    setCurrentPage(1);
    setSelectedSymbols(new Set());
  }, [quarter, year, selectedLetter, statusFilter, searchQuery]);

  // Synchronize row selectors with the global preset filters when they change
  useEffect(() => {
    if (stocks) {
      const initialParams = {};
      stocks.forEach((stock) => {
        initialParams[stock.symbol] = { quarter, year };
      });
      setRowParams(initialParams);
    }
  }, [quarter, year, stocks]);

  const handleRowYearChange = (symbol, val) => {
    setRowParams((prev) => ({
      ...prev,
      [symbol]: { ...prev[symbol], year: val },
    }));
  };

  const handleRowQuarterChange = (symbol, val) => {
    setRowParams((prev) => ({
      ...prev,
      [symbol]: { ...prev[symbol], quarter: val },
    }));
  };

  // Filter only active stocks to display in the tracker list
  const activeStocks = (stocks || []).filter((s) => s.is_active);

  // ----------------------------------------------------
  // DSA Style Optimizations
  // ----------------------------------------------------

  // 1. Build an A-Z HashMap Index for O(1) letter-jump filtering
  const letterIndex = {};
  activeStocks.forEach((stock) => {
    const firstChar = stock.symbol.charAt(0).toUpperCase();
    if (firstChar >= 'A' && firstChar <= 'Z') {
      if (!letterIndex[firstChar]) {
        letterIndex[firstChar] = [];
      }
      letterIndex[firstChar].push(stock);
    }
  });

  // 2. Binary Search Prefix Range Finder: O(log N + K) prefix lookup
  // Since activeStocks and our A-Z indexes are already alphabetically sorted,
  // we can binary search the starting position and collect consecutive matches.
  const binarySearchPrefixRange = (arr, prefix) => {
    if (!prefix) return arr;
    const p = prefix.toUpperCase();
    
    let low = 0;
    let high = arr.length - 1;
    let startIdx = arr.length;
    
    // Find the first index where array item >= prefix
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (arr[mid].symbol.toUpperCase() >= p) {
        startIdx = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    
    // Collect all elements starting with prefix from startIdx
    const matches = [];
    for (let i = startIdx; i < arr.length; i++) {
      if (arr[i].symbol.toUpperCase().startsWith(p)) {
        matches.push(arr[i]);
      } else {
        break; // Exit early since array is sorted
      }
    }
    return matches;
  };

  // 3. Fast O(1) Lookup Table for approval status check
  // Key format: symbol_quarter_year
  const approvalMap = new Map(
    (approvals || []).map((a) => [`${a.stock_symbol}_${a.quarter}_${a.year}`, a.approved])
  );

  // Apply filters in sequence
  // A. A-Z Jump Filter
  let filteredList = selectedLetter === 'ALL' 
    ? activeStocks 
    : (letterIndex[selectedLetter] || []);

  // B. Binary Prefix Search
  if (searchQuery.trim()) {
    filteredList = binarySearchPrefixRange(filteredList, searchQuery.trim());
  }

  // C. Status Filter (Pending/Approved)
  if (statusFilter !== 'ALL') {
    filteredList = filteredList.filter((stock) => {
      // Row overrides might have different periods, but filters check the selected active period
      const isApproved = approvalMap.get(`${stock.symbol}_${quarter}_${year}`) || false;
      return statusFilter === 'APPROVED' ? isApproved : !isApproved;
    });
  }

  // B. Pagination Slice
  const totalItems = filteredList.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const adjustedPage = Math.max(1, Math.min(currentPage, totalPages));
  const startIndex = (adjustedPage - 1) * pageSize;
  const paginatedStocks = filteredList.slice(startIndex, startIndex + pageSize);

  // Calculate approval percentage based on global summary statistics
  const total = summary?.total_active || 0;
  const approved = summary?.total_approved || 0;
  const percent = total > 0 ? Math.round((approved / total) * 100) : 0;

  // SVG Donut Calculations
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  // Process recent activity based on approvals with timestamps
  const recentActivity = (approvals || [])
    .filter((a) => a.approved && a.approved_at)
    .sort((a, b) => new Date(b.approved_at) - new Date(a.approved_at))
    .slice(0, 4)
    .map((a) => {
      const date = new Date(a.approved_at);
      const diffMs = new Date() - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      let timeAgo = 'Just now';
      if (diffDays > 0) timeAgo = `${diffDays}d ago`;
      else if (diffHours > 0) timeAgo = `${diffHours}h ago`;
      else if (diffMins > 0) timeAgo = `${diffMins}m ago`;

      return {
        symbol: a.stock_symbol,
        quarter: a.quarter,
        year: a.year,
        timeAgo,
      };
    });

  // Checkbox interactions
  const allPaginatedSelected = paginatedStocks.length > 0 && paginatedStocks.every(s => selectedSymbols.has(s.symbol));
  const somePaginatedSelected = paginatedStocks.length > 0 && paginatedStocks.some(s => selectedSymbols.has(s.symbol)) && !allPaginatedSelected;

  const handleSelectAllToggle = () => {
    setSelectedSymbols(prev => {
      const next = new Set(prev);
      if (allPaginatedSelected) {
        // Deselect all items present on the current page
        paginatedStocks.forEach(s => next.delete(s.symbol));
      } else {
        // Select all items present on the current page
        paginatedStocks.forEach(s => next.add(s.symbol));
      }
      return next;
    });
  };

  const handleRowSelectToggle = (symbol) => {
    setSelectedSymbols(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  const handleBulkApprove = async () => {
    if (selectedSymbols.size === 0) return;
    if (window.confirm(`Approve all ${selectedSymbols.size} selected stocks for ${quarter} ${year}?`)) {
      await onBulkToggleApproval(Array.from(selectedSymbols), quarter, year, true);
      setSelectedSymbols(new Set());
    }
  };

  const handleBulkReset = async () => {
    if (selectedSymbols.size === 0) return;
    if (window.confirm(`Reset pending status for all ${selectedSymbols.size} selected stocks for ${quarter} ${year}?`)) {
      await onBulkToggleApproval(Array.from(selectedSymbols), quarter, year, false);
      setSelectedSymbols(new Set());
    }
  };

  return (
    <div>
      {/* Selector and Actions Bar */}
      <div className="action-bar">
        <div className="selectors-group">
          <div className="custom-select-wrapper">
            <span className="select-label">Preset Financial Year</span>
            <select
              className="custom-select"
              value={year}
              onChange={(e) => onYearChange(e.target.value)}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="custom-select-wrapper">
            <span className="select-label">Preset Quarter</span>
            <select
              className="custom-select"
              value={quarter}
              onChange={(e) => onQuarterChange(e.target.value)}
            >
              {quarters.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <button className="btn btn-secondary" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh Data
          </button>
        </div>
      </div>

      {/* Summary KPI Widgets */}
      <div className="stats-grid">
        <div className="card stat-card">
          <div className="stat-info">
            <span className="stat-label">Total Active Stocks</span>
            <span className="stat-value">{summary?.total_active ?? 0}</span>
          </div>
          <div className="stat-icon-wrapper primary">
            <BarChart3 size={20} />
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-info">
            <span className="stat-label">Approved (Preset Period)</span>
            <span className="stat-value">{summary?.total_approved ?? 0}</span>
          </div>
          <div className="stat-icon-wrapper success">
            <CheckCircle2 size={20} />
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-info">
            <span className="stat-label">Pending (Preset Period)</span>
            <span className="stat-value">{summary?.total_pending ?? 0}</span>
          </div>
          <div className="stat-icon-wrapper warning">
            <AlertCircle size={20} />
          </div>
        </div>

        <div className="card stat-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem' }}>
          <div className="stat-info" style={{ gap: '0.15rem' }}>
            <span className="stat-label">Completion Status</span>
            <span className="stat-value" style={{ fontSize: '1.9rem' }}>{percent}%</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Approved overall</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="54" height="54" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="27" cy="27" r={radius} fill="transparent" stroke="var(--bg-secondary)" strokeWidth="3.5" />
              <circle
                cx="27"
                cy="27"
                r={radius}
                fill="transparent"
                stroke="var(--accent-primary)"
                strokeWidth="3.5"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }}
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Main Grid: Stocks list and Right summary panel */}
      <div className="content-grid">
        {/* Left Side: Active stocks and their approvals */}
        <div className="card" style={{ padding: '0' }}>
          
          <div style={{ padding: '1.5rem 1.75rem 0 1.75rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              Active Stocks Review
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Verify and approve quarterly updates for all active stocks. Showing {totalItems} matches.
            </p>
          </div>

          {/* Alphabetical A-Z Jump Index */}
          <div className="az-index-container" style={{ marginTop: '1.25rem' }}>
            <button 
              className={`az-index-btn all-btn ${selectedLetter === 'ALL' ? 'active' : ''}`}
              onClick={() => setSelectedLetter('ALL')}
            >
              ALL
            </button>
            {['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'].map(l => {
              const hasStocks = letterIndex[l] && letterIndex[l].length > 0;
              return (
                <button
                  key={l}
                  disabled={!hasStocks}
                  className={`az-index-btn ${selectedLetter === l ? 'active' : ''}`}
                  onClick={() => setSelectedLetter(l)}
                >
                  {l}
                </button>
              );
            })}
          </div>

          {/* Filters Controls Row */}
          <div className="filter-controls-row">
            <div className="search-wrapper" style={{ maxWidth: '280px' }}>
              <Search size={14} color="var(--text-secondary)" />
              <input
                type="text"
                placeholder="Prefix search (binary lookup)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ fontSize: '0.82rem' }}
              />
            </div>

            <div className="status-filter-pills">
              <button 
                className={`status-filter-pill ${statusFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setStatusFilter('ALL')}
              >
                All Status
              </button>
              <button 
                className={`status-filter-pill ${statusFilter === 'PENDING' ? 'active' : ''}`}
                onClick={() => setStatusFilter('PENDING')}
              >
                Pending
              </button>
              <button 
                className={`status-filter-pill ${statusFilter === 'APPROVED' ? 'active' : ''}`}
                onClick={() => setStatusFilter('APPROVED')}
              >
                Approved
              </button>
            </div>
          </div>

          {/* Floating/Sticky Bulk Actions Toolbar */}
          {selectedSymbols.size > 0 && (
            <div className="bulk-actions-bar">
              <div className="bulk-actions-info">
                <span>Selected {selectedSymbols.size} stock{selectedSymbols.size > 1 ? 's' : ''}</span>
              </div>
              <div className="bulk-actions-btns">
                <button className="btn btn-primary" style={{ padding: '0.35rem 0.85rem', fontSize: '0.75rem' }} onClick={handleBulkApprove}>
                  Approve Selected
                </button>
                <button className="btn btn-danger" style={{ padding: '0.35rem 0.85rem', fontSize: '0.75rem' }} onClick={handleBulkReset}>
                  Reset Pending
                </button>
                <button className="btn btn-secondary" style={{ padding: '0.35rem 0.85rem', fontSize: '0.75rem' }} onClick={() => setSelectedSymbols(new Set())}>
                  Deselect All
                </button>
              </div>
            </div>
          )}
          
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            {loading ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }} />
                Loading approval metrics...
              </div>
            ) : paginatedStocks.length === 0 ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                No matching stocks found for the active filter.
              </div>
            ) : (
              <table className="custom-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', paddingLeft: '1.75rem' }}>
                      <input 
                        type="checkbox" 
                        className="custom-checkbox"
                        checked={allPaginatedSelected}
                        ref={el => {
                          if (el) el.indeterminate = somePaginatedSelected;
                        }}
                        onChange={handleSelectAllToggle}
                      />
                    </th>
                    <th>Symbol</th>
                    <th style={{ width: '160px' }}>Financial Year</th>
                    <th style={{ width: '120px' }}>Quarter</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right', paddingRight: '1.75rem' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStocks.map((stock) => {
                    const params = rowParams[stock.symbol] || { quarter, year };
                    const currentQuarter = params.quarter;
                    const currentYear = params.year;

                    // Fetch status from fast Map index
                    const apprRecordApproved = approvalMap.get(`${stock.symbol}_${currentQuarter}_${currentYear}`) || false;
                    const isSelected = selectedSymbols.has(stock.symbol);

                    return (
                      <tr key={stock.symbol} className={isSelected ? 'selected-row' : ''}>
                        <td style={{ paddingLeft: '1.75rem' }}>
                          <input 
                            type="checkbox" 
                            className="custom-checkbox"
                            checked={isSelected}
                            onChange={() => handleRowSelectToggle(stock.symbol)}
                          />
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem' }}>
                          {stock.symbol}
                        </td>
                        <td>
                          <select
                            className="custom-select"
                            style={{ padding: '0.35rem 1.75rem 0.35rem 0.65rem', fontSize: '0.8rem', minWidth: '110px' }}
                            value={currentYear}
                            onChange={(e) => handleRowYearChange(stock.symbol, e.target.value)}
                          >
                            {years.map((y) => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="custom-select"
                            style={{ padding: '0.35rem 1.75rem 0.35rem 0.65rem', fontSize: '0.8rem', minWidth: '80px' }}
                            value={currentQuarter}
                            onChange={(e) => handleRowQuarterChange(stock.symbol, e.target.value)}
                          >
                            {quarters.map((q) => (
                              <option key={q} value={q}>{q}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {apprRecordApproved ? (
                            <span className="badge badge-success">
                              <CheckCircle2 size={11} /> Approved
                            </span>
                          ) : (
                            <span className="badge badge-warning">
                              <AlertCircle size={11} /> Pending
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', paddingRight: '1.75rem' }}>
                          <button
                            className={`btn-approve ${apprRecordApproved ? 'approved' : 'pending'}`}
                            style={{ marginLeft: 'auto' }}
                            onClick={() => onToggleApproval(stock.symbol, currentQuarter, currentYear, !apprRecordApproved)}
                          >
                            {apprRecordApproved ? 'Approved' : 'Approve'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="pagination-container">
              <span className="pagination-info">
                Showing {startIndex + 1} to {Math.min(startIndex + pageSize, totalItems)} of {totalItems} stocks
              </span>
              <div className="pagination-controls">
                <button 
                  className="pagination-btn"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="page-number-indicator">
                  {currentPage} of {totalPages}
                </span>
                <button 
                  className="pagination-btn"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight size={14} />
                </button>

                <select 
                  className="custom-select" 
                  value={pageSize} 
                  onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                  style={{ minWidth: '80px', padding: '0.25rem 1.5rem 0.25rem 0.5rem', fontSize: '0.78rem', marginLeft: '0.5rem' }}
                >
                  <option value={15}>15</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={300}>300</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Right Side Summary Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* Remaining Stocks List */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--color-warning)' }}>
              Remaining for Period ({summary?.total_pending ?? 0})
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Pending active stocks for: <strong>{quarter} {year}</strong>.
            </p>

            <div style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {summary?.pending_stocks?.length === 0 ? (
                <div style={{ padding: '1rem 0', color: 'var(--color-success)', fontSize: '0.85rem', fontWeight: 600 }}>
                  ✓ All active stocks are fully approved!
                </div>
              ) : (
                summary?.pending_stocks?.map((stock) => (
                  <div key={stock.symbol} className="summary-item" style={{ padding: '0.6rem 0' }}>
                    <span className="summary-symbol">{stock.symbol}</span>
                    <span className="badge badge-warning" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}>Pending</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Activity Log */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Clock size={16} /> Recent Activity Log
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Latest approval actions.
            </p>

            <div style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {recentActivity.length === 0 ? (
                <div style={{ padding: '1rem 0', color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center' }}>
                  No recent activities recorded.
                </div>
              ) : (
                recentActivity.map((activity, idx) => (
                  <div key={idx} className="summary-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem', padding: '0.6rem 0' }}>
                    <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="summary-symbol" style={{ fontSize: '0.9rem' }}>{activity.symbol}</span>
                      <span className="badge badge-success" style={{ fontSize: '0.6rem', padding: '0.1rem 0.3rem' }}>Approved</span>
                    </div>
                    <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <span>{activity.quarter} {activity.year}</span>
                      <span>{activity.timeAgo}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* New Active Stocks Widget */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--color-info)' }}>
              New Active Stocks ({summary?.new_stocks?.length ?? 0})
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Listed in the last 90 days.
            </p>

            <div style={{ maxHeight: '180px', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {!summary?.new_stocks || summary.new_stocks.length === 0 ? (
                <div style={{ padding: '1rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  No new stocks listed recently.
                </div>
              ) : (
                summary.new_stocks.map((stock) => (
                  <div key={stock.symbol} className="summary-item" style={{ padding: '0.6rem 0' }}>
                    <span className="summary-symbol" style={{ color: 'var(--color-info)' }}>{stock.symbol}</span>
                    <span className="badge badge-primary" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}>New</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
