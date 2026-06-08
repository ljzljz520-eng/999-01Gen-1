import { useState, useEffect, useCallback } from 'react'
import { adminApi } from '../api/client'
import type {
  DashboardStats,
  BatchListItem,
  SuspensionDetail,
  IssueDetail,
} from '../types'
import offlineCache from '../utils/offlineCache'

type TabType = 'dashboard' | 'batches' | 'suspensions' | 'issues'

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  )

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [batches, setBatches] = useState<{ total: number; list: BatchListItem[] }>({
    total: 0,
    list: [],
  })
  const [suspensions, setSuspensions] = useState<SuspensionDetail[]>([])
  const [issues, setIssues] = useState<IssueDetail[]>([])

  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [filters, setFilters] = useState({
    suspendedOnly: false,
    recalledOnly: false,
    keyword: '',
  })
  const [cacheStats, setCacheStats] = useState({
    clientCount: 0,
    serverMemoryCount: 0,
    serverPersistentCount: 0,
  })

  const [suspendModal, setSuspendModal] = useState<{
    show: boolean
    batchId: number
    batchNo: string
  } | null>(null)
  const [suspendReason, setSuspendReason] = useState('')

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const response = await adminApi.getDashboard()
      if (response.success && response.data) {
        setStats(response.data)
      }

      const clientStats = offlineCache.getStats()
      const serverCacheResponse = await adminApi.getCacheStats()
      setCacheStats({
        clientCount: clientStats.count,
        serverMemoryCount: serverCacheResponse.data?.memoryCount || 0,
        serverPersistentCount: serverCacheResponse.data?.persistentCount || 0,
      })
    } catch (err) {
      console.error('加载统计数据失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadBatches = useCallback(async () => {
    setLoading(true)
    try {
      const response = await adminApi.getBatches(page, pageSize, filters)
      if (response.success && response.data) {
        setBatches(response.data)
      }
    } catch (err) {
      console.error('加载批次列表失败:', err)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters])

  const loadSuspensions = useCallback(async () => {
    setLoading(true)
    try {
      const response = await adminApi.getSuspensions(true)
      if (response.success && response.data) {
        setSuspensions(response.data)
      }
    } catch (err) {
      console.error('加载挂起列表失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadIssues = useCallback(async () => {
    setLoading(true)
    try {
      const response = await adminApi.getIssues(undefined, 30)
      if (response.success && response.data) {
        setIssues(response.data)
      }
    } catch (err) {
      console.error('加载问题记录失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => {
    if (activeTab === 'batches') {
      loadBatches()
    } else if (activeTab === 'suspensions') {
      loadSuspensions()
    } else if (activeTab === 'issues') {
      loadIssues()
    }
  }, [activeTab, loadBatches, loadSuspensions, loadIssues])

  const handleSuspend = async () => {
    if (!suspendModal || !suspendReason.trim()) {
      setMessage({ type: 'error', text: '请输入挂起原因' })
      return
    }

    setLoading(true)
    try {
      const response = await adminApi.suspendBatch(
        suspendModal.batchId,
        suspendReason.trim(),
        'admin'
      )
      if (response.success) {
        setMessage({ type: 'success', text: '批次已挂起' })
        setSuspendModal(null)
        setSuspendReason('')
        loadStats()
        if (activeTab === 'batches') loadBatches()
        if (activeTab === 'suspensions') loadSuspensions()
      } else {
        setMessage({ type: 'error', text: response.error || '挂起失败' })
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : '挂起失败',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleUnsuspend = async (batchId: number) => {
    if (!confirm('确定要解除该批次的挂起吗？')) return

    setLoading(true)
    try {
      const response = await adminApi.unsuspendBatch(batchId)
      if (response.success) {
        setMessage({ type: 'success', text: '已解除挂起' })
        loadStats()
        if (activeTab === 'batches') loadBatches()
        if (activeTab === 'suspensions') loadSuspensions()
      } else {
        setMessage({ type: 'error', text: response.error || '解除挂起失败' })
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : '解除挂起失败',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClearCache = async () => {
    if (!confirm('确定要清除所有缓存吗？这将影响离线访问功能。')) return

    try {
      const response = await adminApi.clearCache()
      if (response.success) {
        setMessage({ type: 'success', text: '缓存已清除' })
        loadStats()
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : '清除缓存失败',
      })
    }
  }

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [message])

  const renderDashboard = () => (
    <div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats?.totalBatches || 0}</div>
          <div className="stat-label">总批次</div>
        </div>
        <div className="stat-card">
          <div className="stat-value danger">{stats?.suspendedBatches || 0}</div>
          <div className="stat-label">已挂起批次</div>
        </div>
        <div className="stat-card">
          <div className="stat-value danger">{stats?.recalledBatches || 0}</div>
          <div className="stat-label">召回批次</div>
        </div>
        <div className="stat-card">
          <div className="stat-value warning">{stats?.recentIssues || 0}</div>
          <div className="stat-label">30天内问题</div>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: '24px' }}>{cacheStats.clientCount}</div>
          <div className="stat-label">客户端缓存</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: '24px' }}>{cacheStats.serverMemoryCount}</div>
          <div className="stat-label">服务端内存缓存</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: '24px' }}>{cacheStats.serverPersistentCount}</div>
          <div className="stat-label">服务端持久缓存</div>
        </div>
        <div className="stat-card">
          <button className="btn btn-outline btn-sm" onClick={handleClearCache}>
            🗑️ 清除所有缓存
          </button>
        </div>
      </div>

      {stats?.topIssueBatches && stats.topIssueBatches.length > 0 && (
        <div className="top-issues">
          <h3 style={{ marginBottom: '16px', fontSize: '18px', color: '#1e293b' }}>
            🔥 高风险批次（30天问题最多）
          </h3>
          {stats.topIssueBatches.map((batch, idx) => (
            <div key={idx} className="top-issue-item">
              <div>
                <div style={{ fontWeight: 500 }}>{batch.part_name}</div>
                <div style={{ fontSize: '13px', color: '#6b7280' }}>{batch.batch_no}</div>
              </div>
              <span className="issue-count-badge">{batch.issue_count} 次问题</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderBatches = () => (
    <div>
      <div className="filters">
        <div className="filter-item">
          <input
            type="checkbox"
            id="suspendedOnly"
            checked={filters.suspendedOnly}
            onChange={e => {
              setFilters({ ...filters, suspendedOnly: e.target.checked })
              setPage(1)
            }}
          />
          <label htmlFor="suspendedOnly">仅显示已挂起</label>
        </div>
        <div className="filter-item">
          <input
            type="checkbox"
            id="recalledOnly"
            checked={filters.recalledOnly}
            onChange={e => {
              setFilters({ ...filters, recalledOnly: e.target.checked })
              setPage(1)
            }}
          />
          <label htmlFor="recalledOnly">仅显示有召回</label>
        </div>
        <div className="filter-item" style={{ flex: 1, minWidth: '200px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="搜索批次号、配件名称、供应商..."
            value={filters.keyword}
            onChange={e => {
              setFilters({ ...filters, keyword: e.target.value })
              setPage(1)
            }}
          />
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>批次号</th>
              <th>配件</th>
              <th>供应商</th>
              <th>生产日期</th>
              <th>货架</th>
              <th>库存</th>
              <th>30天问题</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {batches.list.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state" style={{ padding: '40px' }}>
                    <div className="icon">📋</div>
                    <p>暂无批次数据</p>
                  </div>
                </td>
              </tr>
            ) : (
              batches.list.map(batch => (
                <tr key={batch.id}>
                  <td style={{ fontFamily: 'monospace' }}>{batch.batch_no}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{batch.part_name}</div>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      {batch.part_barcode}
                    </div>
                  </td>
                  <td>{batch.supplier_name}</td>
                  <td>{batch.production_date}</td>
                  <td>{batch.shelf_location || '-'}</td>
                  <td>{batch.quantity}</td>
                  <td>
                    {batch.recent_issue_count > 0 ? (
                      <span className="badge badge-warning">{batch.recent_issue_count}</span>
                    ) : (
                      <span className="badge badge-secondary">0</span>
                    )}
                  </td>
                  <td>
                    {batch.is_suspended ? (
                      <span className="badge badge-danger">已挂起</span>
                    ) : batch.is_recalled ? (
                      <span className="badge badge-danger">召回中</span>
                    ) : (
                      <span className="badge badge-success">正常</span>
                    )}
                  </td>
                  <td>
                    {batch.is_suspended ? (
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => handleUnsuspend(batch.id)}
                      >
                        解除挂起
                      </button>
                    ) : (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() =>
                          setSuspendModal({
                            show: true,
                            batchId: batch.id,
                            batchNo: batch.batch_no,
                          })
                        }
                      >
                        挂起
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button
          className="btn btn-secondary btn-sm"
          disabled={page <= 1 || loading}
          onClick={() => setPage(p => Math.max(1, p - 1))}
        >
          上一页
        </button>
        <span className="pagination-info">
          第 {page} 页 / 共 {Math.ceil(batches.total / pageSize)} 页 ({batches.total} 条)
        </span>
        <button
          className="btn btn-secondary btn-sm"
          disabled={page >= Math.ceil(batches.total / pageSize) || loading}
          onClick={() => setPage(p => p + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  )

  const renderSuspensions = () => (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>批次号</th>
              <th>配件</th>
              <th>挂起原因</th>
              <th>问题次数</th>
              <th>挂起时间</th>
              <th>操作人</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {suspensions.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state" style={{ padding: '40px' }}>
                    <div className="icon">✅</div>
                    <p>暂无挂起批次</p>
                  </div>
                </td>
              </tr>
            ) : (
              suspensions.map(s => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'monospace' }}>{s.batch_no}</td>
                  <td>{s.part_name}</td>
                  <td style={{ maxWidth: '300px' }}>{s.reason}</td>
                  <td>
                    <span className="badge badge-danger">{s.issue_count}</span>
                  </td>
                  <td>{s.suspended_at}</td>
                  <td>{s.suspended_by || '-'}</td>
                  <td>
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => handleUnsuspend(s.batch_id)}
                    >
                      解除挂起
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  const renderIssues = () => (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>时间</th>
              <th>批次号</th>
              <th>配件</th>
              <th>类型</th>
              <th>描述</th>
              <th>报告人</th>
            </tr>
          </thead>
          <tbody>
            {issues.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state" style={{ padding: '40px' }}>
                    <div className="icon">📝</div>
                    <p>暂无问题记录</p>
                  </div>
                </td>
              </tr>
            ) : (
              issues.map(issue => (
                <tr key={issue.id}>
                  <td>{issue.reported_at}</td>
                  <td style={{ fontFamily: 'monospace' }}>{issue.batch_no}</td>
                  <td>{issue.part_name}</td>
                  <td>
                    <span
                      className={`badge ${
                        issue.type === 'quality'
                          ? 'badge-danger'
                          : issue.type === 'wear'
                          ? 'badge-warning'
                          : 'badge-secondary'
                      }`}
                    >
                      {issue.type === 'quality'
                        ? '质量'
                        : issue.type === 'wear'
                        ? '磨损'
                        : '其他'}
                    </span>
                  </td>
                  <td style={{ maxWidth: '300px' }}>{issue.description}</td>
                  <td>{issue.reported_by || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div>
      <h1 className="page-title">后台管理</h1>

      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'}`}>
          {message.text}
        </div>
      )}

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          📊 数据看板
        </button>
        <button
          className={`tab ${activeTab === 'batches' ? 'active' : ''}`}
          onClick={() => setActiveTab('batches')}
        >
          📦 批次管理
        </button>
        <button
          className={`tab ${activeTab === 'suspensions' ? 'active' : ''}`}
          onClick={() => setActiveTab('suspensions')}
        >
          🚫 挂起列表
        </button>
        <button
          className={`tab ${activeTab === 'issues' ? 'active' : ''}`}
          onClick={() => setActiveTab('issues')}
        >
          📝 问题记录
        </button>
      </div>

      {loading && activeTab !== 'dashboard' ? (
        <div className="card">
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <span className="loading" style={{ width: '40px', height: '40px' }} />
            <p style={{ marginTop: '16px', color: '#6b7280' }}>加载中...</p>
          </div>
        </div>
      ) : (
        <>
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'batches' && renderBatches()}
          {activeTab === 'suspensions' && renderSuspensions()}
          {activeTab === 'issues' && renderIssues()}
        </>
      )}

      {suspendModal?.show && (
        <div className="modal-overlay" onClick={() => setSuspendModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">
              挂起批次 <span style={{ fontFamily: 'monospace' }}>{suspendModal.batchNo}</span>
            </h3>
            <div className="form-group">
              <label className="form-label">挂起原因</label>
              <textarea
                className="form-input"
                value={suspendReason}
                onChange={e => setSuspendReason(e.target.value)}
                placeholder="请输入挂起原因..."
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setSuspendModal(null)
                  setSuspendReason('')
                }}
              >
                取消
              </button>
              <button
                className="btn btn-danger"
                onClick={handleSuspend}
                disabled={loading || !suspendReason.trim()}
              >
                {loading ? <span className="loading" /> : '确认挂起'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
