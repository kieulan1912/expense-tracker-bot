const categories = Object.freeze({
  1: 'Ăn uống',
  2: 'Di chuyển',
  3: 'Hóa đơn & sinh hoạt',
  4: 'Mua sắm & giải trí',
  5: 'Sức khỏe',
  6: 'Giáo dục & phát triển',
  7: 'Cho tặng & gia đình',
  99: 'Khác',
});

const incomeCategories = Object.freeze({
  91: 'Lương',
  92: 'Thưởng',
  93: 'Đầu tư',
  94: 'Kinh doanh',
  99: 'Khác',
});

const expenseRules = Object.freeze([
  {
    categoryId: 1,
    keywords: [
      'ăn uống', 'đồ ăn', 'thức ăn', 'bữa sáng', 'bữa trưa', 'bữa tối',
      'ăn sáng', 'ăn trưa', 'ăn tối', 'cơm', 'phở', 'bún', 'xôi', 'cháo',
      'mì', 'miến', 'hủ tiếu', 'bánh mì', 'bánh bao', 'pizza', 'burger',
      'cafe', 'cà phê', 'coffee', 'trà sữa', 'nước uống', 'nước ngọt',
      'bia', 'nhậu', 'quán ăn', 'nhà hàng', 'siêu thị', 'chợ', 'winmart',
      'circle k', 'grabfood', 'shopeefood',
    ],
  },
  {
    categoryId: 2,
    keywords: [
      'đổ xăng', 'tiền xăng', 'xăng', 'grab', 'taxi', 'gojek', 'xanh sm',
      'vé xe', 'gửi xe', 'xe buýt', 'bus', 'tàu điện', 'vé tàu',
      'vé máy bay', 'thuê xe', 'rửa xe', 'sửa xe', 'bảo dưỡng xe',
      'phí cầu đường', 'phí đường bộ',
    ],
  },
  {
    categoryId: 3,
    keywords: [
      'hóa đơn', 'hoá đơn', 'tiền điện', 'tiền nước', 'tiền mạng',
      'internet', 'wifi', 'cước điện thoại', 'tiền điện thoại', 'thuê bao',
      'tiền nhà', 'tiền trọ', 'phí chung cư', 'phí quản lý', 'tiền gas',
      'truyền hình cáp',
    ],
  },
  {
    categoryId: 4,
    keywords: [
      'mua sắm', 'mua đồ', 'quần áo', 'giày', 'dép', 'túi xách', 'mỹ phẩm',
      'đồ gia dụng', 'nội thất', 'mua điện thoại', 'mua máy tính', 'shopee',
      'lazada', 'tiki', 'xem phim', 'rạp phim', 'game', 'netflix', 'spotify',
      'karaoke', 'du lịch', 'khách sạn', 'vé concert',
    ],
  },
  {
    categoryId: 5,
    keywords: [
      'thuốc', 'khám bệnh', 'khám', 'bệnh viện', 'phòng khám', 'bác sĩ',
      'nha khoa', 'xét nghiệm', 'y tế', 'vaccine', 'vắc xin', 'tiêm chủng',
      'bảo hiểm y tế', 'gym',
    ],
  },
  {
    categoryId: 6,
    keywords: [
      'học phí', 'khóa học', 'khoá học', 'học tiếng', 'gia sư', 'trường học',
      'sách', 'giáo trình', 'văn phòng phẩm', 'udemy', 'coursera',
    ],
  },
  {
    categoryId: 7,
    keywords: [
      'bố mẹ', 'ba mẹ', 'cha mẹ', 'gia đình', 'cho con', 'tiền cho con',
      'từ thiện', 'quyên góp', 'ủng hộ', 'đám cưới', 'mừng cưới', 'đám hiếu',
      'sinh nhật', 'cho tặng', 'biếu', 'quà tặng', 'lì xì',
    ],
  },
]);

const incomeRules = Object.freeze([
  { categoryId: 91, keywords: ['lương', 'salary'] },
  { categoryId: 92, keywords: ['thưởng', 'bonus'] },
  {
    categoryId: 93,
    keywords: ['cổ tức', 'lãi đầu tư', 'tiền lãi', 'lãi suất', 'chứng khoán'],
  },
  {
    categoryId: 94,
    keywords: ['bán hàng', 'doanh thu', 'khách trả', 'kinh doanh', 'freelance'],
  },
]);

function normalizeForCategory(value) {
  return String(value || '')
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function findBestRule(text, rules) {
  const paddedText = ` ${normalizeForCategory(text)} `;
  let bestMatch = null;

  for (const rule of rules) {
    for (const keyword of rule.keywords) {
      const normalizedKeyword = normalizeForCategory(keyword);
      if (!paddedText.includes(` ${normalizedKeyword} `)) continue;
      if (!bestMatch || normalizedKeyword.length > bestMatch.keywordLength) {
        bestMatch = { categoryId: rule.categoryId, keywordLength: normalizedKeyword.length };
      }
    }
  }

  return bestMatch?.categoryId || 99;
}

function detectCategoryId(description, type) {
  const rules = type === 'income' ? incomeRules : expenseRules;
  return findBestRule(description, rules);
}

function getCategoryName(categoryId, type = 'expense') {
  const source = type === 'income' ? incomeCategories : categories;
  return source[Number(categoryId)] || 'Khác';
}

function detectCategory(description, type) {
  return getCategoryName(detectCategoryId(description, type), type);
}

function isSensitiveCategory(categoryId) {
  return [5, 6, 7].includes(Number(categoryId));
}

module.exports = {
  categories,
  incomeCategories,
  detectCategory,
  detectCategoryId,
  getCategoryName,
  isSensitiveCategory,
  normalizeForCategory,
};
