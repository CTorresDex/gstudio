import { TemplateRegistry } from '../../classes/TemplateRegistry.class.ts'
import { Progress } from '../../classes/Progress.class.ts'

export const help = {
    short: 'Chooses which source a bare template name means',
    long: `Usage: gstudio use template <name> <alias>/<name>

Points a bare name at one provider, for when more than one source provides a
template under the same name.

Arguments:
  <name>           the bare name being decided
  <alias>/<name>   the provider it means from now on`,
}

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined || args[1] === undefined) throw new Error('Usage: gstudio use template <name> <alias>/<name>')

    const registry = await Progress.of('Reading the registry').run(() => TemplateRegistry.load())

    await Progress.of(`Pointing ${args[0]} at ${args[1]}`).run(() => registry.use('template', args[0]!, args[1]!))

    console.log(`The template ${args[0]} now means ${args[1]}`)
}
