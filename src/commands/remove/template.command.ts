import { TemplateRegistry } from '../../classes/TemplateRegistry.class.ts'
import { Progress } from '../../classes/Progress.class.ts'

export const help = {
    short: 'Drops a source from the registry',
    long: `Usage: gstudio remove template <alias>

Unregisters the source and everything it provided. Nothing already laid down in a
project is touched.

Arguments:
  <alias>      the alias the source was installed under`,
}

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) throw new Error('Usage: gstudio remove template <alias>')

    const registry = await Progress.of('Reading the registry').run(() => TemplateRegistry.load())

    await Progress.of(`Dropping ${args[0]} from the registry`).run(() => registry.remove(args[0]!))

    console.log(`Removed ${args[0]}`)
}
