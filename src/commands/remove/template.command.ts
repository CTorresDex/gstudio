import { TemplateRegistry } from '../../classes/TemplateRegistry.class.ts'

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) throw new Error('Usage: gstudio remove template <alias>')

    const registry = await TemplateRegistry.load()

    await registry.remove(args[0])

    console.log(`Removed ${args[0]}`)
}
