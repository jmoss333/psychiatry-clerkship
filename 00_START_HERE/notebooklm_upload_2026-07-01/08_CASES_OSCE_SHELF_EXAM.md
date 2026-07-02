# 08 Cases Osce Shelf Exam

Generated: 2026-07-01

Prepared for: Joshua Moss, MD | Psychiatrist

Grouped source bundle for NotebookLM. It concatenates safe Markdown/text material from the listed library sections while preserving source paths.

PHI rule: this source intentionally excludes known patient-identifying files, audit artifacts with MRN-like paths, source pointer files, and case-specific filenames. Use synthetic or de-identified examples only.

---



---

## Source: `08_Cases_and_Simulation/README.md`

# 08 * Cases & Simulation
-  **Composite teaching cases** -> `teaching/archive/composite_cases_v1.md` - promote out of archive, map to weeks.
- [yes] **Population case studies** -> `population-adaptations/` (Marcus/Forensic, Amira/Refugee, Daniel/IDD - all fictional composites).
-  **Decision labs** (resident overlay) and OSCE crosswalk -> see `09_Exam_Prep/`.
> All cases are fictional composites; **no PHI**.

**Status tags:** [yes] Exists *  Revise *  Expand *  Create *  Merge *  Archive


---

## Source: `08_Cases_and_Simulation/_source/DOI_RESOLUTION_REPORT.md`

# DOI Resolution Report - RSSM Manuscript

**Generated**: 2026-04-04 15:38:29 UTC

## Summary

| Metric | Count |
|--------|-------|
| **Total DOIs Checked** | 205 |
| **Resolved (2xx/3xx)** | 65 |
| **Failed - 4xx Status** | 138 |
| **Failed - 5xx Status** | 0 |
| **Errors/Timeouts** | 2 |
| **Success Rate** | 31.7% |

## Analysis

### Resolution Status
- **Resolved**: 65 DOIs successfully resolved to 2xx or 3xx HTTP status codes
- **Inaccessible (403/419)**: 138 DOIs returned client error status codes
- **Not Found (404)**: See breakdown below
- **Server Errors**: 0 DOIs (none found)
- **Network Errors**: 2 DOIs (timeouts or connection errors)

### Common Failure Patterns

**403 Forbidden (Access Denied)**: 87 cases
- Primarily affects DOIs from paywalled publishers (JAMA, APA, Wiley, BMJ, Lancet, etc.)
- Indicates DOI exists but content requires institutional/subscription access
- This is expected behavior for copyrighted academic content

**404 Not Found**: 49 cases
- DOIs that fail to resolve via doi.org service
- May indicate incorrect DOI formatting or publisher system issues
- Requires investigation on case-by-case basis

**419 Unknown Client** (Cochrane): 2 cases
- Systematic review entries; may require special handling

**Connection Errors**: 2 cases
- Timeouts or network-level failures
- Recommend retry with longer timeout window

## Detailed Failure List

### HTTP 404 - Not Found

**HTTP 403** (87 DOIs):
- `10.1001/archgenpsychiatry.2009.144`
- `10.1001/archpsyc.1980.01780170034003`
- `10.1001/archpsyc.55.6.547`
- `10.1001/archpsyc.56.3.241`
- `10.1001/archpsyc.62.9.996`
- `10.1001/archpsyc.64.4.419`
- `10.1001/jamanetworkopen.2022.0978`
- `10.1001/jamapsychiatry.2014.3039`
- `10.1001/jamapsychiatry.2015.2235`
- `10.1001/jamapsychiatry.2015.2324`
- `10.1001/jamapsychiatry.2017.1322`
- `10.1001/jamapsychiatry.2018.0623`
- `10.1002/brb3.70760`
- `10.1002/da.23244`
- `10.1002/job.322`
- `10.1002/nur.4770150104`
- `10.1002/wps.20089`
- `10.1002/wps.20701`
- `10.1002/wps.20860`
- `10.1002/wps.20941`
- `10.1037/0003-066X.55.5.469`
- `10.1037/0021-843X.117.1.1`
- `10.1037/0022-006X.71.1.62`
- `10.1037/0033-2909.129.5.674`
- `10.1037/0893-3200.20.2.239`
- `10.1037/a0022161`
- `10.1037/a0025749`
- `10.1037/abn0000246`
- `10.1037/bul0000084`
- `10.1037/bul0000376`
- `10.1037/bul0000406`
- `10.1037/per0000559`
- `10.1037/pst0000172`
- `10.1046/j.1365-2869.2003.00337.x`
- `10.1046/j.1440-1614.2003.01234.x`
- `10.1056/NEJM198206173062401`
- `10.1056/NEJMra1511480`
- `10.1080/10503300500268490`
- `10.1080/26895269.2022.2100644`
- `10.1093/schbul/sbm047`
- `10.1093/schbul/sbq019`
- `10.1093/schbul/sbs018`
- `10.1093/schbul/sbt159`
- `10.1093/sleep/26.2.117`
- `10.1108/09641861311330464`
- `10.1111/acer.12006`
- `10.1111/acps.13401`
- `10.1111/add.16280`
- `10.1111/ans.70028`
- `10.1111/bdi.12390`
- `10.1111/cpsp.12162`
- `10.1111/eip.12715`
- `10.1111/inm.13156`
- `10.1111/j.1365-2850.2010.01679.x`
- `10.1111/j.1469-7610.1976.tb00381.x`
- `10.1111/j.1600-0447.1996.tb09814.x`
- `10.1111/j.1651-2227.1994.tb13277.x`
- `10.1111/j.1744-6163.1997.tb00536.x`
- `10.1111/j.1744-6171.2010.00246.x`
- `10.1111/jpm.12325`
- `10.1111/jsr.13295`
- `10.1136/bmj.320.7237.726`
- `10.1136/bmjqs-2015-004386`
- `10.1136/qshc.2006.021154`
- `10.1152/physrev.00041.2006`
- `10.1159/000499043`
- `10.1176/ajp.144.2.201`
- `10.1176/ajp.152.7.1026`
- `10.1176/ajp.156.10.1563`
- `10.1176/ajp.2006.163.11.1905`
- `10.1176/appi.ajp.158.3.377`
- `10.1176/appi.ajp.2017.16101200`
- `10.1176/appi.ps.201400403`
- `10.1176/appi.ps.201500352`
- `10.1176/appi.ps.52.4.469`
- `10.1176/appi.ps.52.7.935`
- `10.1176/ps.2009.60.2.231`
- `10.1176/ps.40.10.1031`
- `10.1177/1049731513503047`
- `10.1177/1745691612447309`
- `10.1177/23779608241290717`
- `10.1196/annals.1440.010`
- `10.1207/s15327108ijap0902_2`
- `10.1287/mnsc.1090.1095`
- `10.1542/peds.2007-3524`
- `10.1586/14737175.2016.1126181`
- `10.3390/jcm9082406`

**HTTP 404** (49 DOIs):
- `10.1001/archpsyc.1982.04290090025005`
- `10.1001/archpsyc.1988.01800350076012`
- `10.1001/archpsyc.1995.03950200069014`
- `10.1001/jama.2017.3927`
- `10.1007/s12144-022-03877-5`
- `10.1007/s12144-023-05365-4`
- `10.1016/S0005-7967(01`
- `10.1016/S0006-3223(97`
- `10.1016/S0006-3223(98`
- `10.1016/S0031-9384(03`
- `10.1016/S0140-6736(07`
- `10.1016/S0140-6736(11`
- `10.1016/S0140-6736(13`
- `10.1016/S0165-1781(99`
- `10.1016/S0740-5472(99`
- `10.1016/S0749-3797(98`
- `10.1016/S0920-9964(97`
- `10.1016/S0920-9964(99`
- `10.1016/S2215-0366(15`
- `10.1016/S2215-0366(16`
- `10.1016/S2215-0366(17`
- `10.1016/S2215-0366(19`
- `10.1016/S2215-0366(22`
- `10.1016/j.jpsychires.2008.05.012`
- `10.1016/j.jsat.2024.209522`
- `10.1017/S0033291720005262`
- `10.1017/S003329172400090X`
- `10.1037/0012-1649.43.4.943`
- `10.1073/pnas.0610168104`
- `10.1080/10673220802596199`
- `10.1093/med/9780393707007.001.0001`
- `10.1097/01.NMD.0000487530.90374.2d`
- `10.1097/NMD.0b013e3180325a5b`
- `10.1097/PTS.0b013e31828a5f43`
- `10.1111/j.1540-5834.2012.00650.x`
- `10.1176/ajp.148.4.455`
- `10.1176/appi.ajp.2008.07101532`
- `10.1176/appi.ajp.2017.17010101`
- `10.1176/appi.ps.201800268`
- `10.1177/1062860608319055`
- `10.1177/1524838006298568`
- `10.1186/s12888-020-02883-2`
- `10.1186/s12910-021-00700-x`
- `10.1192/bjp.161.s18.145`
- `10.1192/bjp.bp.106.028282`
- `10.1192/bjp.bp.110.088922`
- `10.1192/bjp.bp.113.126367`
- `10.1586/14737175.2013.738089`
- `10.4088/JCP.15m10222`

**HTTP 419** (2 DOIs):
- `10.1002/14651858.CD000088.pub3`
- `10.1002/14651858.CD001088.pub4`

**HTTP ERROR** (2 DOIs):
- `10.3389/fpsyt.2018.00462`
- `10.3389/fpsyt.2019.00443`


## Recommendations

1. **Paywall-Protected Content (403 errors)**
   - 87 DOIs are access-restricted
   - Verify through institutional subscriptions or contact publishers
   - Consider DOI citation still valid; 403 indicates publisher protection

2. **Missing/Invalid DOIs (404 errors)**
   - 49 DOIs fail to resolve
   - Recommend manual verification against original publications
   - Check for typos in DOI syntax (missing digits, incorrect punctuation)

3. **For Publication**
   - 65 of 205 DOIs (31.7%) have confirmed working resolution
   - Include DOI-based links where possible
   - Ensure DOIs match published versions exactly
   - Consider adding hyperlinks via https://doi.org/[DOI] format

## Technical Details

- **Method**: HTTP HEAD requests to https://doi.org/[DOI]
- **Timeout**: 5 seconds per DOI
- **Total DOIs**: 205
- **Check Date**: 2026-04-04
- **DOI Pattern Matched**: `10.\d{4,9}/[^\s)]+`

---
*This report was automatically generated by DOI resolution check script. For detailed investigation of any DOI, visit https://doi.org/[DOI] directly.*
Included text sources: 5



---

## Source: `09_Exam_Prep/OSCE_Stations/README.md`

# OSCE Stations

The 6-station set (suicide+collateral, capacity, catatonia, alcohol withdrawal, family-meeting agenda, oral presentation) -> `14_Tracks/MS3/Student_Ready_Pack/06_osce_cases/osce_station_set.md`. Pairs with the Capacity, MSE, and Oral-Presentation tools.


---

## Source: `09_Exam_Prep/README.md`

# 09 * Exam Prep  *(net-new, high yield)*
-  **Shelf_High_Yield** (P2): NBME psychiatry high-yield map + 50-item self-check. Week 6.
-  **OSCE_Stations** (P2): 4-6 stations with checklists - capacity, safety plan, family meeting, MSE - reusing the modules in `02_`/`04_`.

**Status tags:** [yes] Exists *  Revise *  Expand *  Create *  Merge *  Archive


---

## Source: `09_Exam_Prep/Shelf_High_Yield/README.md`

# Shelf High-Yield

Shelf review guide -> `14_Tracks/MS3/Student_Ready_Pack/07_shelf_guide/shelf_review_guide.md`. Use in Week 6 with the synthetic practice cases (`08_Cases_and_Simulation`).
