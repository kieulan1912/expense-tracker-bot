const ROLE_LABELS = Object.freeze({
  owner: 'Chủ sổ',
  member: 'Thành viên',
  viewer: 'Người xem',
});

function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

function canWriteLedger(role) {
  return role === 'owner' || role === 'member';
}

function canManageLedger(role) {
  return role === 'owner';
}

module.exports = { ROLE_LABELS, roleLabel, canWriteLedger, canManageLedger };
