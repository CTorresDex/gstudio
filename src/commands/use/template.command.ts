import { TemplateRegistry } from '../../classes/TemplateRegistry.class.ts'

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined || args[1] === undefined) throw new Error('Usage: gstudio use template <name> <alias>/<name>')

    const registry = await TemplateRegistry.load()

    await registry.use(args[0], args[1])

    console.log(`${args[0]} now means ${args[1]}`)
}
