export class StringUtils {
    /** Strips leading blank lines and trailing whitespace, then removes the common indentation from every line. */
    static dedent(text: string): string {
        const lines = text.replace(/^\n+|\s+$/g, '').split('\n')
        const widths = lines.filter((line) => line.trim() !== '').map((line) => line.match(/^\s*/)?.[0].length ?? 0)
        const indent = widths.length > 0 ? Math.min(...widths) : 0

        return lines.map((line) => line.slice(indent)).join('\n')
    }
}
