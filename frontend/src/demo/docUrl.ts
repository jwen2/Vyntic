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
export function buildDocumentViewUrl(
  dealId: string,
  filename: string,
  viewToken: string | null,
  isExcel: boolean,
  page: number
): string {
  const params = new URLSearchParams();

  if (isDemoMode()) {
    if (isExcel && page > 0) params.set("sheet", String(Math.max(0, page - 1)));
    const query = params.toString();
    return `/demo-assets/docs/${encodeURIComponent(filename)}${query ? `?${query}` : ""}`;
  }

  if (viewToken) params.set("token", viewToken);
  if (isExcel && page > 0) params.set("sheet", String(Math.max(0, page - 1)));
  const query = params.toString();
  return `/api/deals/${encodeURIComponent(dealId)}/documents/${encodeURIComponent(filename)}/view${query ? `?${query}` : ""}`;
}
