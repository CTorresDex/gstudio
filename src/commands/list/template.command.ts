import { TemplateSource } from '../../classes/TemplateSource.class.ts'
import { TemplateRegistry } from '../../classes/TemplateRegistry.class.ts'
import { Progress } from '../../classes/Progress.class.ts'

export const help = {
    short: 'Lists every installed source and the templates it provides',
    long: `Usage: gstudio list template [<search-term>]

Prints every source in the registry, where it came from and what it is read at,
then the templates it provides and which name each answers to.

Arguments:
  <search-term>  keep only the sources and templates whose name contains it`,
}

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    const registry = await Progress.of('Reading the registry').run(() => TemplateRegistry.load())
    const aliases = Object.keys(registry.sources).filter((alias) => args[0] === undefined || alias.includes(args[0]) || registry.sources[alias]!.templates.some((name) => name.includes(args[0]!))).sort()

    if (aliases.length === 0) return console.log(args[0] === undefined ? 'No templates installed. Install one with: gstudio install template <git-url>' : `No installed source matches ${args[0]}`)

    for (const alias of aliases) {
        console.log(`${alias}  ${registry.sources[alias]!.url}  ${registry.sources[alias]!.sha === null ? 'linked' : `${registry.sources[alias]!.ref ?? 'HEAD'} at ${TemplateSource.commit(registry.sources[alias]!.sha)}`}`)

        for (const name of registry.sources[alias]!.templates)
            console.log(`  ${alias}/${name}${registry.providers('template', name).length > 1 ? registry.shortcuts.template[name] === `${alias}/${name}` ? `  (${name})` : '  (ambiguous)' : `  (${name})`}`)
    }
}
