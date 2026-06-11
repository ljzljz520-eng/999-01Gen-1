import { dbAsync } from '../db'
import cacheService from '../cache'
import type { PartDetail, IssueRecord } from '../types'

const CACHE_TTL = 5 * 60 * 1000
const AUTO_SUSPEND_ISSUE_COUNT = 3
const RECENT_ISSUE_DAYS = 30

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export async function getPartDetailByBarcode(barcode: string): Promise<{
  data: PartDetail
  fromCache: boolean
  cacheExpiresAt: number
} | null> {
  const cacheKey = `part:barcode:${barcode}`
  const cached = cacheService.get<PartDetail>(cacheKey)

  if (cached) {
    return cached
  }

  const row = await dbAsync.get<any>(
    `
    SELECT
      p.barcode,
      p.name as part_name,
      p.specification,
      p.unit,
      b.batch_no,
      b.production_date,
      b.shelf_location,
      b.quantity,
      s.id as supplier_id,
      s.name as supplier_name,
      s.contact as supplier_contact,
      s.phone as supplier_phone,
      r.reason as recall_reason,
      r.recall_date,
      r.is_active as recall_active,
      sp.reason as suspension_reason,
      sp.issue_count,
      sp.suspended_at,
      sp.suspended_by,
      sp.is_active as suspension_active,
      b.id as batch_id
    FROM batches b
    JOIN parts p ON b.part_id = p.id
    JOIN suppliers s ON b.supplier_id = s.id
    LEFT JOIN batch_barcodes bb ON bb.batch_id = b.id AND bb.barcode = ?
    LEFT JOIN recalls r ON b.id = r.batch_id AND r.is_active = 1
    LEFT JOIN suspensions sp ON b.id = sp.batch_id AND sp.is_active = 1
    WHERE p.barcode = ? OR bb.barcode = ?
    LIMIT 1
    `,
    [barcode, barcode, barcode]
  )

  if (!row) {
    return null
  }

  const carModels = await dbAsync.all<{ brand: string; model: string; year_range?: string }>(
    `
    SELECT cm.brand, cm.model, cm.year_range
    FROM batch_car_models bcm
    JOIN car_models cm ON bcm.car_model_id = cm.id
    WHERE bcm.batch_id = ?
    `,
    [row.batch_id]
  )

  const recentIssuesCutoff = Math.floor(Date.now() / 1000) - RECENT_ISSUE_DAYS * 24 * 60 * 60
  const recentIssues = await dbAsync.all<IssueRecord>(
    `
    SELECT type, description, reported_at, reported_by
    FROM issue_records
    WHERE batch_id = ?
      AND reported_at >= ?
    ORDER BY reported_at DESC
    LIMIT 5
    `,
    [row.batch_id, recentIssuesCutoff]
  )

  const hasActiveRecall = row.recall_active === 1
  const hasActiveSuspension = row.suspension_active === 1

  let riskLevel: PartDetail['riskLevel'] = 'normal'
  let isRisk = false

  if (hasActiveSuspension) {
    riskLevel = 'danger'
    isRisk = true
  } else if (hasActiveRecall) {
    riskLevel = 'danger'
    isRisk = true
  } else if (recentIssues.length >= 2) {
    riskLevel = 'warning'
    isRisk = true
  }

  const partDetail: PartDetail = {
    barcode: row.barcode,
    partName: row.part_name,
    specification: row.specification,
    unit: row.unit,
    batchNo: row.batch_no,
    productionDate: formatDate(row.production_date),
    shelfLocation: row.shelf_location,
    quantity: row.quantity,
    supplier: {
      id: row.supplier_id,
      name: row.supplier_name,
      contact: row.supplier_contact,
      phone: row.supplier_phone,
    },
    carModels: carModels.map(cm => ({
      brand: cm.brand,
      model: cm.model,
      yearRange: cm.year_range,
    })),
    recall: hasActiveRecall
      ? {
          reason: row.recall_reason,
          recallDate: formatDate(row.recall_date),
          isActive: true,
        }
      : undefined,
    suspension: hasActiveSuspension
      ? {
          reason: row.suspension_reason,
          issueCount: row.issue_count,
          suspendedAt: formatDate(row.suspended_at),
          suspendedBy: row.suspended_by,
          isActive: true,
        }
      : undefined,
    isRisk,
    riskLevel,
    recentIssues: recentIssues.map(issue => ({
      type: issue.type,
      description: issue.description,
      reportedAt: formatDate(issue.reported_at),
      reportedBy: issue.reported_by,
    })),
  }

  cacheService.set(cacheKey, partDetail, CACHE_TTL, true)

  return {
    data: partDetail,
    fromCache: false,
    cacheExpiresAt: Date.now() + CACHE_TTL,
  }
}

export async function reportIssue(
  batchId: number,
  type: string,
  description: string,
  reportedBy: string
): Promise<{ success: boolean; autoSuspended?: boolean }> {
  const now = Math.floor(Date.now() / 1000)

  await dbAsync.run(
    'INSERT INTO issue_records (batch_id, type, description, reported_at, reported_by) VALUES (?, ?, ?, ?, ?)',
    [batchId, type, description, now, reportedBy]
  )

  const { count } = await dbAsync.get<{ count: number }>(
    `
    SELECT COUNT(*) as count
    FROM issue_records
    WHERE batch_id = ? AND reported_at >= ?
    `,
    [batchId, now - 30 * 24 * 60 * 60]
  ) || { count: 0 }

  let autoSuspended = false

  if (count >= AUTO_SUSPEND_ISSUE_COUNT) {
    const existingSuspension = await dbAsync.get(
      'SELECT id FROM suspensions WHERE batch_id = ? AND is_active = 1',
      [batchId]
    )

    if (!existingSuspension) {
      await dbAsync.run(
        `
        INSERT INTO suspensions (batch_id, reason, issue_count, suspended_at, suspended_by, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
        `,
        [batchId, `30天内累计${count}次问题反馈，系统自动挂起`, count, now, 'system']
      )
      autoSuspended = true
    }
  }

  cacheService.deletePattern(/^part:barcode:/)

  return { success: true, autoSuspended }
}

export async function getBatchByBarcode(
  barcode: string
): Promise<{ id: number; batch_no: string } | null> {
  const result = await dbAsync.get<{ id: number; batch_no: string }>(
    `
    SELECT b.id, b.batch_no
    FROM batches b
    JOIN parts p ON b.part_id = p.id
    LEFT JOIN batch_barcodes bb ON bb.batch_id = b.id AND bb.barcode = ?
    WHERE p.barcode = ? OR bb.barcode = ?
    LIMIT 1
    `,
    [barcode, barcode, barcode]
  )
  return result || null
}
