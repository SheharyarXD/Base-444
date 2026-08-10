// Central, per-state directory of official verification resources — Phase 2
// "State Verification Guidance". One object literal, keyed by the same
// 2-letter codes as US_STATES (src/lib/usStates.js); adding a future state
// or upgrading an entry to a deeper, more specific page is a one-line edit
// here, not a switch/if-chain scattered across components.
//
// Deliberate design choice: these are each state's *official government
// homepage* for business-entity lookup (nearly always the Secretary of
// State) and for professional/contractor licensing, not a deep-linked
// search-results page. Deep links on .gov sites (specific search tool
// paths, e.g. a state's "bizfile" portal) are verified to change without
// notice and this repo has no way to continuously re-verify 100 such links;
// a homepage is far more stable and a contractor can navigate from it in
// one or two clicks. Spot-checked against live search results for a sample
// of states (CA, TX) while building this file — all entries should still be
// periodically reviewed, the same documented-limitation approach already
// used in verification/providers.js for the same class of "can't be fully
// verified from inside this repo" concern.
//
// `licenseBoardUrl` is the state's general contractor/professional
// licensing or regulation department. A number of states don't operate a
// single statewide contractor license (licensing is done at the county/city
// level, or only certain trades are licensed) — in those cases this still
// points to the most relevant statewide consumer-protection or licensing
// portal, and `licenseBoardLabel` says so rather than implying a single
// state license always exists.
export const STATE_VERIFICATION_LINKS = {
  AL: { name: "Alabama", businessEntitySearchUrl: "https://www.sos.alabama.gov/business-entities", licenseBoardUrl: "https://genconbd.alabama.gov/", licenseBoardLabel: "Alabama Licensing Board for General Contractors" },
  AK: { name: "Alaska", businessEntitySearchUrl: "https://www.commerce.alaska.gov/cbp/main/search/entities", licenseBoardUrl: "https://www.commerce.alaska.gov/web/cbpl/", licenseBoardLabel: "Alaska Division of Corporations, Business and Professional Licensing" },
  AZ: { name: "Arizona", businessEntitySearchUrl: "https://ecorp.azcc.gov/EntitySearch/Index", licenseBoardUrl: "https://roc.az.gov/", licenseBoardLabel: "Arizona Registrar of Contractors" },
  AR: { name: "Arkansas", businessEntitySearchUrl: "https://www.sos.arkansas.gov/business-commercial-services-bcs/business-search", licenseBoardUrl: "https://www.aclb.arkansas.gov/", licenseBoardLabel: "Arkansas Contractors Licensing Board" },
  CA: { name: "California", businessEntitySearchUrl: "https://bizfileonline.sos.ca.gov/search/business", licenseBoardUrl: "https://www.cslb.ca.gov/", licenseBoardLabel: "California Contractors State License Board (CSLB)" },
  CO: { name: "Colorado", businessEntitySearchUrl: "https://www.sos.state.co.us/biz/BusinessEntityCriteriaExt.do", licenseBoardUrl: "https://dpo.colorado.gov/", licenseBoardLabel: "Colorado Division of Professions and Occupations (contractor licensing is local/municipal in CO)" },
  CT: { name: "Connecticut", businessEntitySearchUrl: "https://service.ct.gov/business/s/onlinebusinesssearch", licenseBoardUrl: "https://portal.ct.gov/dcp", licenseBoardLabel: "Connecticut Department of Consumer Protection (Home Improvement/Contractor registration)" },
  DE: { name: "Delaware", businessEntitySearchUrl: "https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx", licenseBoardUrl: "https://revenue.delaware.gov/business-tax-forms/", licenseBoardLabel: "Delaware Division of Revenue (contractor business license)" },
  FL: { name: "Florida", businessEntitySearchUrl: "https://search.sunbiz.org/Inquiry/CorporationSearch/ByName", licenseBoardUrl: "https://www.myfloridalicense.com/", licenseBoardLabel: "Florida DBPR — Construction Industry Licensing Board" },
  GA: { name: "Georgia", businessEntitySearchUrl: "https://ecorp.sos.ga.gov/BusinessSearch", licenseBoardUrl: "https://sos.ga.gov/georgia-board-residential-and-general-contractors", licenseBoardLabel: "Georgia Board of Residential and General Contractors" },
  HI: { name: "Hawaii", businessEntitySearchUrl: "https://hbe.ehawaii.gov/documents/search.html", licenseBoardUrl: "https://cca.hawaii.gov/pvl/boards/contractor/", licenseBoardLabel: "Hawaii Contractors License Board" },
  ID: { name: "Idaho", businessEntitySearchUrl: "https://sosbiz.idaho.gov/search/business", licenseBoardUrl: "https://dbs.idaho.gov/contractors/", licenseBoardLabel: "Idaho Division of Building Safety — Contractor Registration" },
  IL: { name: "Illinois", businessEntitySearchUrl: "https://www.ilsos.gov/corporatellc/", licenseBoardUrl: "https://idfpr.illinois.gov/", licenseBoardLabel: "Illinois Dept. of Financial and Professional Regulation (Roofing licensure statewide; other trades vary locally)" },
  IN: { name: "Indiana", businessEntitySearchUrl: "https://bsd.sos.in.gov/publicbusinesssearch", licenseBoardUrl: "https://www.in.gov/pla/", licenseBoardLabel: "Indiana Professional Licensing Agency" },
  IA: { name: "Iowa", businessEntitySearchUrl: "https://sos.iowa.gov/search/business/search.aspx", licenseBoardUrl: "https://iwd.iowa.gov/contractors", licenseBoardLabel: "Iowa Workforce Development — Contractor Registration" },
  KS: { name: "Kansas", businessEntitySearchUrl: "https://www.sos.ks.gov/eforms/BusinessEntitySearch/Search.aspx", licenseBoardUrl: "https://www.kansas.gov/", licenseBoardLabel: "Kansas.gov business licensing portal (contractor licensing is local in KS)" },
  KY: { name: "Kentucky", businessEntitySearchUrl: "https://web.sos.ky.gov/ftshow/(S(0))/default.aspx", licenseBoardUrl: "https://hbc.ky.gov/", licenseBoardLabel: "Kentucky Housing, Buildings and Construction" },
  LA: { name: "Louisiana", businessEntitySearchUrl: "https://coraweb.sos.la.gov/CommercialSearch/CommercialSearch.aspx", licenseBoardUrl: "https://lslbc.louisiana.gov/", licenseBoardLabel: "Louisiana State Licensing Board for Contractors" },
  ME: { name: "Maine", businessEntitySearchUrl: "https://icrs.informe.org/nei-sos-icrs/ICRS", licenseBoardUrl: "https://www.maine.gov/pfr/professionallicensing/", licenseBoardLabel: "Maine Office of Professional and Occupational Regulation" },
  MD: { name: "Maryland", businessEntitySearchUrl: "https://egov.maryland.gov/BusinessExpress/EntitySearch", licenseBoardUrl: "https://www.dllr.state.md.us/license/mhic/", licenseBoardLabel: "Maryland Home Improvement Commission (MHIC)" },
  MA: { name: "Massachusetts", businessEntitySearchUrl: "https://corp.sec.state.ma.us/corpweb/CorpSearch/CorpSearch.aspx", licenseBoardUrl: "https://www.mass.gov/orgs/board-of-building-regulations-and-standards", licenseBoardLabel: "Massachusetts Board of Building Regulations and Standards (CSL)" },
  MI: { name: "Michigan", businessEntitySearchUrl: "https://cofs.lara.state.mi.us/SearchApi/Search/Search", licenseBoardUrl: "https://www.michigan.gov/lara/bureau-list/bcc", licenseBoardLabel: "Michigan Bureau of Construction Codes — Builders License" },
  MN: { name: "Minnesota", businessEntitySearchUrl: "https://mblsportal.sos.state.mn.us/Business/Search", licenseBoardUrl: "https://www.dli.mn.gov/business/licensing", licenseBoardLabel: "Minnesota Dept. of Labor and Industry — Contractor Licensing" },
  MS: { name: "Mississippi", businessEntitySearchUrl: "https://www.sos.ms.gov/business-services", licenseBoardUrl: "https://www.msboc.us/", licenseBoardLabel: "Mississippi State Board of Contractors" },
  MO: { name: "Missouri", businessEntitySearchUrl: "https://bsd.sos.mo.gov/BusinessEntity/BESearch.aspx", licenseBoardUrl: "https://pr.mo.gov/", licenseBoardLabel: "Missouri Division of Professional Registration (contractor licensing is local in MO)" },
  MT: { name: "Montana", businessEntitySearchUrl: "https://biz.sosmt.gov/search/business", licenseBoardUrl: "https://boi.mt.gov/Contractor-Registration", licenseBoardLabel: "Montana Dept. of Labor & Industry — Contractor Registration" },
  NE: { name: "Nebraska", businessEntitySearchUrl: "https://www.nebraska.gov/sos/corp/corpsearch.cgi", licenseBoardUrl: "https://dol.nebraska.gov/ContractorRegistration", licenseBoardLabel: "Nebraska Dept. of Labor — Contractor Registration" },
  NV: { name: "Nevada", businessEntitySearchUrl: "https://esos.nv.gov/EntitySearch/OnlineEntitySearch", licenseBoardUrl: "https://www.nvcontractorsboard.com/", licenseBoardLabel: "Nevada State Contractors Board" },
  NH: { name: "New Hampshire", businessEntitySearchUrl: "https://quickstart.sos.nh.gov/online/BusinessInquire", licenseBoardUrl: "https://www.oplc.nh.gov/", licenseBoardLabel: "NH Office of Professional Licensure and Certification (no general contractor license in NH)" },
  NJ: { name: "New Jersey", businessEntitySearchUrl: "https://www.njportal.com/DOR/BusinessNameSearch/", licenseBoardUrl: "https://www.njconsumeraffairs.gov/hic/", licenseBoardLabel: "NJ Home Improvement Contractor Registration" },
  NM: { name: "New Mexico", businessEntitySearchUrl: "https://portal.sos.state.nm.us/BFS/online/CorporationBusinessSearch", licenseBoardUrl: "https://www.rld.nm.gov/construction-industries/", licenseBoardLabel: "New Mexico Construction Industries Division" },
  NY: { name: "New York", businessEntitySearchUrl: "https://apps.dos.ny.gov/publicInquiry/", licenseBoardUrl: "https://dos.ny.gov/licensing", licenseBoardLabel: "NY Division of Licensing Services (contractor licensing is local, e.g. NYC DCWP, elsewhere in NY)" },
  NC: { name: "North Carolina", businessEntitySearchUrl: "https://www.sosnc.gov/online_services/search/by_title/_Business_Registration", licenseBoardUrl: "https://www.nclbgc.org/", licenseBoardLabel: "NC Licensing Board for General Contractors" },
  ND: { name: "North Dakota", businessEntitySearchUrl: "https://firststop.sos.nd.gov/search/business", licenseBoardUrl: "https://www.sos.nd.gov/business/business-licensing/contractor-license", licenseBoardLabel: "North Dakota Secretary of State — Contractor License" },
  OH: { name: "Ohio", businessEntitySearchUrl: "https://businesssearch.ohiosos.gov/", licenseBoardUrl: "https://com.ohio.gov/divisions-and-programs/industrial-compliance/construction-industry-licensing", licenseBoardLabel: "Ohio Construction Industry Licensing Board (OCILB)" },
  OK: { name: "Oklahoma", businessEntitySearchUrl: "https://www.sos.ok.gov/corp/corpInquiryFind.aspx", licenseBoardUrl: "https://cib.ok.gov/", licenseBoardLabel: "Oklahoma Construction Industries Board" },
  OR: { name: "Oregon", businessEntitySearchUrl: "https://sos.oregon.gov/business/Pages/find.aspx", licenseBoardUrl: "https://www.oregon.gov/ccb/", licenseBoardLabel: "Oregon Construction Contractors Board (CCB)" },
  PA: { name: "Pennsylvania", businessEntitySearchUrl: "https://file.dos.pa.gov/search/business", licenseBoardUrl: "https://www.attorneygeneral.gov/protect-yourself/home-improvement-contractor-registration/", licenseBoardLabel: "PA Home Improvement Contractor (HIC) Registration" },
  RI: { name: "Rhode Island", businessEntitySearchUrl: "https://ori.sos.ri.gov/Business/Search", licenseBoardUrl: "https://crb.ri.gov/", licenseBoardLabel: "Rhode Island Contractors' Registration Board" },
  SC: { name: "South Carolina", businessEntitySearchUrl: "https://businessfilings.sc.gov/BusinessFiling/Entity/Search", licenseBoardUrl: "https://llr.sc.gov/con/", licenseBoardLabel: "SC Licensing Board for Contractors" },
  SD: { name: "South Dakota", businessEntitySearchUrl: "https://sosenterprise.sd.gov/BusinessServices/Business/FilingSearch.aspx", licenseBoardUrl: "https://dlr.sd.gov/bdc/", licenseBoardLabel: "SD Board of Technical Professions / local licensing" },
  TN: { name: "Tennessee", businessEntitySearchUrl: "https://tnbear.tn.gov/ECommerce/RequestSearch.aspx", licenseBoardUrl: "https://www.tn.gov/commerce/regboards/contractors.html", licenseBoardLabel: "Tennessee Board for Licensing Contractors" },
  TX: { name: "Texas", businessEntitySearchUrl: "https://www.sos.texas.gov/corp/searches.shtml", licenseBoardUrl: "https://www.tdlr.texas.gov/", licenseBoardLabel: "Texas Dept. of Licensing and Regulation (TX has no general contractor license; specific trades are licensed)" },
  UT: { name: "Utah", businessEntitySearchUrl: "https://secure.utah.gov/bes/", licenseBoardUrl: "https://dopl.utah.gov/contractor/", licenseBoardLabel: "Utah Division of Professional Licensing — Contractors" },
  VT: { name: "Vermont", businessEntitySearchUrl: "https://bizfilings.vermont.gov/online/BusinessInquire/", licenseBoardUrl: "https://sos.vermont.gov/opr/", licenseBoardLabel: "Vermont Office of Professional Regulation (no general contractor license in VT)" },
  VA: { name: "Virginia", businessEntitySearchUrl: "https://cis.scc.virginia.gov/EntitySearch/Index", licenseBoardUrl: "https://www.dpor.virginia.gov/", licenseBoardLabel: "Virginia DPOR — Board for Contractors" },
  WA: { name: "Washington", businessEntitySearchUrl: "https://ccfs.sos.wa.gov/#/BusinessSearch", licenseBoardUrl: "https://lni.wa.gov/licensing-permits/contractors/", licenseBoardLabel: "Washington L&I — Contractor Registration" },
  WV: { name: "West Virginia", businessEntitySearchUrl: "https://apps.sos.wv.gov/business/corporations/", licenseBoardUrl: "https://wvlicensing.wv.gov/", licenseBoardLabel: "WV Contractor Licensing Board" },
  WI: { name: "Wisconsin", businessEntitySearchUrl: "https://www.wdfi.org/apps/CorpSearch/Search.aspx", licenseBoardUrl: "https://dsps.wi.gov/Pages/Professions/DwellingContractor/Default.aspx", licenseBoardLabel: "WI Dept. of Safety and Professional Services — Dwelling Contractor" },
  WY: { name: "Wyoming", businessEntitySearchUrl: "https://wyobiz.wyo.gov/Business/FilingSearch.aspx", licenseBoardUrl: "https://wyo.gov/", licenseBoardLabel: "Wyoming.gov licensing portal (no statewide general contractor license in WY)" },
};

export function getStateVerificationLinks(stateCode) {
  return STATE_VERIFICATION_LINKS[stateCode] || null;
}
