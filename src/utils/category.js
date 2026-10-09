const expenseRules = [
  {
    category: 'Ăn uống',
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
    ],
  },
  {
    category: 'Di chuyển',
    keywords: ['xăng', 'grab', 'taxi', 'vé xe', 'gửi xe', 'xe buýt'],
  },
  {
    category: 'Hóa đơn',
    keywords: ['tiền điện', 'tiền nước', 'internet', 'wifi', 'tiền mạng', 'điện thoại'],
  },
  {
    category: 'Mua sắm',
    keywords: ['quần áo', 'giày', 'shopee', 'lazada', 'mua đồ'],
  },
  {
    category: 'Sức khỏe',
    keywords: ['thuốc', 'khám', 'bệnh viện', 'nha khoa'],
  },
  {
    category: 'Giải trí',
    keywords: ['xem phim', 'game', 'netflix', 'spotify', 'du lịch'],
  },
  {
    category: 'Giáo dục',
    keywords: ['học phí', 'khóa học', 'sách', 'học tiếng'],
  },
];

const incomeRules = [
  { category: 'Lương', keywords: ['lương', 'salary'] },
  { category: 'Thưởng', keywords: ['thưởng', 'bonus'] },
  { category: 'Đầu tư', keywords: ['cổ tức', 'lãi đầu tư', 'chứng khoán'] },
  { category: 'Kinh doanh', keywords: ['bán hàng', 'doanh thu', 'khách trả'] },
];

function detectCategory(description, type) {
  const text = description.toLocaleLowerCase('vi');
  const rules = type === 'income' ? incomeRules : expenseRules;
  const matched = rules.find((rule) =>
    rule.keywords.some((keyword) => text.includes(keyword)),
  );

  return matched?.category || 'Khác';
}

module.exports = { detectCategory };
