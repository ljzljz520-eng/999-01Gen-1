import { dbAsync, initDb } from './index'

function toTimestamp(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 1000)
}

async function seed() {
  await initDb()

  await dbAsync.run('DELETE FROM issue_records')
  await dbAsync.run('DELETE FROM suspensions')
  await dbAsync.run('DELETE FROM recalls')
  await dbAsync.run('DELETE FROM batch_car_models')
  await dbAsync.run('DELETE FROM batch_barcodes')
  await dbAsync.run('DELETE FROM batches')
  await dbAsync.run('DELETE FROM car_models')
  await dbAsync.run('DELETE FROM parts')
  await dbAsync.run('DELETE FROM suppliers')

  const suppliers = [
    { name: '上海汽车零部件有限公司', contact: '张经理', phone: '13800138001' },
    { name: '广州汽配制造集团', contact: '李总', phone: '13900139002' },
    { name: '北京汽车配件供应商', contact: '王工', phone: '13700137003' },
  ]

  const supplierIds: number[] = []
  for (const s of suppliers) {
    const result = await dbAsync.run(
      'INSERT INTO suppliers (name, contact, phone) VALUES (?, ?, ?)',
      [s.name, s.contact, s.phone]
    )
    supplierIds.push(Number(result.lastID))
  }

  const parts = [
    { barcode: '6901234567890', name: '前刹车片', specification: 'D1234 前制动片', unit: '套' },
    { barcode: '6901234567893', name: '空气滤清器', specification: 'A5678 高效过滤', unit: '个' },
    { barcode: '6901234567895', name: '机油滤清器', specification: 'O9012 旋装式', unit: '个' },
    { barcode: '6901234567897', name: '火花塞', specification: 'PK16TT 双铂金', unit: '支' },
    { barcode: '6901234567899', name: '正时皮带', specification: 'TB234 正时传动带', unit: '条' },
  ]

  const partIds: number[] = []
  for (const p of parts) {
    const result = await dbAsync.run(
      'INSERT INTO parts (barcode, name, specification, unit) VALUES (?, ?, ?, ?)',
      [p.barcode, p.name, p.specification, p.unit]
    )
    partIds.push(Number(result.lastID))
  }

  const carModels = [
    { brand: '大众', model: '帕萨特', year_range: '2019-2024' },
    { brand: '大众', model: '迈腾', year_range: '2020-2024' },
    { brand: '丰田', model: '凯美瑞', year_range: '2018-2024' },
    { brand: '丰田', model: '卡罗拉', year_range: '2019-2024' },
    { brand: '本田', model: '雅阁', year_range: '2020-2024' },
    { brand: '本田', model: '思域', year_range: '2019-2024' },
    { brand: '奥迪', model: 'A4L', year_range: '2020-2024' },
    { brand: '宝马', model: '3系', year_range: '2019-2024' },
  ]

  const carModelIds: number[] = []
  for (const c of carModels) {
    const result = await dbAsync.run(
      'INSERT INTO car_models (brand, model, year_range) VALUES (?, ?, ?)',
      [c.brand, c.model, c.year_range]
    )
    carModelIds.push(Number(result.lastID))
  }

  const batches = [
    {
      batch_no: 'B20240601001',
      part_id: partIds[0],
      supplier_id: supplierIds[0],
      production_date: toTimestamp('2024-06-01'),
      shelf_location: 'A-01-03',
      quantity: 200,
    },
    {
      batch_no: 'B20240515002',
      part_id: partIds[1],
      supplier_id: supplierIds[1],
      production_date: toTimestamp('2024-05-15'),
      shelf_location: 'B-02-05',
      quantity: 500,
    },
    {
      batch_no: 'B20240420003',
      part_id: partIds[2],
      supplier_id: supplierIds[2],
      production_date: toTimestamp('2024-04-20'),
      shelf_location: 'A-03-08',
      quantity: 300,
    },
    {
      batch_no: 'B20240310004',
      part_id: partIds[3],
      supplier_id: supplierIds[0],
      production_date: toTimestamp('2024-03-10'),
      shelf_location: 'C-01-02',
      quantity: 1000,
    },
    {
      batch_no: 'B20240205005',
      part_id: partIds[4],
      supplier_id: supplierIds[1],
      production_date: toTimestamp('2024-02-05'),
      shelf_location: 'D-04-10',
      quantity: 150,
    },
  ]

  const batchIds: number[] = []
  for (const b of batches) {
    const result = await dbAsync.run(
      'INSERT INTO batches (batch_no, part_id, supplier_id, production_date, shelf_location, quantity) VALUES (?, ?, ?, ?, ?, ?)',
      [b.batch_no, b.part_id, b.supplier_id, b.production_date, b.shelf_location, b.quantity]
    )
    batchIds.push(Number(result.lastID))
  }

  const batchCarModels = [
    { batch_id: batchIds[0], car_model_ids: [carModelIds[0], carModelIds[1], carModelIds[6]] },
    { batch_id: batchIds[1], car_model_ids: [carModelIds[2], carModelIds[3]] },
    { batch_id: batchIds[2], car_model_ids: [carModelIds[4], carModelIds[5], carModelIds[7]] },
    { batch_id: batchIds[3], car_model_ids: [carModelIds[0], carModelIds[2], carModelIds[4]] },
    { batch_id: batchIds[4], car_model_ids: [carModelIds[6], carModelIds[7]] },
  ]

  for (const bcm of batchCarModels) {
    for (const cmId of bcm.car_model_ids) {
      await dbAsync.run(
        'INSERT INTO batch_car_models (batch_id, car_model_id) VALUES (?, ?)',
        [bcm.batch_id, cmId]
      )
    }
  }

  await dbAsync.run(
    'INSERT INTO recalls (batch_id, reason, recall_date, is_active) VALUES (?, ?, ?, ?)',
    [batchIds[2], '密封圈材质不合格，可能导致漏油', toTimestamp('2024-06-01'), 1]
  )

  await dbAsync.run(
    'INSERT INTO suspensions (batch_id, reason, issue_count, suspended_at, suspended_by, is_active) VALUES (?, ?, ?, ?, ?, ?)',
    [batchIds[4], '连续3次客户反馈断裂问题', 3, toTimestamp('2024-06-05'), 'admin', 1]
  )

  const issues = [
    {
      batch_id: batchIds[4],
      type: 'quality',
      description: '客户反馈高速行驶时皮带断裂',
      reported_at: toTimestamp('2024-05-20'),
      reported_by: '柜台A',
    },
    {
      batch_id: batchIds[4],
      type: 'quality',
      description: '客户反馈使用3000公里后出现裂纹',
      reported_at: toTimestamp('2024-05-28'),
      reported_by: '柜台B',
    },
    {
      batch_id: batchIds[4],
      type: 'quality',
      description: '客户反馈张紧度不足，跳齿',
      reported_at: toTimestamp('2024-06-03'),
      reported_by: '柜台C',
    },
    {
      batch_id: batchIds[0],
      type: 'wear',
      description: '客户反馈刹车片磨损过快，2万公里需更换',
      reported_at: toTimestamp('2024-06-02'),
      reported_by: '柜台A',
    },
  ]

  for (const issue of issues) {
    await dbAsync.run(
      'INSERT INTO issue_records (batch_id, type, description, reported_at, reported_by) VALUES (?, ?, ?, ?, ?)',
      [issue.batch_id, issue.type, issue.description, issue.reported_at, issue.reported_by]
    )
  }

  console.log('数据库种子数据插入成功！')
  console.log('\n测试条码（parts.barcode，扫码直用）：')
  console.log('  6901234567890 - 前刹车片（正常）')
  console.log('  6901234567893 - 空气滤清器（正常）')
  console.log('  6901234567895 - 机油滤清器（有召回）')
  console.log('  6901234567897 - 火花塞（正常）')
  console.log('  6901234567899 - 正时皮带（已挂起，高风险）')
}

seed().catch(console.error)
