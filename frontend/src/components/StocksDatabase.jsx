import React, { useState } from 'react';
import { Plus, Search, Edit2, Trash2, FileSpreadsheet, Upload, Download, RefreshCw } from 'lucide-react';

export default function StocksDatabase({
  stocks,
  loading,
  onAddStock,
  onUpdateStock,
  onDeleteStock,
  onToast = () => {},
  onUploadStocksCsv = () => {},
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStock, setEditingStock] = useState(null); // null when adding, stock object when editing
  
  // Form State
  const [symbol, setSymbol] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  
  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  
  const handleOpenAddModal = () => {
    setEditingStock(null);
    setSymbol('');
    setIsActive(true);
    setError('');
    setIsModalOpen(true);
  };
  
  const handleOpenEditModal = (stock) => {
    setEditingStock(stock);
    setSymbol(stock.symbol);
    setIsActive(stock.is_active);
    setError('');
    setIsModalOpen(true);
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!symbol.trim()) {
      setError('Please fill in the Stock Symbol.');
      return;
    }
    
    const payload = {
      symbol: symbol.trim().toUpperCase(),
      is_active: isActive,
    };
    
    if (editingStock) {
      onUpdateStock(editingStock.symbol, payload)
        .then(() => setIsModalOpen(false))
        .catch((err) => setError(err.message || 'Failed to update stock.'));
    } else {
      onAddStock(payload)
        .then(() => setIsModalOpen(false))
        .catch((err) => setError(err.message || 'Failed to add stock.'));
    }
  };
  
  const handleDelete = (symbol) => {
    if (window.confirm(`Are you sure you want to delete ${symbol} from the active database? This will also update the local CSV file.`)) {
      onDeleteStock(symbol);
    }
  };
  
  // File upload handler
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      await onUploadStocksCsv(file);
    } catch (err) {
      setUploadError(err.message || 'Failed to upload CSV');
      onToast(err.message || 'Failed to upload CSV', 'error');
    } finally {
      setUploading(false);
      e.target.value = ''; // reset input
    }
  };

  // CSV Export handler
  const handleExportCSV = () => {
    if (!stocks || stocks.length === 0) {
      onToast('No stocks available to export', 'error');
      return;
    }
    
    // Create headers and rows
    const headers = ['Symbol', 'IsActive', 'CreatedAt'];
    const rows = stocks.map(stock => [
      stock.symbol,
      stock.is_active ? 'True' : 'False',
      stock.created_at
    ]);
    
    // Format CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${val}"`).join(','))
    ].join('\n');
    
    // Create a blob and download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `stocks_database_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onToast('CSV exported successfully');
  };
  
  // Filter stocks by search
  const filteredStocks = stocks.filter((stock) => {
    const term = searchTerm.toLowerCase();
    return stock.symbol.toLowerCase().includes(term);
  });
  
  return (
    <div>
      {/* Search & Actions Bar */}
      <div className="action-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="search-wrapper">
          <Search size={16} color="var(--text-secondary)" />
          <input
            type="text"
            placeholder="Search stock code, symbol..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <button className="btn btn-primary" onClick={handleOpenAddModal}>
            <Plus size={14} />
            Add Stock Ticker
          </button>
          
          <button 
            className="btn btn-secondary" 
            onClick={() => document.getElementById('csv-file-input')?.click()}
            disabled={uploading}
          >
            {uploading ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
            Upload CSV
          </button>

          <button 
            className="btn btn-secondary" 
            onClick={handleExportCSV}
            title="Export stocks as CSV"
          >
            <Download size={14} />
            Export CSV
          </button>
          
          {/* Hidden file input */}
          <input
            type="file"
            id="csv-file-input"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
      </div>
      
      {uploadError && (
        <div style={{ backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.85rem' }}>
          {uploadError}
        </div>
      )}
      
      {/* Main Stock Data Grid */}
      <div className="card" style={{ padding: '0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 1.75rem', borderBottom: '1px solid var(--border-color)' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Active Stocks Database</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Add, edit, or configure equity securities. All actions sync directly with the CSV repository.
            </p>
          </div>
          <span className="badge badge-primary" style={{ display: 'flex', gap: '0.35rem' }}>
            <FileSpreadsheet size={12} /> CSV Sync Active
          </span>
        </div>
        
        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          {loading ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }} />
              Loading database records...
            </div>
          ) : filteredStocks.length === 0 ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {searchTerm ? 'No matching stocks found for your search query.' : 'No stocks available in the CSV database.'}
            </div>
          ) : (
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Status</th>
                  <th>Created/Added</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStocks.map((stock) => (
                  <tr key={stock.symbol}>
                    <td style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem' }}>{stock.symbol}</td>
                    <td>
                      {stock.is_active ? (
                        <span className="badge badge-success">Active</span>
                      ) : (
                        <span className="badge badge-danger">Inactive</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {new Date(stock.created_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.45rem', borderRadius: '4px' }}
                          onClick={() => handleOpenEditModal(stock)}
                          title="Edit Stock"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '0.45rem', borderRadius: '4px' }}
                          onClick={() => handleDelete(stock.symbol)}
                          title="Delete Stock"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      
      {/* Slide-in / Fade-in Modal Form */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {editingStock ? 'Edit Stock Details' : 'Add New Stock'}
            </h3>
            
            {error && (
              <div style={{ backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', marginBottom: '1.25rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                {error}
              </div>
            )}
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Stock Symbol (Ticker)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. AAPL"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  disabled={!!editingStock} // Cannot change ticker code after creation
                  required
                />
                {!editingStock && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Uppercase short code representing the equity.
                  </p>
                )}
              </div>
              
              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.75rem', marginTop: '1.25rem', marginBottom: '0.25rem' }}>
                <input
                  type="checkbox"
                  id="isActiveCheck"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
                />
                <label htmlFor="isActiveCheck" style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Mark Stock as Active
                </label>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '1.5rem', marginBottom: '1.5rem' }}>
                Inactive stocks will not be listed in quarterly reviews.
              </p>
              
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingStock ? 'Save Changes' : 'Create & Sync'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}