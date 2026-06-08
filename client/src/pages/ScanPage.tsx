import { useState, useEffect, useRef, useCallback } from 'react'
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library'
import { partsApi } from '../api/client'
import type { PartDetail } from '../types'
import offlineCache from '../utils/offlineCache'

export default function ScanPage() {
  const [barcodeInput, setBarcodeInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    data: PartDetail
    fromCache?: boolean
    cacheExpiresAt?: number
    offlineFallback?: boolean
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scannerActive, setScannerActive] = useState(false)
  const [cacheInfo, setCacheInfo] = useState({ count: 0 })

  const videoRef = useRef<HTMLVideoElement>(null)
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null)
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const stats = offlineCache.getStats()
    setCacheInfo({ count: stats.count })
  }, [result])

  const handleLookup = useCallback(
    async (barcode: string) => {
      if (!barcode.trim()) {
        setError('请输入条码')
        return
      }

      setLoading(true)
      setError(null)
      setResult(null)

      try {
        const response = await partsApi.lookup(barcode.trim())

        if (response.success && response.data) {
          setResult({
            data: response.data,
            fromCache: response.fromCache,
            cacheExpiresAt: response.cacheExpiresAt,
            offlineFallback: response.fromCache && !!response.error,
          })
          setError(response.error || null)
        } else {
          setError(response.error || '查询失败')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '查询失败')
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleLookup(barcodeInput)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLookup(barcodeInput)
    }
  }

  const startScanner = async () => {
    try {
      setScannerActive(true)
      setError(null)

      if (!codeReaderRef.current) {
        codeReaderRef.current = new BrowserMultiFormatReader()
      }

      if (videoRef.current) {
        await codeReaderRef.current.decodeFromVideoDevice(
          null,
          videoRef.current,
          (result, err) => {
            if (result) {
              const barcode = result.getText()
              setBarcodeInput(barcode)
              stopScanner()
              handleLookup(barcode)
            }
            if (err && !(err instanceof NotFoundException)) {
              console.error('扫描错误:', err)
            }
          }
        )
      }

      scanTimeoutRef.current = setTimeout(() => {
        if (scannerActive) {
          setError('扫描超时，请手动输入条码')
          stopScanner()
        }
      }, 30000)
    } catch (err) {
      setError('无法启动摄像头，请检查权限设置')
      setScannerActive(false)
    }
  }

  const stopScanner = () => {
    if (codeReaderRef.current) {
      codeReaderRef.current.reset()
    }
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current)
    }
    setScannerActive(false)
  }

  useEffect(() => {
    return () => {
      stopScanner()
    }
  }, [])

  const reportIssue = async () => {
    if (!result) return

    const type = prompt('问题类型（quality质量/wear磨损/other其他）:', 'quality')
    if (!type) return

    const description = prompt('请描述问题:')
    if (!description) return

    const reportedBy = prompt('报告人:', '柜台') || '柜台'

    try {
      const response = await partsApi.reportIssue(
        result.data.barcode,
        type,
        description,
        reportedBy
      )
      if (response.success) {
        alert(
          response.data?.autoSuspended
            ? '问题已记录，该批次因多次问题已被自动挂起！'
            : '问题已记录，感谢反馈'
        )
        handleLookup(result.data.barcode)
      } else {
        alert(response.error || '记录失败')
      }
    } catch (err) {
      alert('记录失败:' + (err instanceof Error ? err.message : '未知错误'))
    }
  }

  const getRiskBanner = () => {
    if (!result) return null

    const { riskLevel, suspension, recall } = result.data

    if (riskLevel === 'danger' && suspension?.isActive) {
      return (
        <div className="risk-banner danger">
          <span className="risk-icon">🚫</span>
          <div>
            <strong>高风险：该批次已被挂起</strong>
            <p style={{ fontSize: '14px', marginTop: '4px', fontWeight: 'normal' }}>
              {suspension.reason}（累计 {suspension.issueCount} 次问题）
            </p>
          </div>
        </div>
      )
    }

    if (riskLevel === 'danger' && recall?.isActive) {
      return (
        <div className="risk-banner danger">
          <span className="risk-icon">⚠️</span>
          <div>
            <strong>召回提醒：该批次存在召回</strong>
            <p style={{ fontSize: '14px', marginTop: '4px', fontWeight: 'normal' }}>
              {recall.reason}
            </p>
          </div>
        </div>
      )
    }

    if (riskLevel === 'warning') {
      return (
        <div className="risk-banner warning">
          <span className="risk-icon">⚡</span>
          <div>
            <strong>注意：该批次近期有多次问题反馈</strong>
            <p style={{ fontSize: '14px', marginTop: '4px', fontWeight: 'normal' }}>
              请谨慎使用，建议联系供应商确认
            </p>
          </div>
        </div>
      )
    }

    return (
      <div className="risk-banner normal">
        <span className="risk-icon">✅</span>
        <div>
          <strong>状态正常</strong>
          <p style={{ fontSize: '14px', marginTop: '4px', fontWeight: 'normal' }}>
            该批次无风险，可正常使用
          </p>
        </div>
      </div>
    )
  }

  const formatTimeRemaining = (expiresAt: number) => {
    const remaining = Math.max(0, expiresAt - Date.now())
    const minutes = Math.floor(remaining / 60000)
    const seconds = Math.floor((remaining % 60000) / 1000)
    return `${minutes}分${seconds}秒`
  }

  return (
    <div>
      <h1 className="page-title">
        柜台条码扫描
        <span className="cache-badge">📦 离线缓存: {cacheInfo.count} 条</span>
      </h1>

      {error && (
        <div className={`alert ${result ? 'alert-info' : 'alert-error'}`}>{error}</div>
      )}

      <div className="scanner-section">
        <div className="card">
          <div className="form-group">
            <label className="form-label">输入或扫描条码</label>
            <input
              type="text"
              className="form-input large"
              value={barcodeInput}
              onChange={e => setBarcodeInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="请输入或扫描配件条码..."
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <button
              className="btn btn-primary"
              onClick={handleSubmit as any}
              disabled={loading || !barcodeInput.trim()}
              style={{ flex: 1 }}
            >
              {loading ? <span className="loading" /> : '🔍 查询'}
            </button>
            {!scannerActive ? (
              <button
                className="btn btn-outline"
                onClick={startScanner}
                disabled={loading}
                style={{ flex: 1 }}
              >
                📷 扫码
              </button>
            ) : (
              <button className="btn btn-danger" onClick={stopScanner} style={{ flex: 1 }}>
                ⏹ 停止
              </button>
            )}
          </div>

          <div className="scanner-container">
            {scannerActive ? (
              <>
                <video ref={videoRef} className="scanner-video" playsInline />
                <div className="scanner-overlay" />
              </>
            ) : (
              <div className="scanner-placeholder">
                <div className="icon">📷</div>
                <p>点击"扫码"按钮启动摄像头扫描条码</p>
                <p style={{ fontSize: '14px', marginTop: '8px', opacity: 0.7 }}>
                  支持 EAN-13、Code128、QR Code 等格式
                </p>
              </div>
            )}
          </div>

          <div style={{ marginTop: '20px' }}>
            <p className="form-label">快速测试条码:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {[
                { code: '6901234567890', label: '刹车片（正常）' },
                { code: '6901234567895', label: '机滤（召回）' },
                { code: '6901234567899', label: '皮带（挂起）' },
              ].map(item => (
                <button
                  key={item.code}
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setBarcodeInput(item.code)
                    handleLookup(item.code)
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          {result ? (
            <div className="card result-card">
              {result.offlineFallback && (
                <div className="alert alert-info" style={{ marginBottom: '16px' }}>
                  ⚡ 当前离线，显示缓存数据（有效期至 {formatTimeRemaining(result.cacheExpiresAt!)}）
                </div>
              )}

              {getRiskBanner()}

              <div className="part-header">
                <div>
                  <div className="part-name">{result.data.partName}</div>
                  {result.data.specification && (
                    <div style={{ color: '#6b7280', fontSize: '14px' }}>
                      {result.data.specification}
                    </div>
                  )}
                </div>
                <div className="part-barcode">{result.data.barcode}</div>
              </div>

              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">批次号</span>
                  <span className="info-value">{result.data.batchNo}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">生产日期</span>
                  <span className="info-value">{result.data.productionDate}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">货架位置</span>
                  <span className="info-value">{result.data.shelfLocation || '-'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">库存数量</span>
                  <span className="info-value">
                    {result.data.quantity} {result.data.unit}
                  </span>
                </div>
              </div>

              <div className="info-item">
                <span className="info-label">供应商</span>
                <span className="info-value">
                  {result.data.supplier.name}
                  {result.data.supplier.phone && ` (${result.data.supplier.phone})`}
                </span>
              </div>

              <div className="section-title">适配车型</div>
              <div>
                {result.data.carModels.map((cm, idx) => (
                  <span key={idx} className="car-model-tag">
                    {cm.brand} {cm.model} {cm.yearRange ? `(${cm.yearRange})` : ''}
                  </span>
                ))}
              </div>

              {result.data.recentIssues.length > 0 && (
                <>
                  <div className="section-title">近期问题反馈</div>
                  <ul className="issue-list">
                    {result.data.recentIssues.map((issue, idx) => (
                      <li key={idx} className="issue-item">
                        <div className="issue-type">
                          {issue.type === 'quality'
                            ? '质量问题'
                            : issue.type === 'wear'
                            ? '磨损异常'
                            : '其他问题'}
                        </div>
                        <div className="issue-desc">{issue.description}</div>
                        <div className="issue-meta">
                          {issue.reportedAt} · {issue.reportedBy}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
                <button className="btn btn-outline" onClick={reportIssue}>
                  📝 报告问题
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleLookup(result.data.barcode)}
                  disabled={loading}
                >
                  🔄 刷新
                </button>
              </div>

              {result.fromCache && result.cacheExpiresAt && (
                <div style={{ marginTop: '16px', fontSize: '12px', color: '#9ca3af' }}>
                  💾 数据缓存中，将在 {formatTimeRemaining(result.cacheExpiresAt)} 后过期
                </div>
              )}
            </div>
          ) : (
            <div className="card">
              <div className="empty-state">
                <div className="icon">📦</div>
                <p>请输入或扫描条码查询配件信息</p>
                <p style={{ fontSize: '14px', marginTop: '8px' }}>
                  查询结果将自动缓存，支持离线访问（5分钟有效）
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
