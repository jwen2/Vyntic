# Brightwater / Glenmoor Demo Document Manifest

SAMPLE - FICTIONAL, FOR DEMO USE

All documents in this folder are realistic, fictional private-equity fund documents generated for Vyntic demo and workflow testing. No real firm, fund, portfolio company, person, bank, auditor, law firm or investor is represented.

## Install Commands Run

No library installation commands were run. The local environment already had `reportlab` and `openpyxl` available.

If reproducing in a clean Python environment, install the required libraries with:

```bash
python3 -m pip install reportlab openpyxl
```

Generation command used:

```bash
python3 scripts/generate_brightwater_docs.py --run-date 2026-07-22
```

## Consistency Ledger

- GP / Manager: Brightwater Capital Partners, LLC; Chicago; founded 2009; approximately $2.1B AUM; North American industrials and business services.
- Our LP: Glenmoor University Endowment.
- Fund III: Brightwater Capital Partners III, L.P.; 2021 vintage; $850M fund size; European waterfall; 8% preferred return; 20% carry.
- Fund IV: Brightwater Capital Partners IV, L.P.; 2026 vintage; $1.25B target; $1.5B hard cap.
- Glenmoor Fund III Q2 2026 position: $25,000,000 commitment; $18,750,000 paid-in / called; $6,200,000 distributed; $21,400,000 NAV; DPI 0.33x; RVPI 1.14x; TVPI 1.47x.
- Capital Call No. 7: issue date July 22, 2026; due date July 27, 2026; amount $1,875,000; remaining unfunded commitment after call $4,375,000.
- Distribution Notice No. 3: notice date July 22, 2026; pay date August 3, 2026; amount $1,400,000.
- Q2 2026 quarterly report: quarter-end June 30, 2026; report date August 29, 2026.

## Track Record Ledger

| Fund | Vintage | Fund Size | Net IRR | TVPI | DPI | RVPI | Expected Tie |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Fund I | 2011 | $300,000,000 | 18% | 2.10x | 2.10x | 0.00x | Ties |
| Fund II | 2015 | $550,000,000 | 21% | 1.90x | 1.30x | 0.60x | Ties |
| Fund III | 2021 | $850,000,000 | 15% | 1.50x | 0.40x | 0.95x | Planted mismatch: 0.40x + 0.95x = 1.35x, not 1.50x |

## Files and Expected Findings

| Filename | Vyntic token | Workflow / demo exercised | Expected findings |
| --- | --- | --- | --- |
| brightwater_iv_ppm.pdf | ppm | Fund IV selection diligence; terms, team and performance extraction | Lists Daniel Roache as active senior team; includes 50% fee offset, 2.0% GP commitment, 80% no-fault removal threshold, $2.5M organizational expense cap; prior fund summary presents Fund III headline at 1.50x. |
| brightwater_iv_pitchbook.pdf | pitchbook | Marketing claim and track-record validation | Claims top-quartile track record and 2.1x net using fully realized Fund I; lists Daniel Roache as active; shows Fund III at 1.50x. |
| brightwater_track_record.xlsx | track_record | Spreadsheet extraction and cross-checking | Fund III planted mismatch: TVPI 1.50x while DPI 0.40x plus RVPI 0.95x equals 1.35x; Fund I and Fund II ties are correct. |
| brightwater_iv_ddq.pdf | ddq | DDQ inconsistency and ODD workflow | Team / succession answer is evasive and does not disclose Daniel Roache's departure; fees answer says 100% fee offset but LPA provides only 50%; conflicts answer omits Brightwater Securities, LLC; cybersecurity answer lacks SOC 2 and fixed pen-test cadence. |
| brightwater_iv_lpa.pdf | lpa | Fund terms extraction and off-market term detection | Fee offset only 50%; Daniel Roache named as a Key Person; no-fault GP removal requires 80%; GP commitment only 2.0%; recycling for 24 months; organizational expense cap $2,500,000. |
| brightwater_adv_part2a.pdf | form_adv | Regulatory and conflict cross-checking | Discloses affiliated broker-dealer Brightwater Securities, LLC receiving transaction fees; discloses 2023 SEC deficiency letter on expense allocation, remediated; discloses Daniel Roache ceased being an advisory employee effective February 28, 2026. |
| brightwater_valuation_policy.pdf | valuation_policy | ODD valuation governance workflow | Quarterly valuation committee, but Level 3 assets are GP-marked with third-party review only annually. |
| glenmoor_fund_iii_side_letter.pdf | side_letter | Side-letter obligation extraction | Obligations: 10 bps fee reduction; MFN right; pro-rata co-investment offer above $75M equity; quarterly reports within 45 days and audited annuals within 120 days; tobacco / controlled-substance excuse; affiliate transfer consent not unreasonably withheld; annual ESG report. |
| glenmoor_fund_iii_pcap_q2_2026.pdf | capital_account | Monitoring position and fee-compliance workflow | Exact Glenmoor position ties to ledger; management fee allocation reflects 10 bps discount, so side-letter obligation (i) is compliant. |
| brightwater_iii_quarterly_q2_2026.pdf | quarterly_report | Monitoring package extraction and side-letter testing | Report dated August 29, 2026, 60 days after June 30, 2026, breaching 45-day quarterly reporting undertaking; omits portfolio-level ESG metrics, so annual ESG-report obligation is unclear / potential breach; Glenmoor position ties to PCAP and ledger. |
| brightwater_iii_capital_call_07.pdf | capital_call | Capital call extraction and urgency detection | Amount $1,875,000; due July 27, 2026, five calendar days after issue; purpose Project Cardinal; remaining unfunded commitment after call $4,375,000. |
| brightwater_iii_distribution_03.pdf | distribution_notice | Distribution notice extraction | Amount $1,400,000 split $950,000 return of capital and $450,000 gain; pay date August 3, 2026. |
| brightwater_iii_audited_fs_2025.pdf | financial_statements | Audited financial statement extraction and NAV trajectory | Fictional auditor opinion; FY2025 schedule and NAV roll-forward support Fund III trajectory into Q2 2026; Level 3 valuation note. |

## Side-Letter Verdicts Against Q2 2026 Monitoring Pack

| Side-letter obligation | Expected verdict | Reason |
| --- | --- | --- |
| (i) 10 bps management-fee reduction | Compliant | PCAP and quarterly report show Glenmoor fee allocation at 1.90%, equal to 2.00% less 10 bps. |
| (ii) MFN election right | Unclear | Not directly verifiable from Q2 report or notices. |
| (iii) Pro-rata co-investment offer over $75M equity | Unclear | Project Cardinal call does not provide enough information about aggregate equity or co-investment process. |
| (iv) Quarterly reports within 45 days | Breach | Q2 report is dated August 29, 2026, 60 days after June 30, 2026. |
| (v) Tobacco / controlled-substance excuse right | Unclear | No covered investment appears in the Q2 report. |
| (vi) Affiliate transfer consent not unreasonably withheld | Unclear | No transfer request is shown. |
| (vii) Annual ESG report | Unclear / potential breach | Q2 report contains no portfolio-level ESG metrics; annual compliance cannot be fully verified from Q2 alone. |
