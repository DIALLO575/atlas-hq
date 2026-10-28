// A PDF outline can contain a heading without a destination, or a broken reference.
export async function pdfOutlineDestination(pdf, href) {
    try {
        const parsed = JSON.parse(href)
        const dest = typeof parsed === 'string' ? await pdf.getDestination(parsed) : parsed
        if (!Array.isArray(dest) || dest[0] == null) return null
        const index = await pdf.getPageIndex(dest[0])
        return Number.isInteger(index) && index >= 0 && index < pdf.numPages ? [index, null] : null
    } catch {
        return null
    }
}
