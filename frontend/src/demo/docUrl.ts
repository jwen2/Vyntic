import { isDemoMode } from "./mode";

/**
 * Builds the URL DocumentViewer loads into its <iframe>.
 *
 * Iframes bypass fetch, so the demo transport cannot intercept this the way
 * it intercepts every other call. This helper is the one place demo mode has
 * to reach into a component's URL construction.
 *
 * The demo path is flat and keyed by filename alone — corpus filenames are
 * unique, asserted in entities.test.ts. The prefix is /demo-assets/, never
 * /demo/, because /demo is a client route.
 */
/**
 * Spreadsheets are the one filename the demo rewrites. The real backend never
 * serves a workbook to the browser either — it converts it to an HTML table
 * server-side (`routes_deals.py::_excel_to_html_response`) — so handing over
 * the raw .xlsx would be *less* faithful, not more: the browser offers a
 * download instead of rendering the sheet, and the recorded run's track-record
 * citation dead-ends there. The pre-rendered page carries every sheet in the
 * workbook, so unlike the server route there is no sheet to select and no
 * ?sheet parameter.
 */
function demoAssetName(filename: string, isExcel: boolean): string {
  return isExcel ? filename.replace(/\.[^.]+$/, ".html") : filename;
}

export function buildDocumentViewUrl(
  dealId: string,
  filename: string,
  viewToken: string | null,
  isExcel: boolean,
  page: number
): string {
  if (isDemoMode()) {
    return `/demo-assets/docs/${encodeURIComponent(demoAssetName(filename, isExcel))}`;
  }

  const params = new URLSearchParams();
  if (viewToken) params.set("token", viewToken);
  if (isExcel && page > 0) params.set("sheet", String(Math.max(0, page - 1)));
  const query = params.toString();
  return `/api/deals/${encodeURIComponent(dealId)}/documents/${encodeURIComponent(filename)}/view${query ? `?${query}` : ""}`;
}
