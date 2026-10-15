const ledgerRepositoryMethods = Object.freeze([
  'hasSharedAccess',
  'getLedgerAccess',
  'getActiveLedger',
  'listLedgers',
  'createLedger',
  'selectLedger',
  'createInvitation',
  'requestJoin',
  'reviewJoinRequest',
  'listMembers',
  'changeMemberRole',
  'removeMember',
  'leaveLedger',
  'deleteLedger',
]);

module.exports = { ledgerRepositoryMethods };
