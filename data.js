const LABELS = ['HR_REPLIED', 'AUTO_REPLY', 'TICKETING_BOT', 'NEEDS_REVIEW'];

function makeSeed() {
  const agents = [
    { id: 'a1', name: 'Priya Nair', active: true },
    { id: 'a2', name: 'Rahul Sen', active: true },
    { id: 'a3', name: 'Sana Iqbal', active: false }
  ];

  const emails = [
    { id: 1, from: 'hr@acme.com', subject: 'Re: Employment verification for John Doe', label: 'HR_REPLIED', assignee: 'a1', internalRiskNote: 'low risk' },
    { id: 2, from: 'noreply@bigcorp.com', subject: 'Automatic reply: Out of office', label: 'AUTO_REPLY', assignee: null, internalRiskNote: '' },
    { id: 3, from: 'support@zendesk-ticket.com', subject: '[Ticket #4521] Your request has been received', label: 'TICKETING_BOT', assignee: 'a2', internalRiskNote: '' },
    { id: 4, from: 'hr@widgetco.com', subject: 'RE: Verification request for Meera Rao', label: 'HR_REPLIED', assignee: null, internalRiskNote: 'flagged for follow-up' },
    { id: 5, from: 'unknown@vendor.io', subject: 'Fwd: attachment scan required', label: 'NEEDS_REVIEW', assignee: 'a2', internalRiskNote: '' },
    { id: 6, from: 'careers@bigcorp.com', subject: 'Auto-Reply: We received your email', label: 'AUTO_REPLY', assignee: null, internalRiskNote: '' },
    { id: 7, from: 'hr@thirdplace.com', subject: 'Employment confirmed for Arjun Verma', label: 'HR_REPLIED', assignee: 'a1', internalRiskNote: '' },
    { id: 8, from: 'noreply@servicenow.com', subject: 'INC0012345 has been logged', label: 'TICKETING_BOT', assignee: null, internalRiskNote: '' },
    { id: 9, from: 'hr@fifthgen.com', subject: 'Need more details before responding', label: 'NEEDS_REVIEW', assignee: null, internalRiskNote: 'possible spam' },
    { id: 10, from: 'hr@acme.com', subject: 'Confirmed: candidate left the organisation', label: 'HR_REPLIED', assignee: 'a2', internalRiskNote: '' }
  ];

  return { agents, emails };
}

module.exports = { LABELS, makeSeed };
