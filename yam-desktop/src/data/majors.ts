// 掌上考研 专业目录完整数据
// 来源：https://www.kaoyan.cn/major-list/0-308-0
// 生成时间：2026-07-15 01:47:15

export interface Major {
  code: string;
  name: string;
}

export interface FirstLevelDiscipline {
  code: string;
  name: string;
  majors: Major[];
}

export interface DisciplineCategory {
  code: string;
  name: string;
  disciplines: FirstLevelDiscipline[];
}

// ============================================================
// 学术学位 专业目录
// ============================================================

export const ACADEMIC_CATEGORIES: DisciplineCategory[] = [
  {
    code: '01',
    name: '哲学',
    disciplines: [
      {
        code: '0101',
        name: '哲学',
        majors: [
          { code: '010100', name: '哲学' },
          { code: '010101', name: '马克思主义哲学' },
          { code: '010102', name: '中国哲学' },
          { code: '010103', name: '外国哲学' },
          { code: '010104', name: '逻辑学' },
          { code: '010105', name: '伦理学' },
          { code: '010106', name: '美学' },
          { code: '010107', name: '宗教学' },
          { code: '010108', name: '科学技术哲学' },
        ],
      },
    ],
  },
  {
    code: '02',
    name: '经济学',
    disciplines: [
      {
        code: '0201',
        name: '理论经济学',
        majors: [
          { code: '020100', name: '理论经济学' },
          { code: '020101', name: '政治经济学' },
          { code: '020102', name: '经济思想史' },
          { code: '020103', name: '经济史' },
          { code: '020104', name: '西方经济学' },
          { code: '020105', name: '世界经济' },
          { code: '020106', name: '人口、资源与环境经济学' },
        ],
      },
      {
        code: '0202',
        name: '应用经济学',
        majors: [
          { code: '020200', name: '应用经济学' },
          { code: '020201', name: '国民经济学' },
          { code: '020202', name: '区域经济学' },
          { code: '020203', name: '财政学' },
          { code: '020204', name: '金融学' },
          { code: '020205', name: '产业经济学' },
          { code: '020206', name: '国际贸易学' },
          { code: '020207', name: '劳动经济学' },
          { code: '020208', name: '统计学' },
          { code: '020209', name: '数量经济学' },
          { code: '020210', name: '国防经济' },
        ],
      },
      {
        code: '0270',
        name: '统计学',
        majors: [
          { code: '027000', name: '统计学' },
        ],
      },
    ],
  },
  {
    code: '03',
    name: '法学',
    disciplines: [
      {
        code: '0301',
        name: '法学',
        majors: [
          { code: '030100', name: '法学' },
          { code: '030101', name: '法学理论' },
          { code: '030102', name: '法律史' },
          { code: '030103', name: '宪法学与行政法学' },
          { code: '030104', name: '刑法学' },
          { code: '030105', name: '民商法学' },
          { code: '030106', name: '诉讼法学' },
          { code: '030107', name: '经济法学' },
          { code: '030108', name: '环境与资源保护法学' },
          { code: '030109', name: '国际法学' },
          { code: '030110', name: '军事法学' },
        ],
      },
      {
        code: '0302',
        name: '政治学',
        majors: [
          { code: '030200', name: '政治学' },
          { code: '030201', name: '政治学理论' },
          { code: '030202', name: '中外政治制度' },
          { code: '030203', name: '科学社会主义与国际共产主义运动' },
          { code: '030204', name: '中共党史' },
          { code: '030206', name: '国际政治' },
          { code: '030207', name: '国际关系' },
          { code: '030208', name: '外交学' },
        ],
      },
      {
        code: '0303',
        name: '社会学',
        majors: [
          { code: '030300', name: '社会学' },
          { code: '030301', name: '社会学' },
          { code: '030302', name: '人口学' },
          { code: '030303', name: '人类学' },
          { code: '030304', name: '民俗学' },
        ],
      },
      {
        code: '0304',
        name: '民族学',
        majors: [
          { code: '030400', name: '民族学' },
          { code: '030401', name: '民族学' },
          { code: '030402', name: '马克思主义民族理论与政策' },
          { code: '030403', name: '中国少数民族经济' },
          { code: '030404', name: '中国少数民族史' },
          { code: '030405', name: '中国少数民族艺术' },
        ],
      },
      {
        code: '0305',
        name: '马克思主义理论',
        majors: [
          { code: '030500', name: '马克思主义理论' },
          { code: '030501', name: '马克思主义基本原理' },
          { code: '030502', name: '马克思主义发展史' },
          { code: '030503', name: '马克思主义中国化研究' },
          { code: '030504', name: '国外马克思主义研究' },
          { code: '030505', name: '思想政治教育' },
          { code: '030506', name: '中国近现代史基本问题研究' },
        ],
      },
      {
        code: '0306',
        name: '公安学',
        majors: [
          { code: '030600', name: '公安学' },
        ],
      },
      {
        code: '0307',
        name: '中共党史党建学',
        majors: [
          { code: '030700', name: '中共党史党建学' },
        ],
      },
      {
        code: '0308',
        name: '纪检监察学',
        majors: [
          { code: '030800', name: '纪检监察学' },
        ],
      },
      {
        code: '0370',
        name: '国家安全学',
        majors: [
          { code: '037000', name: '国家安全学' },
        ],
      },
      {
        code: '0371',
        name: '区域国别学',
        majors: [
          { code: '037100', name: '区域国别学' },
        ],
      },
    ],
  },
  {
    code: '04',
    name: '教育学',
    disciplines: [
      {
        code: '0401',
        name: '教育学',
        majors: [
          { code: '040100', name: '教育学' },
          { code: '040101', name: '教育学原理' },
          { code: '040102', name: '课程与教学论' },
          { code: '040103', name: '教育史' },
          { code: '040104', name: '比较教育学' },
          { code: '040105', name: '学前教育学' },
          { code: '040106', name: '高等教育学' },
          { code: '040107', name: '成人教育学' },
          { code: '040108', name: '职业技术教育学' },
          { code: '040109', name: '特殊教育学' },
          { code: '040110', name: '教育技术学' },
          { code: '040111', name: '教育法学' },
        ],
      },
      {
        code: '0402',
        name: '心理学',
        majors: [
          { code: '040200', name: '心理学' },
          { code: '040201', name: '基础心理学' },
          { code: '040202', name: '发展与教育心理学' },
          { code: '040203', name: '应用心理学' },
        ],
      },
      {
        code: '0403',
        name: '体育学',
        majors: [
          { code: '040300', name: '体育学' },
          { code: '040301', name: '体育人文社会学' },
          { code: '040302', name: '运动人体科学' },
          { code: '040303', name: '体育教育训练学' },
          { code: '040304', name: '民族传统体育学' },
        ],
      },
      {
        code: '0471',
        name: '0471(暂未公布学科名称)',
        majors: [
          { code: '047101', name: '教育经济与管理' },
        ],
      },
    ],
  },
  {
    code: '05',
    name: '文学',
    disciplines: [
      {
        code: '0501',
        name: '中国语言文学',
        majors: [
          { code: '050100', name: '中国语言文学' },
          { code: '050101', name: '文艺学' },
          { code: '050102', name: '语言学及应用语言学' },
          { code: '050103', name: '汉语言文字学' },
          { code: '050104', name: '中国古典文献学' },
          { code: '050105', name: '中国古代文学' },
          { code: '050106', name: '中国现当代文学' },
          { code: '050107', name: '中国少数民族语言文学' },
          { code: '050108', name: '比较文学与世界文学' },
        ],
      },
      {
        code: '0502',
        name: '外国语言文学',
        majors: [
          { code: '050200', name: '外国语言文学' },
          { code: '050201', name: '英语语言文学' },
          { code: '050202', name: '俄语语言文学' },
          { code: '050203', name: '法语语言文学' },
          { code: '050204', name: '德语语言文学' },
          { code: '050205', name: '日语语言文学' },
          { code: '050206', name: '印度语言文学' },
          { code: '050207', name: '西班牙语语言文学' },
          { code: '050208', name: '阿拉伯语语言文学' },
          { code: '050209', name: '欧洲语言文学' },
          { code: '050210', name: '亚非语言文学' },
          { code: '050211', name: '外国语言学及应用语言学' },
        ],
      },
      {
        code: '0503',
        name: '新闻传播学',
        majors: [
          { code: '050300', name: '新闻传播学' },
          { code: '050301', name: '新闻学' },
          { code: '050302', name: '传播学' },
        ],
      },
      {
        code: '0570',
        name: '区域国别学',
        majors: [
          { code: '057000', name: '区域国别学' },
        ],
      },
    ],
  },
  {
    code: '06',
    name: '历史学',
    disciplines: [
      {
        code: '0601',
        name: '考古学',
        majors: [
          { code: '060100', name: '考古学' },
        ],
      },
      {
        code: '0602',
        name: '中国史',
        majors: [
          { code: '060200', name: '中国史' },
          { code: '0602L2', name: '历史文献学（含∶敦煌学、古文字学）' },
          { code: '0602L4', name: '中国古代史' },
          { code: '0602L5', name: '中国近现代史' },
        ],
      },
      {
        code: '0603',
        name: '世界史',
        majors: [
          { code: '060300', name: '世界史' },
        ],
      },
    ],
  },
  {
    code: '07',
    name: '理学',
    disciplines: [
      {
        code: '0701',
        name: '数学',
        majors: [
          { code: '070100', name: '数学' },
          { code: '070101', name: '基础数学' },
          { code: '070102', name: '计算数学' },
          { code: '070103', name: '概率论与数理统计' },
          { code: '070104', name: '应用数学' },
          { code: '070105', name: '运筹学与控制论' },
        ],
      },
      {
        code: '0702',
        name: '物理学',
        majors: [
          { code: '070200', name: '物理学' },
          { code: '070201', name: '理论物理' },
          { code: '070202', name: '粒子物理与原子核物理' },
          { code: '070203', name: '原子与分子物理' },
          { code: '070204', name: '等离子体物理' },
          { code: '070205', name: '凝聚态物理' },
          { code: '070206', name: '声学' },
          { code: '070207', name: '光学' },
          { code: '070208', name: '无线电物理' },
        ],
      },
      {
        code: '0703',
        name: '化学',
        majors: [
          { code: '070300', name: '化学' },
          { code: '070301', name: '无机化学' },
          { code: '070302', name: '分析化学' },
          { code: '070303', name: '有机化学' },
          { code: '070304', name: '物理化学' },
          { code: '070305', name: '高分子化学与物理' },
        ],
      },
      {
        code: '0704',
        name: '天文学',
        majors: [
          { code: '070400', name: '天文学' },
          { code: '070401', name: '天体物理' },
          { code: '070402', name: '天体测量与天体力学' },
        ],
      },
      {
        code: '0705',
        name: '地理学',
        majors: [
          { code: '070500', name: '地理学' },
          { code: '070501', name: '自然地理学' },
          { code: '070502', name: '人文地理学' },
          { code: '070503', name: '地图学与地理信息系统' },
        ],
      },
      {
        code: '0706',
        name: '大气科学',
        majors: [
          { code: '070600', name: '大气科学' },
          { code: '070601', name: '气象学' },
          { code: '070602', name: '大气物理学与大气环境' },
        ],
      },
      {
        code: '0707',
        name: '海洋科学',
        majors: [
          { code: '070700', name: '海洋科学' },
          { code: '070701', name: '物理海洋学' },
          { code: '070702', name: '海洋化学' },
          { code: '070703', name: '海洋生物学' },
          { code: '070704', name: '海洋地质' },
        ],
      },
      {
        code: '0708',
        name: '地球物理学',
        majors: [
          { code: '070800', name: '地球物理学' },
          { code: '070801', name: '固体地球物理学' },
          { code: '070802', name: '空间物理学' },
        ],
      },
      {
        code: '0709',
        name: '地质学',
        majors: [
          { code: '070900', name: '地质学' },
          { code: '070901', name: '矿物学、岩石学、矿床学' },
          { code: '070902', name: '地球化学' },
          { code: '070903', name: '古生物学与地层学' },
          { code: '070904', name: '构造地质学' },
          { code: '070905', name: '第四纪地质学' },
        ],
      },
      {
        code: '0710',
        name: '生物学',
        majors: [
          { code: '071000', name: '生物学' },
          { code: '071001', name: '植物学' },
          { code: '071002', name: '动物学' },
          { code: '071003', name: '生理学' },
          { code: '071004', name: '水生生物学' },
          { code: '071005', name: '微生物学' },
          { code: '071006', name: '神经生物学' },
          { code: '071007', name: '遗传学' },
          { code: '071008', name: '发育生物学' },
          { code: '071009', name: '细胞生物学' },
          { code: '071010', name: '生物化学与分子生物学' },
          { code: '071011', name: '生物物理学' },
        ],
      },
      {
        code: '0711',
        name: '系统科学',
        majors: [
          { code: '071100', name: '系统科学' },
          { code: '071101', name: '系统理论' },
          { code: '071102', name: '系统分析与集成' },
        ],
      },
      {
        code: '0712',
        name: '科学技术史',
        majors: [
          { code: '071200', name: '科学技术史' },
        ],
      },
      {
        code: '0713',
        name: '生态学',
        majors: [
          { code: '071300', name: '生态学' },
        ],
      },
      {
        code: '0714',
        name: '统计学',
        majors: [
          { code: '071400', name: '统计学' },
        ],
      },
      {
        code: '0770',
        name: '集成电路科学与工程',
        majors: [
          { code: '077000', name: '集成电路科学与工程' },
        ],
      },
      {
        code: '0771',
        name: '心理学',
        majors: [
          { code: '077100', name: '心理学' },
          { code: '077101', name: '基础心理学' },
          { code: '077102', name: '发展与教育心理学' },
          { code: '077103', name: '应用心理学' },
        ],
      },
      {
        code: '0772',
        name: '力学',
        majors: [
          { code: '077200', name: '力学' },
          { code: '077201', name: '一般力学与力学基础' },
          { code: '077203', name: '流体力学' },
        ],
      },
      {
        code: '0773',
        name: '材料科学与工程',
        majors: [
          { code: '077300', name: '材料科学与工程' },
          { code: '077301', name: '材料物理与化学' },
          { code: '077302', name: '材料学' },
        ],
      },
      {
        code: '0774',
        name: '电子科学与技术',
        majors: [
          { code: '077400', name: '电子科学与技术' },
          { code: '077401', name: '物理电子学' },
          { code: '077402', name: '电路与系统' },
          { code: '077403', name: '微电子学与固体电子学' },
        ],
      },
      {
        code: '0775',
        name: '计算机科学与技术',
        majors: [
          { code: '077500', name: '计算机科学与技术' },
          { code: '077503', name: '计算机应用技术' },
        ],
      },
      {
        code: '0776',
        name: '环境科学与工程',
        majors: [
          { code: '077600', name: '环境科学与工程' },
          { code: '077601', name: '环境科学' },
          { code: '077602', name: '环境工程' },
        ],
      },
      {
        code: '0777',
        name: '生物医学工程',
        majors: [
          { code: '077700', name: '生物医学工程' },
        ],
      },
      {
        code: '0778',
        name: '基础医学',
        majors: [
          { code: '077800', name: '基础医学' },
          { code: '077801', name: '人体解剖与组织胚胎学' },
          { code: '077802', name: '免疫学' },
          { code: '077803', name: '病原生物学' },
          { code: '077804', name: '病理学与病理生理学' },
          { code: '077806', name: '放射医学' },
        ],
      },
      {
        code: '0779',
        name: '公共卫生与预防医学',
        majors: [
          { code: '077900', name: '公共卫生与预防医学' },
          { code: '077901', name: '流行病与卫生统计学' },
          { code: '077903', name: '营养与食品卫生学' },
        ],
      },
      {
        code: '0780',
        name: '药学',
        majors: [
          { code: '078000', name: '药学' },
          { code: '078001', name: '药物化学' },
          { code: '078002', name: '药剂学' },
          { code: '078004', name: '药物分析学' },
          { code: '078005', name: '微生物与生化药学' },
          { code: '078006', name: '药理学' },
        ],
      },
      {
        code: '0781',
        name: '中药学',
        majors: [
          { code: '078100', name: '中药学' },
        ],
      },
      {
        code: '0784',
        name: '0784(暂未公布学科名称)',
        majors: [
          { code: '078401', name: '教育技术学' },
        ],
      },
      {
        code: '0786',
        name: '0786(暂未公布学科名称)',
        majors: [
          { code: '078601', name: '农药学' },
        ],
      },
      {
        code: '0787',
        name: '遥感科学与技术',
        majors: [
          { code: '078700', name: '遥感科学与技术' },
        ],
      },
      {
        code: '0788',
        name: '智能科学与技术',
        majors: [
          { code: '078800', name: '智能科学与技术' },
        ],
      },
      {
        code: '0789',
        name: '纳米科学与工程',
        majors: [
          { code: '078900', name: '纳米科学与工程' },
        ],
      },
    ],
  },
  {
    code: '08',
    name: '工学',
    disciplines: [
      {
        code: '0801',
        name: '力学',
        majors: [
          { code: '080100', name: '力学' },
          { code: '080101', name: '一般力学与力学基础' },
          { code: '080102', name: '固体力学' },
          { code: '080103', name: '流体力学' },
          { code: '080104', name: '工程力学' },
        ],
      },
      {
        code: '0802',
        name: '机械工程',
        majors: [
          { code: '080200', name: '机械工程' },
          { code: '080201', name: '机械制造及其自动化' },
          { code: '080202', name: '机械电子工程' },
          { code: '080203', name: '机械设计及理论' },
          { code: '080204', name: '车辆工程' },
        ],
      },
      {
        code: '0803',
        name: '光学工程',
        majors: [
          { code: '080300', name: '光学工程' },
        ],
      },
      {
        code: '0804',
        name: '仪器科学与技术',
        majors: [
          { code: '080400', name: '仪器科学与技术' },
          { code: '080401', name: '精密仪器及机械' },
          { code: '080402', name: '测试计量技术及仪器' },
        ],
      },
      {
        code: '0805',
        name: '材料科学与工程',
        majors: [
          { code: '080500', name: '材料科学与工程' },
          { code: '080501', name: '材料物理与化学' },
          { code: '080502', name: '材料学' },
          { code: '080503', name: '材料加工工程' },
        ],
      },
      {
        code: '0806',
        name: '冶金工程',
        majors: [
          { code: '080600', name: '冶金工程' },
          { code: '080601', name: '冶金物理化学' },
          { code: '080602', name: '钢铁冶金' },
          { code: '080603', name: '有色金属冶金' },
        ],
      },
      {
        code: '0807',
        name: '动力工程及工程热物理',
        majors: [
          { code: '080700', name: '动力工程及工程热物理' },
          { code: '080701', name: '工程热物理' },
          { code: '080702', name: '热能工程' },
          { code: '080703', name: '动力机械及工程' },
          { code: '080704', name: '流体机械及工程' },
          { code: '080705', name: '制冷及低温工程' },
          { code: '080706', name: '化工过程机械' },
        ],
      },
      {
        code: '0808',
        name: '电气工程',
        majors: [
          { code: '080800', name: '电气工程' },
          { code: '080801', name: '电机与电器' },
          { code: '080802', name: '电力系统及其自动化' },
          { code: '080803', name: '高电压与绝缘技术' },
          { code: '080804', name: '电力电子与电力传动' },
          { code: '080805', name: '电工理论与新技术' },
        ],
      },
      {
        code: '0809',
        name: '电子科学与技术',
        majors: [
          { code: '080900', name: '电子科学与技术' },
          { code: '080901', name: '物理电子学' },
          { code: '080902', name: '电路与系统' },
          { code: '080903', name: '微电子学与固体电子学' },
          { code: '080904', name: '电磁场与微波技术' },
        ],
      },
      {
        code: '0810',
        name: '信息与通信工程',
        majors: [
          { code: '081000', name: '信息与通信工程' },
          { code: '081001', name: '通信与信息系统' },
          { code: '081002', name: '信号与信息处理' },
        ],
      },
      {
        code: '0811',
        name: '控制科学与工程',
        majors: [
          { code: '081100', name: '控制科学与工程' },
          { code: '081101', name: '控制理论与控制工程' },
          { code: '081102', name: '检测技术与自动化装置' },
          { code: '081103', name: '系统工程' },
          { code: '081104', name: '模式识别与智能系统' },
          { code: '081105', name: '导航、制导与控制' },
        ],
      },
      {
        code: '0812',
        name: '计算机科学与技术',
        majors: [
          { code: '081200', name: '计算机科学与技术' },
          { code: '081201', name: '计算机系统结构' },
          { code: '081202', name: '计算机软件与理论' },
          { code: '081203', name: '计算机应用技术' },
        ],
      },
      {
        code: '0813',
        name: '建筑学',
        majors: [
          { code: '081300', name: '建筑学' },
          { code: '081301', name: '建筑历史与理论' },
          { code: '081302', name: '建筑设计及其理论' },
          { code: '081304', name: '建筑技术科学' },
        ],
      },
      {
        code: '0814',
        name: '土木工程',
        majors: [
          { code: '081400', name: '土木工程' },
          { code: '081401', name: '岩土工程' },
          { code: '081402', name: '结构工程' },
          { code: '081403', name: '市政工程' },
          { code: '081404', name: '供热、供燃气、通风及空调工程' },
          { code: '081405', name: '防灾减灾工程及防护工程' },
          { code: '081406', name: '桥梁与隧道工程' },
        ],
      },
      {
        code: '0815',
        name: '水利工程',
        majors: [
          { code: '081500', name: '水利工程' },
          { code: '081501', name: '水文学及水资源' },
          { code: '081502', name: '水力学及河流动力学' },
          { code: '081503', name: '水工结构工程' },
          { code: '081504', name: '水利水电工程' },
          { code: '081505', name: '港口、海岸及近海工程' },
        ],
      },
      {
        code: '0816',
        name: '测绘科学与技术',
        majors: [
          { code: '081600', name: '测绘科学与技术' },
          { code: '081601', name: '大地测量学与测量工程' },
          { code: '081602', name: '摄影测量与遥感' },
          { code: '081603', name: '地图制图学与地理信息工程' },
        ],
      },
      {
        code: '0817',
        name: '化学工程与技术',
        majors: [
          { code: '081700', name: '化学工程与技术' },
          { code: '081701', name: '化学工程' },
          { code: '081702', name: '化学工艺' },
          { code: '081703', name: '生物化工' },
          { code: '081704', name: '应用化学' },
          { code: '081705', name: '工业催化' },
        ],
      },
      {
        code: '0818',
        name: '地质资源与地质工程',
        majors: [
          { code: '081800', name: '地质资源与地质工程' },
          { code: '081801', name: '矿产普查与勘探' },
          { code: '081802', name: '地球探测与信息技术' },
          { code: '081803', name: '地质工程' },
        ],
      },
      {
        code: '0819',
        name: '矿业工程',
        majors: [
          { code: '081900', name: '矿业工程' },
          { code: '081901', name: '采矿工程' },
          { code: '081902', name: '矿物加工工程' },
          { code: '081903', name: '安全技术及工程' },
        ],
      },
      {
        code: '0820',
        name: '石油与天然气工程',
        majors: [
          { code: '082000', name: '石油与天然气工程' },
          { code: '082001', name: '油气井工程' },
          { code: '082002', name: '油气田开发工程' },
          { code: '082003', name: '油气储运工程' },
        ],
      },
      {
        code: '0821',
        name: '纺织科学与工程',
        majors: [
          { code: '082100', name: '纺织科学与工程' },
          { code: '082101', name: '纺织工程' },
          { code: '082102', name: '纺织材料与纺织品设计' },
          { code: '082103', name: '纺织化学与染整工程' },
          { code: '082104', name: '服装设计与工程' },
        ],
      },
      {
        code: '0822',
        name: '轻工技术与工程',
        majors: [
          { code: '082200', name: '轻工技术与工程' },
          { code: '082201', name: '制浆造纸工程' },
          { code: '082202', name: '制糖工程' },
          { code: '082203', name: '发酵工程' },
        ],
      },
      {
        code: '0823',
        name: '交通运输工程',
        majors: [
          { code: '082300', name: '交通运输工程' },
          { code: '082301', name: '道路与铁道工程' },
          { code: '082302', name: '交通信息工程及控制' },
          { code: '082303', name: '交通运输规划与管理' },
          { code: '082304', name: '载运工具运用工程' },
        ],
      },
      {
        code: '0824',
        name: '船舶与海洋工程',
        majors: [
          { code: '082400', name: '船舶与海洋工程' },
          { code: '082401', name: '船舶与海洋结构物设计制造' },
          { code: '082402', name: '轮机工程' },
          { code: '082403', name: '水声工程' },
        ],
      },
      {
        code: '0825',
        name: '航空宇航科学与技术',
        majors: [
          { code: '082500', name: '航空宇航科学与技术' },
          { code: '082501', name: '飞行器设计' },
          { code: '082502', name: '航空宇航推进理论与工程' },
          { code: '082503', name: '航空宇航制造工程' },
          { code: '082504', name: '人机与环境工程' },
        ],
      },
      {
        code: '0826',
        name: '兵器科学与技术',
        majors: [
          { code: '082600', name: '兵器科学与技术' },
          { code: '082601', name: '武器系统与运用工程' },
          { code: '082602', name: '兵器发射理论与技术' },
          { code: '082603', name: '火炮、自动武器与弹药工程' },
          { code: '082604', name: '军事化学与烟火技术' },
        ],
      },
      {
        code: '0827',
        name: '核科学与技术',
        majors: [
          { code: '082700', name: '核科学与技术' },
          { code: '082701', name: '核能科学与工程' },
          { code: '082702', name: '核燃料循环与材料' },
          { code: '082703', name: '核技术及应用' },
          { code: '082704', name: '辐射防护及环境保护' },
        ],
      },
      {
        code: '0828',
        name: '农业工程',
        majors: [
          { code: '082800', name: '农业工程' },
          { code: '082801', name: '农业机械化工程' },
          { code: '082802', name: '农业水土工程' },
          { code: '082803', name: '农业生物环境与能源工程' },
          { code: '082804', name: '农业电气化与自动化' },
        ],
      },
      {
        code: '0829',
        name: '林业工程',
        majors: [
          { code: '082900', name: '林业工程' },
          { code: '082901', name: '森林工程' },
          { code: '082902', name: '木材科学与技术' },
          { code: '082903', name: '林产化学加工工程' },
        ],
      },
      {
        code: '0830',
        name: '环境科学与工程',
        majors: [
          { code: '083000', name: '环境科学与工程' },
          { code: '083001', name: '环境科学' },
          { code: '083002', name: '环境工程' },
        ],
      },
      {
        code: '0831',
        name: '生物医学工程',
        majors: [
          { code: '083100', name: '生物医学工程' },
        ],
      },
      {
        code: '0832',
        name: '食品科学与工程',
        majors: [
          { code: '083200', name: '食品科学与工程' },
          { code: '083201', name: '食品科学' },
          { code: '083202', name: '粮食、油脂及植物蛋白工程' },
          { code: '083203', name: '农产品加工及贮藏工程' },
          { code: '083204', name: '水产品加工及贮藏工程' },
        ],
      },
      {
        code: '0833',
        name: '城乡规划学',
        majors: [
          { code: '083300', name: '城乡规划学' },
        ],
      },
      {
        code: '0835',
        name: '软件工程',
        majors: [
          { code: '083500', name: '软件工程' },
        ],
      },
      {
        code: '0836',
        name: '生物工程',
        majors: [
          { code: '083600', name: '生物工程' },
        ],
      },
      {
        code: '0837',
        name: '安全科学与工程',
        majors: [
          { code: '083700', name: '安全科学与工程' },
        ],
      },
      {
        code: '0838',
        name: '公安技术',
        majors: [
          { code: '083800', name: '公安技术' },
        ],
      },
      {
        code: '0839',
        name: '网络空间安全',
        majors: [
          { code: '083900', name: '网络空间安全' },
        ],
      },
      {
        code: '0871',
        name: '管理科学与工程',
        majors: [
          { code: '087100', name: '管理科学与工程' },
        ],
      },
      {
        code: '0872',
        name: '设计学',
        majors: [
          { code: '087200', name: '设计学' },
        ],
      },
      {
        code: '0873',
        name: '集成电路科学与工程',
        majors: [
          { code: '087300', name: '集成电路科学与工程' },
        ],
      },
      {
        code: '0875',
        name: '遥感科学与技术',
        majors: [
          { code: '087500', name: '遥感科学与技术' },
        ],
      },
      {
        code: '0876',
        name: '智能科学与技术',
        majors: [
          { code: '087600', name: '智能科学与技术' },
        ],
      },
    ],
  },
  {
    code: '09',
    name: '农学',
    disciplines: [
      {
        code: '0901',
        name: '作物学',
        majors: [
          { code: '090100', name: '作物学' },
          { code: '090101', name: '作物栽培学与耕作学' },
          { code: '090102', name: '作物遗传育种' },
        ],
      },
      {
        code: '0902',
        name: '园艺学',
        majors: [
          { code: '090200', name: '园艺学' },
          { code: '090201', name: '果树学' },
          { code: '090202', name: '蔬菜学' },
          { code: '090203', name: '茶学' },
        ],
      },
      {
        code: '0903',
        name: '农业资源与环境',
        majors: [
          { code: '090300', name: '农业资源与环境' },
          { code: '090301', name: '土壤学' },
          { code: '090302', name: '植物营养学' },
        ],
      },
      {
        code: '0904',
        name: '植物保护',
        majors: [
          { code: '090400', name: '植物保护' },
          { code: '090401', name: '植物病理学' },
          { code: '090402', name: '农业昆虫与害虫防治' },
          { code: '090403', name: '农药学' },
        ],
      },
      {
        code: '0905',
        name: '畜牧学',
        majors: [
          { code: '090500', name: '畜牧学' },
          { code: '090501', name: '动物遗传育种与繁殖' },
          { code: '090502', name: '动物营养与饲料科学' },
          { code: '090504', name: '特种经济动物饲养' },
        ],
      },
      {
        code: '0906',
        name: '兽医学',
        majors: [
          { code: '090600', name: '兽医学' },
          { code: '090601', name: '基础兽医学' },
          { code: '090602', name: '预防兽医学' },
          { code: '090603', name: '临床兽医学' },
        ],
      },
      {
        code: '0907',
        name: '林学',
        majors: [
          { code: '090700', name: '林学' },
          { code: '090701', name: '林木遗传育种' },
          { code: '090702', name: '森林培育' },
          { code: '090703', name: '森林保护学' },
          { code: '090704', name: '森林经理学' },
          { code: '090705', name: '野生动植物保护与利用' },
          { code: '090706', name: '园林植物与观赏园艺' },
          { code: '090707', name: '水土保持与荒漠化防治' },
        ],
      },
      {
        code: '0908',
        name: '水产',
        majors: [
          { code: '090800', name: '水产' },
          { code: '090801', name: '水产养殖' },
          { code: '090802', name: '捕捞学' },
          { code: '090803', name: '渔业资源' },
        ],
      },
      {
        code: '0909',
        name: '草学',
        majors: [
          { code: '090900', name: '草学' },
        ],
      },
      {
        code: '0910',
        name: '水土保持与荒漠化防治学',
        majors: [
          { code: '091000', name: '水土保持与荒漠化防治学' },
        ],
      },
      {
        code: '0970',
        name: '科学技术史',
        majors: [
          { code: '097000', name: '科学技术史' },
        ],
      },
      {
        code: '0971',
        name: '环境科学与工程',
        majors: [
          { code: '097100', name: '环境科学与工程' },
          { code: '097101', name: '环境科学' },
        ],
      },
      {
        code: '0972',
        name: '食品科学与工程',
        majors: [
          { code: '097200', name: '食品科学与工程' },
          { code: '097201', name: '食品科学' },
          { code: '097202', name: '粮食、油脂及植物蛋白工程' },
          { code: '097203', name: '农产品加工及贮藏工程' },
          { code: '097204', name: '水产品加工及贮藏工程' },
        ],
      },
    ],
  },
  {
    code: '10',
    name: '医学',
    disciplines: [
      {
        code: '1001',
        name: '基础医学',
        majors: [
          { code: '100100', name: '基础医学' },
          { code: '100101', name: '人体解剖与组织胚胎学' },
          { code: '100102', name: '免疫学' },
          { code: '100103', name: '病原生物学' },
          { code: '100104', name: '病理学与病理生理学' },
          { code: '100105', name: '法医学' },
          { code: '100106', name: '放射医学' },
        ],
      },
      {
        code: '1002',
        name: '临床医学',
        majors: [
          { code: '100200', name: '临床医学' },
          { code: '100201', name: '内科学' },
          { code: '100202', name: '儿科学' },
          { code: '100203', name: '老年医学' },
          { code: '100204', name: '神经病学' },
          { code: '100205', name: '精神病与精神卫生学' },
          { code: '100206', name: '皮肤病与性病学' },
          { code: '100207', name: '影像医学与核医学' },
          { code: '100208', name: '临床检验诊断学' },
          { code: '100210', name: '外科学' },
          { code: '100211', name: '妇产科学' },
          { code: '100212', name: '眼科学' },
          { code: '100213', name: '耳鼻咽喉科学' },
          { code: '100214', name: '肿瘤学' },
          { code: '100215', name: '康复医学与理疗学' },
          { code: '100216', name: '运动医学' },
          { code: '100217', name: '麻醉学' },
          { code: '100218', name: '急诊医学' },
        ],
      },
      {
        code: '1003',
        name: '口腔医学',
        majors: [
          { code: '100300', name: '口腔医学' },
          { code: '100301', name: '口腔基础医学' },
          { code: '100302', name: '口腔临床医学' },
        ],
      },
      {
        code: '1004',
        name: '公共卫生与预防医学',
        majors: [
          { code: '100400', name: '公共卫生与预防医学' },
          { code: '100401', name: '流行病与卫生统计学' },
          { code: '100402', name: '劳动卫生与环境卫生学' },
          { code: '100403', name: '营养与食品卫生学' },
          { code: '100404', name: '儿少卫生与妇幼保健学' },
          { code: '100405', name: '卫生毒理学' },
          { code: '100406', name: '军事预防医学' },
        ],
      },
      {
        code: '1005',
        name: '中医学',
        majors: [
          { code: '100500', name: '中医学' },
          { code: '100501', name: '中医基础理论' },
          { code: '100502', name: '中医临床基础' },
          { code: '100503', name: '中医医史文献' },
          { code: '100504', name: '方剂学' },
          { code: '100505', name: '中医诊断学' },
          { code: '100506', name: '中医内科学' },
          { code: '100507', name: '中医外科学' },
          { code: '100508', name: '中医骨伤科学' },
          { code: '100509', name: '中医妇科学' },
          { code: '100510', name: '中医儿科学' },
          { code: '100511', name: '中医五官科学' },
          { code: '100512', name: '针灸推拿学' },
          { code: '100513', name: '民族医学（含：藏医学、蒙医学等）' },
        ],
      },
      {
        code: '1006',
        name: '中西医结合',
        majors: [
          { code: '100600', name: '中西医结合' },
          { code: '100601', name: '中西医结合基础' },
          { code: '100602', name: '中西医结合临床' },
        ],
      },
      {
        code: '1007',
        name: '药学',
        majors: [
          { code: '100700', name: '药学' },
          { code: '100701', name: '药物化学' },
          { code: '100702', name: '药剂学' },
          { code: '100703', name: '生药学' },
          { code: '100704', name: '药物分析学' },
          { code: '100705', name: '微生物与生化药学' },
          { code: '100706', name: '药理学' },
        ],
      },
      {
        code: '1008',
        name: '中药学',
        majors: [
          { code: '100800', name: '中药学' },
        ],
      },
      {
        code: '1009',
        name: '特种医学',
        majors: [
          { code: '100900', name: '特种医学' },
        ],
      },
      {
        code: '1011',
        name: '护理学',
        majors: [
          { code: '101100', name: '护理学' },
        ],
      },
      {
        code: '1012',
        name: '法医学',
        majors: [
          { code: '101200', name: '法医学' },
        ],
      },
      {
        code: '1072',
        name: '生物医学工程',
        majors: [
          { code: '107200', name: '生物医学工程' },
        ],
      },
      {
        code: '1074',
        name: '1074(暂未公布学科名称)',
        majors: [
          { code: '107401', name: '社会医学与卫生事业管理' },
        ],
      },
    ],
  },
  {
    code: '11',
    name: '军事学',
    disciplines: [
      {
        code: '1101',
        name: '军事思想与军事历史',
        majors: [
          { code: '110100', name: '军事思想与军事历史' },
        ],
      },
      {
        code: '1102',
        name: '战略学',
        majors: [
          { code: '110200', name: '战略学' },
        ],
      },
      {
        code: '1103',
        name: '联合作战学',
        majors: [
          { code: '110300', name: '联合作战学' },
        ],
      },
      {
        code: '1104',
        name: '军兵种作战学',
        majors: [
          { code: '110400', name: '军兵种作战学' },
        ],
      },
      {
        code: '1105',
        name: '军队指挥学',
        majors: [
          { code: '110500', name: '军队指挥学' },
          { code: '110505', name: '密码学' },
        ],
      },
      {
        code: '1106',
        name: '军队政治工作学',
        majors: [
          { code: '110600', name: '军队政治工作学' },
        ],
      },
      {
        code: '1107',
        name: '军事后勤学',
        majors: [
          { code: '110700', name: '军事后勤学' },
        ],
      },
      {
        code: '1108',
        name: '军事装备学',
        majors: [
          { code: '110800', name: '军事装备学' },
        ],
      },
      {
        code: '1109',
        name: '军事管理学',
        majors: [
          { code: '110900', name: '军事管理学' },
        ],
      },
      {
        code: '1110',
        name: '军事训练学',
        majors: [
          { code: '111000', name: '军事训练学' },
        ],
      },
      {
        code: '1111',
        name: '军事智能',
        majors: [
          { code: '111100', name: '军事智能' },
        ],
      },
      {
        code: '1170',
        name: '国家安全学',
        majors: [
          { code: '117000', name: '国家安全学' },
        ],
      },
    ],
  },
  {
    code: '12',
    name: '管理学',
    disciplines: [
      {
        code: '1201',
        name: '管理科学与工程',
        majors: [
          { code: '120100', name: '管理科学与工程' },
        ],
      },
      {
        code: '1202',
        name: '工商管理学',
        majors: [
          { code: '120200', name: '工商管理学' },
          { code: '120201', name: '会计学' },
          { code: '120202', name: '企业管理' },
          { code: '120203', name: '旅游管理' },
          { code: '120204', name: '技术经济及管理' },
        ],
      },
      {
        code: '1203',
        name: '农林经济管理',
        majors: [
          { code: '120300', name: '农林经济管理' },
          { code: '120301', name: '农业经济管理' },
          { code: '120302', name: '林业经济管理' },
        ],
      },
      {
        code: '1204',
        name: '公共管理学',
        majors: [
          { code: '120400', name: '公共管理学' },
          { code: '120401', name: '行政管理' },
          { code: '120402', name: '社会医学与卫生事业管理' },
          { code: '120403', name: '教育经济与管理' },
          { code: '120404', name: '社会保障' },
          { code: '120405', name: '土地资源管理' },
        ],
      },
      {
        code: '1205',
        name: '信息资源管理',
        majors: [
          { code: '120500', name: '信息资源管理' },
          { code: '120501', name: '图书馆学' },
          { code: '120502', name: '情报学' },
          { code: '120503', name: '档案学' },
        ],
      },
      {
        code: '1271',
        name: '国家安全学',
        majors: [
          { code: '127100', name: '国家安全学' },
        ],
      },
    ],
  },
  {
    code: '13',
    name: '艺术学',
    disciplines: [
      {
        code: '1301',
        name: '艺术学',
        majors: [
          { code: '130100', name: '艺术学' },
        ],
      },
      {
        code: '1370',
        name: '设计学',
        majors: [
          { code: '137000', name: '设计学' },
        ],
      },
    ],
  },
  {
    code: '14',
    name: '交叉学科',
    disciplines: [
      {
        code: '1401',
        name: '集成电路科学与工程',
        majors: [
          { code: '140100', name: '集成电路科学与工程' },
        ],
      },
      {
        code: '1402',
        name: '国家安全学',
        majors: [
          { code: '140200', name: '国家安全学' },
        ],
      },
      {
        code: '1403',
        name: '设计学',
        majors: [
          { code: '140300', name: '设计学' },
        ],
      },
      {
        code: '1404',
        name: '遥感科学与技术',
        majors: [
          { code: '140400', name: '遥感科学与技术' },
        ],
      },
      {
        code: '1405',
        name: '智能科学与技术',
        majors: [
          { code: '140500', name: '智能科学与技术' },
        ],
      },
      {
        code: '1406',
        name: '纳米科学与工程',
        majors: [
          { code: '140600', name: '纳米科学与工程' },
        ],
      },
      {
        code: '1407',
        name: '区域国别学',
        majors: [
          { code: '140700', name: '区域国别学' },
        ],
      },
    ],
  },
];

// ============================================================
// 专业学位 专业目录（已按门类归类）
// ============================================================

export const PROFESSIONAL_CATEGORIES: DisciplineCategory[] = [
  {
    code: '01',
    name: '哲学',
    disciplines: [
      {
        code: '0151',
        name: '应用伦理',
        majors: [
          { code: '015100', name: '应用伦理' },
        ],
      },
    ],
  },
  {
    code: '02',
    name: '经济学',
    disciplines: [
      {
        code: '0251',
        name: '金融',
        majors: [
          { code: '025100', name: '金融' },
        ],
      },
      {
        code: '0252',
        name: '应用统计',
        majors: [
          { code: '025200', name: '应用统计' },
        ],
      },
      {
        code: '0253',
        name: '税务',
        majors: [
          { code: '025300', name: '税务' },
        ],
      },
      {
        code: '0254',
        name: '国际商务',
        majors: [
          { code: '025400', name: '国际商务' },
        ],
      },
      {
        code: '0255',
        name: '保险',
        majors: [
          { code: '025500', name: '保险' },
        ],
      },
      {
        code: '0256',
        name: '资产评估',
        majors: [
          { code: '025600', name: '资产评估' },
        ],
      },
      {
        code: '0258',
        name: '数字经济',
        majors: [
          { code: '025800', name: '数字经济' },
        ],
      },
    ],
  },
  {
    code: '03',
    name: '法学',
    disciplines: [
      {
        code: '0351',
        name: '法律',
        majors: [
          { code: '035100', name: '法律' },
          { code: '035101', name: '法律（非法学）' },
          { code: '035102', name: '法律（法学）' },
        ],
      },
      {
        code: '0352',
        name: '社会工作',
        majors: [
          { code: '035200', name: '社会工作' },
        ],
      },
      {
        code: '0353',
        name: '警务',
        majors: [
          { code: '035300', name: '警务' },
        ],
      },
      {
        code: '0354',
        name: '知识产权',
        majors: [
          { code: '035400', name: '知识产权' },
        ],
      },
      {
        code: '0355',
        name: '国际事务',
        majors: [
          { code: '035500', name: '国际事务' },
        ],
      },
    ],
  },
  {
    code: '04',
    name: '教育学',
    disciplines: [
      {
        code: '0451',
        name: '教育',
        majors: [
          { code: '045100', name: '教育' },
          { code: '045101', name: '教育管理' },
          { code: '045102', name: '学科教学（思政）' },
          { code: '045103', name: '学科教学（语文）' },
          { code: '045104', name: '学科教学（数学）' },
          { code: '045105', name: '学科教学（物理）' },
          { code: '045106', name: '学科教学（化学）' },
          { code: '045107', name: '学科教学（生物）' },
          { code: '045108', name: '学科教学（英语）' },
          { code: '045109', name: '学科教学（历史）' },
          { code: '045110', name: '学科教学（地理）' },
          { code: '045111', name: '学科教学（音乐）' },
          { code: '045112', name: '学科教学（体育）' },
          { code: '045113', name: '学科教学（美术）' },
          { code: '045114', name: '现代教育技术' },
          { code: '045115', name: '小学教育' },
          { code: '045116', name: '心理健康教育' },
          { code: '045117', name: '科学与技术教育' },
          { code: '045118', name: '学前教育' },
          { code: '045119', name: '特殊教育' },
          { code: '045120', name: '职业技术教育' },
        ],
      },
      {
        code: '0452',
        name: '体育',
        majors: [
          { code: '045200', name: '体育' },
          { code: '045201', name: '体育教学' },
          { code: '045202', name: '运动训练' },
          { code: '045203', name: '竞赛组织' },
          { code: '045204', name: '社会体育指导' },
        ],
      },
      {
        code: '0453',
        name: '国际中文教育',
        majors: [
          { code: '045300', name: '国际中文教育' },
        ],
      },
      {
        code: '0454',
        name: '应用心理',
        majors: [
          { code: '045400', name: '应用心理' },
        ],
      },
    ],
  },
  {
    code: '05',
    name: '文学',
    disciplines: [
      {
        code: '0551',
        name: '翻译',
        majors: [
          { code: '055100', name: '翻译' },
          { code: '055101', name: '英语笔译' },
          { code: '055102', name: '英语口译' },
          { code: '055103', name: '俄语笔译' },
          { code: '055104', name: '俄语口译' },
          { code: '055105', name: '日语笔译' },
          { code: '055106', name: '日语口译' },
          { code: '055107', name: '法语笔译' },
          { code: '055108', name: '法语口译' },
          { code: '055109', name: '德语笔译' },
          { code: '055110', name: '德语口译' },
          { code: '055111', name: '朝鲜语笔译' },
          { code: '055112', name: '朝鲜语口译' },
          { code: '055113', name: '西班牙语笔译' },
          { code: '055114', name: '西班牙语口译' },
          { code: '055115', name: '阿拉伯语笔译' },
          { code: '055116', name: '阿拉伯语口译' },
          { code: '055117', name: '泰语笔译' },
          { code: '055118', name: '泰语口译' },
          { code: '055119', name: '意大利语笔译' },
          { code: '055120', name: '意大利语口译' },
          { code: '055121', name: '越南语笔译' },
          { code: '055122', name: '越南语口译' },
        ],
      },
      {
        code: '0552',
        name: '新闻与传播',
        majors: [
          { code: '055200', name: '新闻与传播' },
        ],
      },
      {
        code: '0553',
        name: '出版',
        majors: [
          { code: '055300', name: '出版' },
        ],
      },
    ],
  },
  {
    code: '06',
    name: '历史学',
    disciplines: [
      {
        code: '0651',
        name: '博物馆',
        majors: [
          { code: '065100', name: '博物馆' },
        ],
      },
    ],
  },
  {
    code: '07',
    name: '理学',
    disciplines: [
      {
        code: '0751',
        name: '气象',
        majors: [
          { code: '075100', name: '气象' },
        ],
      },
    ],
  },
  {
    code: '08',
    name: '工学',
    disciplines: [
      {
        code: '0851',
        name: '建筑',
        majors: [
          { code: '085100', name: '建筑' },
        ],
      },
      {
        code: '0853',
        name: '城乡规划',
        majors: [
          { code: '085300', name: '城乡规划' },
        ],
      },
      {
        code: '0854',
        name: '电子信息',
        majors: [
          { code: '085400', name: '电子信息' },
          { code: '085401', name: '新一代电子信息技术（含量子技术等）' },
          { code: '085402', name: '通信工程（含宽带网络、移动通信等）' },
          { code: '085403', name: '集成电路工程' },
          { code: '085404', name: '计算机技术' },
          { code: '085405', name: '软件工程' },
          { code: '085406', name: '控制工程' },
          { code: '085407', name: '仪器仪表工程' },
          { code: '085408', name: '光电信息工程' },
          { code: '085409', name: '生物医学工程' },
          { code: '085410', name: '人工智能' },
          { code: '085411', name: '大数据技术与工程' },
          { code: '085412', name: '网络与信息安全' },
        ],
      },
      {
        code: '0855',
        name: '机械',
        majors: [
          { code: '085500', name: '机械' },
          { code: '085501', name: '机械工程' },
          { code: '085502', name: '车辆工程' },
          { code: '085503', name: '航空工程' },
          { code: '085504', name: '航天工程' },
          { code: '085505', name: '船舶工程' },
          { code: '085506', name: '兵器工程' },
          { code: '085507', name: '工业设计工程' },
          { code: '085508', name: '农机装备工程' },
          { code: '085509', name: '智能制造技术' },
          { code: '085510', name: '机器人工程' },
        ],
      },
      {
        code: '0856',
        name: '材料与化工',
        majors: [
          { code: '085600', name: '材料与化工' },
          { code: '085601', name: '材料工程' },
          { code: '085602', name: '化学工程' },
          { code: '085603', name: '冶金工程' },
          { code: '085604', name: '纺织工程' },
          { code: '085605', name: '林业工程' },
          { code: '085606', name: '轻化工程（含皮革、纸张、织物加工等）' },
        ],
      },
      {
        code: '0857',
        name: '资源与环境',
        majors: [
          { code: '085700', name: '资源与环境' },
          { code: '085701', name: '环境工程' },
          { code: '085702', name: '安全工程' },
          { code: '085703', name: '地质工程' },
          { code: '085704', name: '测绘工程' },
          { code: '085705', name: '矿业工程' },
          { code: '085706', name: '石油与天然气工程' },
        ],
      },
      {
        code: '0858',
        name: '能源动力',
        majors: [
          { code: '085800', name: '能源动力' },
          { code: '085801', name: '电气工程' },
          { code: '085802', name: '动力工程' },
          { code: '085803', name: '核能工程' },
          { code: '085804', name: '航空发动机工程' },
          { code: '085805', name: '燃气轮机工程' },
          { code: '085806', name: '航天动力工程' },
          { code: '085807', name: '清洁能源技术' },
          { code: '085808', name: '储能技术' },
        ],
      },
      {
        code: '0859',
        name: '土木水利',
        majors: [
          { code: '085900', name: '土木水利' },
          { code: '085901', name: '土木工程' },
          { code: '085902', name: '水利工程' },
          { code: '085903', name: '海洋工程' },
          { code: '085904', name: '农田水土工程' },
          { code: '085905', name: '市政工程（含给排水等）' },
          { code: '085906', name: '人工环境工程（含供热、通风及空调等）' },
        ],
      },
      {
        code: '0860',
        name: '生物与医药',
        majors: [
          { code: '086000', name: '生物与医药' },
          { code: '086001', name: '生物技术与工程' },
          { code: '086002', name: '制药工程' },
          { code: '086003', name: '食品工程' },
          { code: '086004', name: '发酵工程' },
        ],
      },
      {
        code: '0861',
        name: '交通运输',
        majors: [
          { code: '086100', name: '交通运输' },
          { code: '086101', name: '轨道交通运输' },
          { code: '086102', name: '道路交通运输' },
          { code: '086103', name: '水路交通运输' },
          { code: '086104', name: '航空交通运输' },
          { code: '086105', name: '管道交通运输' },
        ],
      },
      {
        code: '0862',
        name: '风景园林',
        majors: [
          { code: '086200', name: '风景园林' },
        ],
      },
    ],
  },
  {
    code: '09',
    name: '农学',
    disciplines: [
      {
        code: '0951',
        name: '农业',
        majors: [
          { code: '095100', name: '农业' },
          { code: '095131', name: '农艺与种业' },
          { code: '095132', name: '资源利用与植物保护' },
          { code: '095133', name: '畜牧' },
          { code: '095134', name: '渔业发展' },
          { code: '095135', name: '食品加工与安全' },
          { code: '095136', name: '农业工程与信息技术' },
          { code: '095137', name: '农业管理' },
          { code: '095138', name: '农村发展' },
        ],
      },
      {
        code: '0952',
        name: '兽医',
        majors: [
          { code: '095200', name: '兽医' },
        ],
      },
      {
        code: '0954',
        name: '林业',
        majors: [
          { code: '095400', name: '林业' },
        ],
      },
      {
        code: '0955',
        name: '食品与营养',
        majors: [
          { code: '095500', name: '食品与营养' },
        ],
      },
    ],
  },
  {
    code: '10',
    name: '医学',
    disciplines: [
      {
        code: '1051',
        name: '临床医学',
        majors: [
          { code: '105100', name: '临床医学' },
          { code: '105101', name: '内科学' },
          { code: '105102', name: '儿科学' },
          { code: '105103', name: '老年医学' },
          { code: '105104', name: '神经病学' },
          { code: '105105', name: '精神病与精神卫生学' },
          { code: '105106', name: '皮肤病与性病学' },
          { code: '105107', name: '急诊医学' },
          { code: '105108', name: '重症医学' },
          { code: '105109', name: '全科医学' },
          { code: '105110', name: '康复医学与理疗学' },
          { code: '105111', name: '外科学' },
          { code: '105112', name: '儿外科学' },
          { code: '105113', name: '骨科学' },
          { code: '105114', name: '运动医学' },
          { code: '105115', name: '妇产科学' },
          { code: '105116', name: '眼科学' },
          { code: '105117', name: '耳鼻咽喉科学' },
          { code: '105118', name: '麻醉学' },
          { code: '105119', name: '临床病理' },
          { code: '105120', name: '临床检验诊断学' },
          { code: '105121', name: '肿瘤学' },
          { code: '105122', name: '放射肿瘤学' },
          { code: '105123', name: '放射影像学' },
          { code: '105124', name: '超声医学' },
          { code: '105125', name: '核医学' },
          { code: '105126', name: '医学遗传学' },
        ],
      },
      {
        code: '1052',
        name: '口腔医学',
        majors: [
          { code: '105200', name: '口腔医学' },
        ],
      },
      {
        code: '1053',
        name: '公共卫生',
        majors: [
          { code: '105300', name: '公共卫生' },
        ],
      },
      {
        code: '1054',
        name: '护理',
        majors: [
          { code: '105400', name: '护理' },
        ],
      },
      {
        code: '1055',
        name: '药学',
        majors: [
          { code: '105500', name: '药学' },
        ],
      },
      {
        code: '1056',
        name: '中药',
        majors: [
          { code: '105600', name: '中药' },
        ],
      },
      {
        code: '1057',
        name: '中医',
        majors: [
          { code: '105700', name: '中医' },
          { code: '105701', name: '中医内科学' },
          { code: '105702', name: '中医外科学' },
          { code: '105703', name: '中医骨伤科学' },
          { code: '105704', name: '中医妇科学' },
          { code: '105705', name: '中医儿科学' },
          { code: '105706', name: '中医五官科学' },
          { code: '105707', name: '针灸推拿学' },
          { code: '105708', name: '民族医学（含：藏医学、蒙医学等）' },
          { code: '105709', name: '中西医结合临床' },
          { code: '105710', name: '全科医学（中医，不授博士学位）' },
        ],
      },
      {
        code: '1058',
        name: '医学技术',
        majors: [
          { code: '105800', name: '医学技术' },
        ],
      },
      {
        code: '1059',
        name: '针灸',
        majors: [
          { code: '105900', name: '针灸' },
        ],
      },
    ],
  },
  {
    code: '11',
    name: '军事学',
    disciplines: [
      {
        code: '1152',
        name: '联合作战指挥',
        majors: [
          { code: '115200', name: '联合作战指挥' },
        ],
      },
      {
        code: '1153',
        name: '军兵种作战指挥',
        majors: [
          { code: '115300', name: '军兵种作战指挥' },
        ],
      },
      {
        code: '1154',
        name: '作战指挥保障',
        majors: [
          { code: '115400', name: '作战指挥保障' },
        ],
      },
      {
        code: '1155',
        name: '战时政治工作',
        majors: [
          { code: '115500', name: '战时政治工作' },
        ],
      },
      {
        code: '1156',
        name: '后勤与装备保障',
        majors: [
          { code: '115600', name: '后勤与装备保障' },
        ],
      },
      {
        code: '1157',
        name: '军事训练与管理',
        majors: [
          { code: '115700', name: '军事训练与管理' },
        ],
      },
    ],
  },
  {
    code: '12',
    name: '管理学',
    disciplines: [
      {
        code: '1251',
        name: '工商管理',
        majors: [
          { code: '125100', name: '工商管理' },
        ],
      },
      {
        code: '1252',
        name: '公共管理',
        majors: [
          { code: '125200', name: '公共管理' },
        ],
      },
      {
        code: '1253',
        name: '会计',
        majors: [
          { code: '125300', name: '会计' },
        ],
      },
      {
        code: '1254',
        name: '旅游管理',
        majors: [
          { code: '125400', name: '旅游管理' },
        ],
      },
      {
        code: '1255',
        name: '图书情报',
        majors: [
          { code: '125500', name: '图书情报' },
        ],
      },
      {
        code: '1256',
        name: '工程管理',
        majors: [
          { code: '125600', name: '工程管理' },
          { code: '125601', name: '工程管理' },
          { code: '125602', name: '项目管理' },
          { code: '125603', name: '工业工程与管理' },
          { code: '125604', name: '物流工程与管理' },
        ],
      },
      {
        code: '1257',
        name: '审计',
        majors: [
          { code: '125700', name: '审计' },
        ],
      },
    ],
  },
  {
    code: '13',
    name: '艺术学',
    disciplines: [
      {
        code: '1352',
        name: '音乐',
        majors: [
          { code: '135200', name: '音乐' },
        ],
      },
      {
        code: '1353',
        name: '舞蹈',
        majors: [
          { code: '135300', name: '舞蹈' },
        ],
      },
      {
        code: '1354',
        name: '戏剧与影视',
        majors: [
          { code: '135400', name: '戏剧与影视' },
        ],
      },
      {
        code: '1355',
        name: '戏曲与曲艺',
        majors: [
          { code: '135500', name: '戏曲与曲艺' },
        ],
      },
      {
        code: '1356',
        name: '美术与书法',
        majors: [
          { code: '135600', name: '美术与书法' },
        ],
      },
      {
        code: '1357',
        name: '设计',
        majors: [
          { code: '135700', name: '设计' },
        ],
      },
    ],
  },
  {
    code: '14',
    name: '交叉学科',
    disciplines: [
      {
        code: '1451',
        name: '文物',
        majors: [
          { code: '145100', name: '文物' },
        ],
      },
      {
        code: '1452',
        name: '密码',
        majors: [
          { code: '145200', name: '密码' },
        ],
      },
    ],
  },
];
