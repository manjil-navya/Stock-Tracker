const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export const stocksApi = {
  // Stocks CRUD
  async getStocks() {
    const res = await fetch(`${API_BASE}/stocks`);
    if (!res.ok) throw new Error('Failed to fetch stocks');
    return res.json();
  },

  async createStock(stock) {
    const res = await fetch(`${API_BASE}/stocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stock),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to add stock');
    }
    return res.json();
  },

  async updateStock(symbol, stock) {
    const res = await fetch(`${API_BASE}/stocks/${symbol}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stock),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to update stock');
    }
    return res.json();
  },

  async deleteStock(symbol) {
    const res = await fetch(`${API_BASE}/stocks/${symbol}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to delete stock');
    }
    return res.json();
  },

  // Approvals & Summaries
  async getApprovals(quarter, year) {
    const res = await fetch(`${API_BASE}/approvals?quarter=${encodeURIComponent(quarter)}&year=${encodeURIComponent(year)}`);
    if (!res.ok) throw new Error('Failed to fetch quarterly approvals');
    return res.json();
  },

  async getAllApprovals() {
    const res = await fetch(`${API_BASE}/approvals/all`);
    if (!res.ok) throw new Error('Failed to fetch all approvals');
    return res.json();
  },

  async toggleApproval(symbol, quarter, year, approved) {
    const res = await fetch(`${API_BASE}/approvals/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, quarter, year, approved }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to toggle approval status');
    }
    return res.json();
  },

  async bulkToggleApproval(symbols, quarter, year, approved) {
    const res = await fetch(`${API_BASE}/approvals/bulk-toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols, quarter, year, approved }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to bulk toggle approval status');
    }
    return res.json();
  },

  async getSummary(quarter, year) {
    const res = await fetch(`${API_BASE}/summary?quarter=${encodeURIComponent(quarter)}&year=${encodeURIComponent(year)}`);
    if (!res.ok) throw new Error('Failed to fetch summary stats');
    return res.json();
  },

  async uploadStocksCsv(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/stocks/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to upload CSV file');
    }
    return res.json();
  },
};
