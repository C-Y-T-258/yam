import type { School, ScoreLine } from '../lib/db';

export const MOCK_SCHOOLS: School[] = [
  { school_id: '10001', name: '北京大学', province: '北京', level: '985 211 一流' },
  { school_id: '10003', name: '清华大学', province: '北京', level: '985 211 一流' },
  { school_id: '10004', name: '北京交通大学', province: '北京', level: '211 一流' },
  { school_id: '10005', name: '北京工业大学', province: '北京', level: '211 一流' },
  { school_id: '10006', name: '北京航空航天大学', province: '北京', level: '985 211 一流' },
  { school_id: '10007', name: '北京理工大学', province: '北京', level: '985 211 一流' },
  { school_id: '10008', name: '北京科技大学', province: '北京', level: '211 一流' },
  { school_id: '10010', name: '北京化工大学', province: '北京', level: '211 一流' },
  { school_id: '10013', name: '北京邮电大学', province: '北京', level: '211 一流' },
  { school_id: '10015', name: '北京林业大学', province: '北京', level: '211 一流' },
  { school_id: '10022', name: '北京语言大学', province: '北京', level: '' },
  { school_id: '10025', name: '首都医科大学', province: '北京', level: '' },
  { school_id: '10026', name: '北京中医药大学', province: '北京', level: '211 一流' },
  { school_id: '10028', name: '中央民族大学', province: '北京', level: '985 211 一流' },
  { school_id: '10034', name: '中国传媒大学', province: '北京', level: '211 一流' },
  { school_id: '10246', name: '复旦大学', province: '上海', level: '985 211 一流' },
  { school_id: '10247', name: '同济大学', province: '上海', level: '985 211 一流' },
  { school_id: '10248', name: '上海交通大学', province: '上海', level: '985 211 一流' },
  { school_id: '10269', name: '华东师范大学', province: '上海', level: '985 211 一流' },
  { school_id: '10280', name: '上海大学', province: '上海', level: '211 一流' },
  { school_id: '10284', name: '南京大学', province: '江苏', level: '985 211 一流' },
  { school_id: '10285', name: '苏州大学', province: '江苏', level: '211 一流' },
  { school_id: '10286', name: '东南大学', province: '江苏', level: '985 211 一流' },
  { school_id: '10287', name: '南京航空航天大学', province: '江苏', level: '211 一流' },
  { school_id: '10288', name: '南京理工大学', province: '江苏', level: '211 一流' },
  { school_id: '10335', name: '浙江大学', province: '浙江', level: '985 211 一流' },
  { school_id: '10358', name: '中国科学技术大学', province: '安徽', level: '985 211 一流' },
  { school_id: '10486', name: '武汉大学', province: '湖北', level: '985 211 一流' },
  { school_id: '10487', name: '华中科技大学', province: '湖北', level: '985 211 一流' },
  { school_id: '10610', name: '四川大学', province: '四川', level: '985 211 一流' },
  { school_id: '10611', name: '重庆大学', province: '重庆', level: '985 211 一流' },
  { school_id: '10613', name: '西南交通大学', province: '四川', level: '211 一流' },
  { school_id: '10614', name: '电子科技大学', province: '四川', level: '985 211 一流' },
  { school_id: '10698', name: '西安交通大学', province: '陕西', level: '985 211 一流' },
  { school_id: '10699', name: '西北工业大学', province: '陕西', level: '985 211 一流' },
  { school_id: '10701', name: '西安电子科技大学', province: '陕西', level: '211 一流' },
  { school_id: '11845', name: '广东工业大学', province: '广东', level: '' },
  { school_id: '11846', name: '深圳大学', province: '广东', level: '' },
  { school_id: '12121', name: '南方科技大学', province: '广东', level: '一流' },
  { school_id: '91002', name: '国防科技大学', province: '湖南', level: '985 211 一流' },
];

export const MOCK_SCORE_LINES: Record<string, ScoreLine[]> = {
  '10001': [
    { year: 2026, total: 340, politics: 50, english: 50, special_one: 75, special_two: 75, department_name: '计算机学院' },
    { year: 2025, total: 335, politics: 48, english: 48, special_one: 72, special_two: 72, department_name: '计算机学院' },
    { year: 2024, total: 330, politics: 45, english: 45, special_one: 70, special_two: 70, department_name: '计算机学院' },
  ],
  '10003': [
    { year: 2026, total: 345, politics: 50, english: 50, special_one: 80, special_two: 80, department_name: '计算机系' },
    { year: 2025, total: 340, politics: 48, english: 48, special_one: 78, special_two: 78, department_name: '计算机系' },
    { year: 2024, total: 335, politics: 45, english: 45, special_one: 75, special_two: 75, department_name: '计算机系' },
  ],
  '10004': [
    { year: 2026, total: 317, politics: 45, english: 45, special_one: 68, special_two: 68, department_name: '计算机与信息技术学院' },
    { year: 2025, total: 310, politics: 43, english: 43, special_one: 65, special_two: 65, department_name: '计算机与信息技术学院' },
    { year: 2024, total: 305, politics: 40, english: 40, special_one: 62, special_two: 62, department_name: '计算机与信息技术学院' },
  ],
  '10006': [
    { year: 2026, total: 330, politics: 48, english: 48, special_one: 72, special_two: 72, department_name: '计算机学院' },
    { year: 2025, total: 325, politics: 45, english: 45, special_one: 70, special_two: 70, department_name: '计算机学院' },
  ],
  '10246': [
    { year: 2026, total: 335, politics: 50, english: 50, special_one: 75, special_two: 75, department_name: '计算机科学技术学院' },
    { year: 2025, total: 330, politics: 48, english: 48, special_one: 72, special_two: 72, department_name: '计算机科学技术学院' },
  ],
  '10248': [
    { year: 2026, total: 340, politics: 50, english: 50, special_one: 78, special_two: 78, department_name: '计算机科学与技术系' },
    { year: 2025, total: 335, politics: 48, english: 48, special_one: 75, special_two: 75, department_name: '计算机科学与技术系' },
  ],
  '10335': [
    { year: 2026, total: 345, politics: 50, english: 50, special_one: 80, special_two: 80, department_name: '计算机科学与技术学院' },
    { year: 2025, total: 340, politics: 48, english: 48, special_one: 78, special_two: 78, department_name: '计算机科学与技术学院' },
  ],
  '10486': [
    { year: 2026, total: 325, politics: 48, english: 48, special_one: 70, special_two: 70, department_name: '计算机学院' },
    { year: 2025, total: 320, politics: 45, english: 45, special_one: 68, special_two: 68, department_name: '计算机学院' },
  ],
  '10610': [
    { year: 2026, total: 320, politics: 45, english: 45, special_one: 68, special_two: 68, department_name: '计算机学院' },
    { year: 2025, total: 315, politics: 43, english: 43, special_one: 65, special_two: 65, department_name: '计算机学院' },
  ],
  '10698': [
    { year: 2026, total: 330, politics: 48, english: 48, special_one: 72, special_two: 72, department_name: '计算机科学与技术学院' },
    { year: 2025, total: 325, politics: 45, english: 45, special_one: 70, special_two: 70, department_name: '计算机科学与技术学院' },
  ],
};

// Generate score lines for schools without specific data
export function getMockScoreLines(schoolId: string): ScoreLine[] {
  if (MOCK_SCORE_LINES[schoolId]) {
    return MOCK_SCORE_LINES[schoolId];
  }
  // Generate default score lines
  return [
    { year: 2026, total: 300 + Math.floor(Math.random() * 40), politics: 40 + Math.floor(Math.random() * 10), english: 40 + Math.floor(Math.random() * 10), special_one: 60 + Math.floor(Math.random() * 15), special_two: 60 + Math.floor(Math.random() * 15), department_name: '计算机学院' },
    { year: 2025, total: 295 + Math.floor(Math.random() * 40), politics: 38 + Math.floor(Math.random() * 10), english: 38 + Math.floor(Math.random() * 10), special_one: 58 + Math.floor(Math.random() * 15), special_two: 58 + Math.floor(Math.random() * 15), department_name: '计算机学院' },
  ];
}
