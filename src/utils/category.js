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

const expenseRules = [
  {
    categoryId: 1,
    keywords: [
      'phở',
      'cơm',
      'bún',
      'cafe',
      'cà phê',
      'trà sữa',
      'đồ ăn',
      'ăn sáng',
      'ăn trưa',
      'ăn tối',
      'nhậu',
      'siêu thị',
      'winmart',
    ],
  },
  {
    categoryId: 2,
    keywords: ['xăng', 'grab', 'taxi', 'vé xe', 'gửi xe', 'xe buýt'],
  },
  {
    categoryId: 3,
    keywords: ['tiền điện', 'tiền nước', 'internet', 'wifi', 'tiền mạng', 'điện thoại'],
  },
  {
    categoryId: 4,
    keywords: ['quần áo', 'giày', 'shopee', 'lazada', 'mua đồ'],
  },
  {
    categoryId: 5,
    keywords: ['thuốc', 'khám', 'bệnh viện', 'nha khoa'],
  },
  {
    categoryId: 4,
    keywords: ['xem phim', 'game', 'netflix', 'spotify', 'du lịch'],
  },
  {
    categoryId: 6,
    keywords: ['học phí', 'khóa học', 'sách', 'học tiếng'],
  },
  {
    categoryId: 7,
    keywords: ['bố mẹ', 'ba mẹ', 'gia đình', 'từ thiện', 'đám cưới', 'mừng cưới', 'cho tặng'],
  },
];

const incomeRules = [
  { categoryId: 91, keywords: ['lương', 'salary'] },
  { categoryId: 92, keywords: ['thưởng', 'bonus'] },
  { categoryId: 93, keywords: ['cổ tức', 'lãi đầu tư', 'chứng khoán'] },
  { categoryId: 94, keywords: ['bán hàng', 'doanh thu', 'khách trả'] },
];

function detectCategoryId(description, type) {
  const text = description.toLocaleLowerCase('vi');
  const rules = type === 'income' ? incomeRules : expenseRules;
  const matched = rules.find((rule) =>
    rule.keywords.some((keyword) => text.includes(keyword)),
  );

  return matched?.categoryId || 99;
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
};
