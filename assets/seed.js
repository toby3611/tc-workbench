// 示例种子数据（首次运行写入 localStorage；部署时由 GitHub 仓库 data/ 覆盖）
window.SEED = {
  _version: '17',
  users: [
    { id:'admin', account:'admin', password:'123456', name:'黄总', role:'admin', standards:['all'] },
    { id:'userA', account:'userA', password:'123456', name:'员工A', role:'user', standards:['Regenagri','GRS','RCS'] },
    { id:'userB', account:'userB', password:'123456', name:'员工B', role:'user', standards:['GOTS','OCS'] }
  ],
  standards: [
    { key:'Regenagri', name:'Regenagri', shortName:'REG', system:'CU', systemName:'Control Union', agency:'CU' },
    { key:'GRS', name:'GRS', shortName:'GRS', system:'ECOCERT', systemName:'ECOCERT', agency:'ECOCERT' },
    { key:'RCS', name:'RCS', shortName:'RCS', system:'ECOCERT', systemName:'ECOCERT', agency:'ECOCERT' },
    { key:'GOTS', name:'GOTS', shortName:'GOTS', system:'ECOCERT', systemName:'ECOCERT', agency:'ECOCERT' },
    { key:'OCS', name:'OCS', shortName:'OCS', system:'ECOCERT', systemName:'ECOCERT', agency:'ECOCERT' }
  ],
  // 原纱额度汇总表：每一行对应一类原纱额度；由证书录入自动累加
  quotas: [
    { standard:'Regenagri', agency:'CU', tcNo:'TC-TH-01', tcDate:'2026-08', name:'C7SB 合计', batch:'-', composition:'-', weight:112214.64, unit:'kg', remark:'Regenagri 原纱额度' },
    { standard:'Regenagri', agency:'CU', tcNo:'TC-TH-02', tcDate:'2026-08', name:'OE7/OE', batch:'-', composition:'-', weight:31575.00, unit:'kg', remark:'Regenagri 原纱额度' },
    { standard:'Regenagri', agency:'CU', tcNo:'TC-QD-01', tcDate:'2026-08', name:'C7高捻', batch:'-', composition:'-', weight:24021.00, unit:'kg', remark:'Regenagri 原纱额度' },
    { standard:'Regenagri', agency:'CU', tcNo:'TC-QD-02', tcDate:'2026-08', name:'C8SB', batch:'-', composition:'-', weight:15086.00, unit:'kg', remark:'Regenagri 原纱额度' },
    { standard:'Regenagri', agency:'CU', tcNo:'TC-VT-01', tcDate:'2026-08', name:'C6/C6.5SB', batch:'-', composition:'-', weight:15466.00, unit:'kg', remark:'Regenagri 原纱额度' },
    { standard:'Regenagri', agency:'CU', tcNo:'TC-VT-02', tcDate:'2026-08', name:'天虹混纺/其他', batch:'-', composition:'-', weight:1478.33, unit:'kg', remark:'Regenagri 原纱额度' }
  ],
  // 原纱 TC 证书库：Regenagri 7 张正本（天虹2 / 越南群达2 / VTEX3）
  certificates: [
    { id:'C1', standard:'Regenagri', supplier:'天虹', tcNo:'TC-TH-01', weight:800.00, date:'2026-08' },
    { id:'C2', standard:'Regenagri', supplier:'天虹', tcNo:'TC-TH-02', weight:678.33, date:'2026-08' },
    { id:'C3', standard:'Regenagri', supplier:'越南群达', tcNo:'TC-QD-01', weight:3050.00, date:'2026-08' },
    { id:'C4', standard:'Regenagri', supplier:'越南群达', tcNo:'TC-QD-02', weight:3050.00, date:'2026-08' },
    { id:'C5', standard:'Regenagri', supplier:'VTEX', tcNo:'TC-VT-01', weight:64087.55, date:'2026-08' },
    { id:'C6', standard:'Regenagri', supplier:'VTEX', tcNo:'TC-VT-02', weight:64087.55, date:'2026-08' },
    { id:'C7', standard:'Regenagri', supplier:'VTEX', tcNo:'TC-VT-03', weight:64087.54, date:'2026-08' }
  ],
  // 订单：示例 KAMA / A6149A（Regenagri），新订单置顶
  orders: [
    {
      id:'ORD-001', standard:'Regenagri', customer:'PHONG PHU INTERNATIONAL JSC', po:'PPJ/FAB/26/5318', weight:4871,
      statusStep:3, stepName:'额度计算', createdBy:'userA', createdAt:'2026-08-22 09:30',
      // 订单关键字段（合同号故意不合规，用于演示标红）
      productionOrder:'PO-2605377H', fabricCode:'A6149A-REG', batchNo:'2605377H', contractNo:'2026-0818',
      quantityY:7615.5, netWeight:4871, grossWeight:5120,
      // 按文件保存识别结果，用于多文件一致性核对
      fileExtractions:[
        { name:'KAMA_订单资料.pdf', size:'1.2MB', status:'已识别', extracted:{
          productionOrder:'PO-2605377H', fabricCode:'A6149A-REG', batchNo:'2605377H', contractNo:'2026-0818',
          quantityY:7615.5, netWeight:4871, grossWeight:5120, customer:'PHONG PHU INTERNATIONAL JSC', po:'PPJ/FAB/26/5318'
        }}
      ],
      extracted:{
        productionOrder:'PO-2605377H', fabricCode:'A6149A-REG', batchNo:'2605377H', contractNo:'2026-0818',
        quantityY:7615.5, netWeight:4871, grossWeight:5120, customer:'PHONG PHU INTERNATIONAL JSC', po:'PPJ/FAB/26/5318'
      }
    },
    {
      id:'ORD-000', standard:'Regenagri', customer:'KAMA', po:'KAMA-2026-001', weight:3000,
      statusStep:6, stepName:'出正本', createdBy:'userA', createdAt:'2026-08-21 14:00',
      productionOrder:'PO-OLD-0001', fabricCode:'A6149A-REG', batchNo:'2605001H', contractNo:'CTR-2026-0001',
      quantityY:5000, netWeight:3000, grossWeight:3200,
      files:[], extracted:{}
    }
  ],
  // 字段识别别名词典：订单文件上传后，按这些别名识别关键字段
  fieldDict: {
    fabricCode: { label:'布编', aliases:['编号','Denim Fabric','Article No','Art No','Fabric Code','Style','Item No','布编','布号'] },
    // 缸号固定结构：7位数字 + 1个字母（如 2605173H），数字会变但始终7位，字母会变但始终1个
    batchNo: { label:'缸号', pattern:'\\d{7}[A-Za-z]', aliases:['BATCH#','Batch No','LOT#','Lot No','缸号','批号'] },
    netWeight: { label:'净重(kg)', aliases:['净重 千克 Net Weight (KG)','净重 千克','Net Weight (KG)','TTL N.W.','Net Weight','N.W.','净重','Net Wt'] },
    grossWeight: { label:'毛重(kg)', aliases:['毛重 千克 Gross Weight (KG)','毛重 千克','Gross Weight (KG)','TTL G.W.','Gross Weight','G.W.','毛重','Gross Wt'] },
    quantityY: { label:'数量(y)', aliases:['数量 QTY(Y)','QTY(Y)','Yds','Yard','Quantity','数量','总数'] },
    contractNo: { label:'合同号', aliases:['Contract No','CTR-xxxx','合同号'] },
    po: { label:'PO号', aliases:['PO No.','PO No','P/O','Customer PO','PO'] },
    productionOrder: { label:'生产订单号', aliases:['生产订单号','生产单号','Production Order'] },
    customer: { label:'客户', aliases:['收货方 Consignee','Consignee','收货方','Buyer','Customer','Sold To','购买方'] },
    // Composition 本身已在 extractFields 硬编码正则中处理（要求冒号），
    // 若放入 aliases 会被表格表头 "Composition and content(%)" 误抓为 "and"，故默认只保留中文/缩写
    composition: { label:'成分', aliases:['成分','Comp'] },
    invoiceNo: { label:'发票号', aliases:['Invoice No','发票号','Inv No'] }
  },
  settings: {
    systems: {
      CU: { name:'Control Union', standards:['Regenagri'], status:'已接入', url:'https://certifications.controlunion.com/icu/zh-Hans/login' },
      ECOCERT: { name:'ECOCERT NTC', standards:['GRS','RCS','GOTS','OCS'], status:'已接入', url:'https://ntc.ecocert.cc/client', account:'vananhdao42@gmail.com' }
    }
  }
};
