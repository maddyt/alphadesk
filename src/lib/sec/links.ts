/** Folder of a filing on EDGAR, e.g. https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/ */
export function filingUrl(cik: string, accn: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn.replace(/-/g, '')}/`;
}

/** Every reported value of one XBRL tag for the company (SEC companyconcept endpoint). */
export function conceptUrl(cik: string, taxonomy: string, tag: string): string {
  return `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/${taxonomy}/${tag}.json`;
}

/** EDGAR full-text viewer for the company's filings. */
export function companyFilingsUrl(cik: string): string {
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-K&dateb=&owner=include&count=40`;
}
