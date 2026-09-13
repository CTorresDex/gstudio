export class ArrayUtils {
    /** Renders a list as a numbered markdown list, indenting each item's continuation lines to align under its number. */
    static numbered(items: string[]): string {
        return items.map((item, index) => `${index + 1}. ${item.replace(/\n/g, '\n   ')}`).join('\n\n')
    }
}
