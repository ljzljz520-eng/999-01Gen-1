import { dbAsync } from '../db'
import cacheService from '../cache'

export interface BatchListItem {
  id: number
  batch_no: string
  part_name: string
  part_barcode: string
  supplier_name: string
  production_date: string
  shelf_location: string | null
  quantity: number
  is_suspended: number
  is_recalled: number
  recent_issue_count: number
}

export interface SuspensionDetail {
  id: number
  batch_id: number
  batch_no: string
  part_name: string
  reason: string
  issue_count: number
  suspended_at: string
  suspended_by: string | null
  is_active: number
}

export interface IssueDetail {
  id: number
  batch_id: number
  batch_no: string
  part_name: string
  type: string
  description: string | null
  reported_at: string
  reported_by: string | null
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export async function getBatchList(
  page: number = 1,
  pageSize: number = 20,
  filters?: {
    suspendedOnly?: boolean
    recalledOnly?: boolean
    keyword?: string
  }
): Promise<{
  total: number
  list: BatchListItem[]
}> {
  const whereClauses: string[] = []
  const params: any[] = []

  if (filters?.suspendedOnly) {
    whereClauses.push('sp.is_active = 1')
  }
  if (filters?.recalledOnly) {
    whereClauses.push('r.is_active = 1')
  }
  if (filters?.keyword) {
    whereClauses.push(
      '(b.batch_no LIKE ? OR p.name LIKE ? OR p.barcode LIKE ? OR s.name LIKE ?)'
    )
    const keyword = `%${filters.keyword}%`
    params.push(keyword, keyword, keyword, keyword)
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

  const countSql = `
    SELECT COUNT(*) as total
    FROM batches b
    JOIN parts p ON b.part_id = p.id
    JOIN suppliers s ON b.supplier_id = s.id
    LEFT JOIN suspensions sp ON b.id = sp.batch_id
    LEFT JOIN recalls r ON b.id = r.batch_id AND r.is_active = 1
    ${whereSql}
  `

  const { total } = await dbAsync.get<{ total: number }>(countSql, params) || { total: 0 }

  const offset = (page - 1) * pageSize
  const listSql = `
    SELECT
      b.id,
      b.batch_no,
      p.name as part_name,
      p.barcode as part_barcode,
      s.name as supplier_name,
      b.production_date,
      b.shelf_location,
      b.quantity,
      COALESCE(sp.is_active, 0) as is_suspended,
      COALESCE(r.is_active, 0) as is_recalled,
      (
        SELECT COUNT(*)
        FROM issue_records ir
        WHERE ir.batch_id = b.id
          AND ir.reported_at >= strftime('%s', 'now', '-30 days')
      ) as recent_issue_count
    FROM batches b
    JOIN parts p ON b.part_id = p.id
    JOIN suppliers s ON b.supplier_id = s.id
    LEFT JOIN suspensions sp ON b.id = sp.batch_id
    LEFT JOIN recalls r ON b.id = r.batch_id AND r.is_active = 1
    ${whereSql}
    ORDER BY b.created_at DESC
    LIMIT ? OFFSET ?
  `

  const rows = await dbAsync.all<any>(listSql, [...params, pageSize, offset])

  const list: BatchListItem[] = rows.map(row => ({
    ...row,
    production_date: formatDate(row.production_date),
  }))

  return { total, list }
}

export async function suspendBatch(
  batchId: number,
  reason: string,
  suspendedBy: string
): Promise<{ success: boolean; alreadySuspended?: boolean }> {
  const existing = await dbAsync.get(
    'SELECT id FROM suspensions WHERE batch_id = ? AND is_active = 1',
    [batchId]
  )

  if (existing) {
    return { success: false, alreadySuspended: true }
  }

  const { count } = await dbAsync.get<{ count: number }>(
    `
    SELECT COUNT(*) as count
    FROM issue_records
    WHERE batch_id = ? AND reported_at >= strftime('%s', 'now', '-30 days')
    `,
    [batchId]
  ) || { count: 0 }

  const now = Math.floor(Date.now() / 1000)

  await dbAsync.run(
    `
    INSERT INTO suspensions (batch_id, reason, issue_count, suspended_at, suspended_by, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
    `,
    [batchId, reason, count, now, suspendedBy]
  )

  cacheService.deletePattern(/^part:barcode:/)

  return { success: true }
}

export async function unsuspendBatch(
  batchId: number
): Promise<{ success: boolean; notSuspended?: boolean }> {
  const existing = await dbAsync.get(
    'SELECT id FROM suspensions WHERE batch_id = ? AND is_active = 1',
    [batchId]
  )

  if (!existing) {
    return { success: false, notSuspended: true }
  }

  await dbAsync.run('UPDATE suspensions SET is_active = 0 WHERE batch_id = ? AND is_active = 1', [
    batchId,
  ])

  cacheService.deletePattern(/^part:barcode:/)

  return { success: true }
}

export async function getSuspensions(activeOnly: boolean = true): Promise<SuspensionDetail[]> {
  const whereSql = activeOnly ? 'WHERE sp.is_active = 1' : ''
  const sql = `
    SELECT
      sp.id,
      sp.batch_id,
      b.batch_no,
      p.name as part_name,
      sp.reason,
      sp.issue_count,
      sp.suspended_at,
      sp.suspended_by,
      sp.is_active
    FROM suspensions sp
    JOIN batches b ON sp.batch_id = b.id
    JOIN parts p ON b.part_id = p.id
    ${whereSql}
    ORDER BY sp.suspended_at DESC
  `

  const rows = await dbAsync.all<any>(sql)
  return rows.map(row => ({
    ...row,
    suspended_at: formatDate(row.suspended_at),
  }))
}

export async function getIssues(batchId?: number, days: number = 30): Promise<IssueDetail[]> {
  const whereClauses: string[] = [`ir.reported_at >= strftime('%s', 'now', ? || ' days')`]
  const params: any[] = [`-${days}`]

  if (batchId) {
    whereClauses.push('ir.batch_id = ?')
    params.push(batchId)
  }

  const whereSql = `WHERE ${whereClauses.join(' AND ')}`
  const sql = `
    SELECT
      ir.id,
      ir.batch_id,
      b.batch_no,
      p.name as part_name,
      ir.type,
      ir.description,
      ir.reported_at,
      ir.reported_by
    FROM issue_records ir
    JOIN batches b ON ir.batch_id = b.id
    JOIN parts p ON b.part_id = p.id
    ${whereSql}
    ORDER BY ir.reported_at DESC
    LIMIT 100
  `

  const rows = await dbAsync.all<any>(sql, params)
  return rows.map(row => ({
    ...row,
    reported_at: formatDate(row.reported_at),
  }))
}

export async function getDashboardStats(): Promise<{
  totalBatches: number
  suspendedBatches: number
  recalledBatches: number
  recentIssues: number
  topIssueBatches: Array<{
    batch_no: string
    part_name: string
    issue_count: number
  }>
}> {
  const { totalBatches } = await dbAsync.get<{ totalBatches: number }>(
    'SELECT COUNT(*) as totalBatches FROM batches'
  ) || { totalBatches: 0 }

  const { suspendedBatches } = await dbAsync.get<{ suspendedBatches: number }>(
    'SELECT COUNT(*) as suspendedBatches FROM suspensions WHERE is_active = 1'
  ) || { suspendedBatches: 0 }

  const { recalledBatches } = await dbAsync.get<{ recalledBatches: number }>(
    'SELECT COUNT(*) as recalledBatches FROM recalls WHERE is_active = 1'
  ) || { recalledBatches: 0 }

  const { recentIssues } = await dbAsync.get<{ recentIssues: number }>(
    "SELECT COUNT(*) as recentIssues FROM issue_records WHERE reported_at >= strftime('%s', 'now', '-30 days')"
  ) || { recentIssues: 0 }

  const topIssueBatches = await dbAsync.all<{
    batch_no: string
    part_name: string
    issue_count: number
  }>(
    `
    SELECT
      b.batch_no,
      p.name as part_name,
      COUNT(*) as issue_count
    FROM issue_records ir
    JOIN batches b ON ir.batch_id = b.id
    JOIN parts p ON b.part_id = p.id
    WHERE ir.reported_at >= strftime('%s', 'now', '-30 days')
    GROUP BY ir.batch_id
    ORDER BY issue_count DESC
    LIMIT 5
  `
  )

  return {
    totalBatches,
    suspendedBatches,
    recalledBatches,
    recentIssues,
    topIssueBatches,
  }
}
