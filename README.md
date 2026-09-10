# SDET Hackathon: Email Labeler Queue — Automated Bug Regression Test Suite

This repository contains the automated test suite for the **Email Labeler Queue** application, catching all 19 confirmed defects reported during Phase 1 of the Springworks SDET Challenge.

---

## 🛠️ Tools Used

- **Test Framework**: Jest (`^30.5.1`)
- **API Test Client**: Supertest (`^7.2.2`)
- **Runtime Environment**: Node.js (`v24.x`) / Express (`v4.19.x`)
- **IDE & Development**: Antigravity IDE & Git

---

## 🚀 Running the Tests

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Automated Test Suite
```bash
npm test
```

> **Note on Phase 2 Evaluation**: Per the hackathon requirements, these automated tests are designed to **FAIL** against the application in its current state, proving the existence of each reported defect across the API and UI.

---

## 📋 Test Matrix & Defect Coverage (19 Confirmed Bugs)

| Bug ID | Test Name | Endpoint | Defect Type | Failure Behavior Caught |
| :--- | :--- | :--- | :--- | :--- |
| **BUG-07-01** | `GET /api/stats total counts...` | `GET /api/stats` | `off-by-one-boundary` | Loop skips the 10th email; sum is 9 instead of 10. |
| **BUG-07-02** | `PATCH /api/emails/:id/label should reject invalid enum...` | `PATCH /api/emails/:id/label` | `missing-enum-validation` | Server accepts arbitrary strings with `200 OK` instead of `400`. |
| **BUG-07-03** | `PATCH /api/emails/:id/label should trim whitespace...` | `PATCH /api/emails/:id/label` | `missing-sanitization` | Untrimmed whitespace is stored verbatim. |
| **BUG-07-04** | `PATCH /api/emails/:id/assign with non-existent id...` | `PATCH /api/emails/:id/assign` | `wrong-status-code` | Returns `200 OK` with `{}` instead of `404 Not Found`. |
| **BUG-07-05** | `HTML table header and title should have correct spelling...` | `UI` | `wrong-ui-copy-or-label` | Typo "Asignee" in table header and "Labler" in page title. |
| **BUG-07-06** | `onLabelChange must check res.ok...` | `UI` | `missing-ui-feedback-guard` | Green success toast fires unconditionally even on error. |
| **BUG-07-07** | `onAssignChange must send assigneeId...` | `UI` | `state-not-persisted` | Sends `{ assignee }` instead of `{ assigneeId }`; assign fails silently. |
| **BUG-07-08** | `GET /api/emails should combine with AND logic...` | `GET /api/emails` | `wrong-filter-boolean-logic` | Evaluates label and assignee with OR instead of AND. |
| **BUG-07-09** | `GET /api/emails label filter should require exact match...` | `GET /api/emails` | `substring-vs-exact-match` | Substring match `?label=HR` matches `HR_REPLIED`. |
| **BUG-07-10** | `PATCH /api/emails/:id/label with missing label...` | `PATCH /api/emails/:id/label` | `wrong-status-code` | Missing label in body crashes server with `500` instead of `400`. |
| **BUG-07-11** | `PATCH /api/emails/:id/assign reject inactive agent...` | `PATCH /api/emails/:id/assign` | `missing-reference-or-state-check` | Inactive agent `a3` accepted with `200 OK` instead of `400`. |
| **BUG-07-12** | `GET /api/emails should not leak internalRiskNote...` | `GET /api/emails` | `leaks-hidden-field` | Leaks sensitive internal field `internalRiskNote`. |
| **BUG-07-13** | `Table row label dropdown must bind to current email label...` | `UI` | `wrong-dropdown-default-selection` | Dropdown value is never set; defaults to `HR_REPLIED`. |
| **BUG-07-14** | `loadEmails must not swap query parameters...` | `UI` | `ui-filter-not-applied` | Query parameters inverted (label sent as assignee and vice-versa). |
| **BUG-07-15** | `PATCH /api/emails/:id/assign updates should persist...` | `PATCH /api/emails/:id/assign` | `state-not-persisted` | Assignee update returns in response but does not persist. |
| **BUG-07-16** | `PATCH /api/emails/:id/label updates should persist...` | `PATCH /api/emails/:id/label` | `state-not-persisted` | Label update returns in response but does not persist. |
| **BUG-07-17** | `GET /api/emails query params boundary checks...` | `GET /api/emails` | `missing-boundary-check` | Missing boundary validation on query parameters. |
| **BUG-07-19** | `agentOptionsHtml must filter to only offer active agents...` | `UI` | `wrong-filter-boolean-logic` | Inactive agent `a3` displayed as option in dropdown. |
| **BUG-07-21** | `loadStats must map each label to its own count...` | `UI` | `off-by-one-boundary` | Stats count shifted by `+1` index; last label shows 0. |

---

## 🧑‍💻 Author

**Mallela Jithendra**  
Springworks SDET Internship Hackathon Candidate  
Email: mallelajithendra2004@gmail.com
